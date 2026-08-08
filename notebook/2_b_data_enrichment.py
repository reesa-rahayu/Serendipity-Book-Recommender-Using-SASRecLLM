import pandas as pd
import csv
import requests
import time
import glob
from urllib.parse import quote
from dotenv import load_dotenv
import os
import aiohttp
import asyncio
from tqdm import tqdm
import json
import difflib
import sqlite3
import sys
VERSION = "4"

load_dotenv()
API_KEYS = [
    "",
    os.getenv("GOOGLE_API_KEY_1"),
    os.getenv("GOOGLE_API_KEY_2"),
    os.getenv("GOOGLE_API_KEY_3"),
    os.getenv("GOOGLE_API_KEY_4"),
    os.getenv("GOOGLE_API_KEY_5"),
    os.getenv("GOOGLE_API_KEY_6"),
    os.getenv("GOOGLE_API_KEY_7"),
    os.getenv("GOOGLE_API_KEY_8"),
    os.getenv("GOOGLE_API_KEY_9"),
    os.getenv("GOOGLE_API_KEY_10"),
    os.getenv("GOOGLE_API_KEY_11"),
    os.getenv("GOOGLE_API_KEY_12"),
    os.getenv("GOOGLE_API_KEY_13"),
    os.getenv("GOOGLE_API_KEY_14"),
    os.getenv("GOOGLE_API_KEY_15"),
    os.getenv("GOOGLE_API_KEY_16"),
    os.getenv("GOOGLE_API_KEY_17"),
]
current_key_index = 0

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
    )
}

class QuotaExceededError(Exception):
    """Custom exception for Google Books API Quota limit."""
    pass


# Function to save cache to disk
# DB_FILE = f"google_books_cache_{VERSION}.db"
DB_FILE = f"google_books_cache_v3.db"
conn = sqlite3.connect(DB_FILE)
cursor = conn.cursor()
cursor.execute("""
CREATE TABLE IF NOT EXISTS books_cache (
    key TEXT PRIMARY KEY,
    title TEXT,
    author TEXT,
    raw_isbn TEXT,
    query TEXT,
    confidence REAL,
    volume_info TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")
conn.commit()

def get_from_cache(key):
    cursor.execute("SELECT volume_info, confidence FROM books_cache WHERE key=?", (key,))
    row = cursor.fetchone()
    if row:
        volume_info_json, confidence = row
        volume_info = json.loads(volume_info_json) if volume_info_json else None
        return volume_info, confidence
    return None

def save_to_cache(key, title, author, raw_isbn, query, confidence, volume_info_dict):
    try:
        # Ubah dictionary menjadi string JSON agar bisa disimpan di kolom TEXT
        volume_info_json = json.dumps(volume_info_dict) if volume_info_dict else None
        
        cursor.execute("""
            INSERT OR REPLACE INTO books_cache 
            (key, title, author, raw_isbn, query, confidence, volume_info)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (key, title, author, raw_isbn, query, confidence, volume_info_json))
        conn.commit()
    except sqlite3.OperationalError as e:
        print(f"SQLite error: {e}. Retrying...")
        import time; time.sleep(5)
        # Re-attempt save
        save_to_cache(key, title, author, raw_isbn, query, confidence, volume_info_dict)

def author_matches(api_authors, target_author, target_author_last_name):
    # Ensure api_authors is a list and target exists
    if not api_authors or not isinstance(api_authors, list):
        return False
    
    if not target_author or pd.isna(target_author):
        return False

    target_author = str(target_author).lower().strip()
    target_author_last_name = str(target_author_last_name).lower().strip()

    for author in api_authors:
        author_clean = str(author).lower().strip()

        # Full name match
        if target_author == author_clean or target_author in author_clean:
            return True

        # Last name match
        author_parts = author_clean.split()
        if author_parts and author_parts[-1] == target_author_last_name:
            return True

    return False

def title_similarity(a, b):
    return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()

def extract_data(item, target_title):
    volume_info = item.get('volumeInfo', {})
    description = volume_info.get('description')
    isbn_list = volume_info.get('industryIdentifiers', [])
    isbn_10 = None
    isbn_13 = None
    
    isbn_list = volume_info.get('industryIdentifiers', [])
    for identifier in isbn_list:
        if identifier['type'] == 'ISBN_10':
            isbn_10 = identifier['identifier']
        elif identifier['type'] == 'ISBN_13':
            isbn_13 = identifier['identifier']

    if description:
        print(f"Found description for '{target_title}': {description[:100]}...")
    
    return description, isbn_10, isbn_13

import re
    
def search_items(items, target_title, target_author, first_author_last_name, raw_isbn=None):
    best_match = None
    best_score = 0

    target_isbn_clean = re.sub(r'\D', '', str(raw_isbn)) if pd.notna(raw_isbn) else None
    
    has_author = pd.notna(target_author) and str(target_author).lower().strip() not in ['', 'nan', 'none']
    target_title_clean = str(target_title).lower().strip()

    for item in items:
        volume_info = item.get("volumeInfo", {})
        api_title = volume_info.get("title", "").lower().strip()
        api_authors = volume_info.get("authors", []) # This is a list
        industry_ids = volume_info.get("industryIdentifiers", [])

        if target_isbn_clean and industry_ids:
            for identifier in industry_ids:
                api_isbn = re.sub(r'\D', '', identifier.get("identifier", ""))
                if api_isbn == target_isbn_clean:
                    print(f"ISBN Match Found: {target_title} ({api_isbn})")
                    description, isbn_10, isbn_13 = extract_data(item, target_title)
                    return description, isbn_10, isbn_13, 1.0, volume_info

        score = title_similarity(api_title, target_title_clean)
        
        if has_author:
            if author_matches(api_authors, target_author, first_author_last_name):
                score += 0.1 # Boost score for author match
            else:
                score -= 0.2 

        if score > best_score:
            best_score = score
            best_match = item
    if best_match and best_score > 0.8:
        v_info = best_match.get('volumeInfo', {})
        description, isbn_10, isbn_13 = extract_data(best_match, target_title)
        return description, isbn_10, isbn_13, min(best_score, 1.0), v_info

    return None, None, None, 0, None

max_results = 10
REQUESTS_PER_SECOND = 1
MIN_DELAY = 1 / REQUESTS_PER_SECOND
rate_lock = asyncio.Lock()
last_request_time = 0

async def fetch_url_async(session, q):
    global last_request_time, current_key_index
    
    async with rate_lock:
        now = time.time()
        elapsed = now - last_request_time
        if elapsed < MIN_DELAY:
            await asyncio.sleep(MIN_DELAY - elapsed)
        last_request_time = time.time()

    while current_key_index < len(API_KEYS):
        active_key = API_KEYS[current_key_index]
        
        url = f"https://www.googleapis.com/books/v1/volumes?q={q}&maxResults={max_results}&key={active_key}"
        print(f"Fetching URL with Key {current_key_index}: {url}")

        try:
            async with session.get(url, headers=HEADERS, timeout=10) as response:
                if response.status == 429:
                    print(f"!!! Key {current_key_index} Quota Exceeded. Switching keys... !!!")
                    current_key_index += 1
                    if current_key_index >= len(API_KEYS):
                        print("!!! ALL API KEYS EXHAUSTED !!!")
                        raise QuotaExceededError("All Google Books API keys reached their limit.")
                    
                    await asyncio.sleep(1)
                    continue

                response.raise_for_status()
                data = await response.json()
                return data.get('items', [])

        except QuotaExceededError:
            raise
        except Exception as e:
            print(f"Request failed: {e}")
            return []
            
    return []

BATCH_COMMIT_SIZE = 100
request_counter = 0

async def fetch_data_async(session, title, author, author_last_name, raw_isbn, semaphore):
    async with semaphore:
        global request_counter

        title = str(title).lower().strip() if pd.notna(title) else ""
        author = str(author).lower().strip() if pd.notna(author) else ""
        author_last_name = str(author_last_name).lower().strip() if pd.notna(author_last_name) else ""

        key = f"{title}|{author}|{raw_isbn}"

        # Check SQLite cache
        cached = get_from_cache(key)
        if cached:
            v_info, confidence = cached
            if v_info:
                description, isbn_10, isbn_13 = extract_data({'volumeInfo': v_info}, title)
            else:
                description, isbn_10, isbn_13 = None, None, None
            print(f"Cache hit for '{title}' by '{author}' with confidence {confidence:.2f}")
            return description, isbn_10, isbn_13
        
        queries = []

        if pd.notna(raw_isbn) and str(raw_isbn).strip() and str(raw_isbn).lower() != 'nan':
            clean_isbn = str(raw_isbn).split('.')[0].strip()
            queries.append(f"isbn:{clean_isbn}") #search bassed on isbn

        queries.append(f"{quote(title)}+inauthor:{quote(author)}") #search based on title and author
        queries.append(quote(title)) #search based on title

        items = []
        query = ""

        for q in queries:
            query = q
            items = await fetch_url_async(session, q)
            if items:
                break
        
        description, isbn_10, isbn_13, confidence, v_info = search_items(items, title, author, author_last_name, raw_isbn)
    
        if description is None:
            with open(f"failed_titles_{VERSION}.csv", "a", encoding="utf-8", newline='') as f:
                f.write(f"{title};{author}; {confidence}; {query}; \n")

        # Save result
        save_to_cache(key, title, author, raw_isbn, query, confidence, v_info)
        if confidence < 0.85 and confidence > 0:
            with open(f"low_confidence_log_{VERSION}.csv", "a", encoding="utf-8", newline='') as f:
                f.write(f"{title};{author};{confidence};{query};\n")

        request_counter += 1
        if request_counter % BATCH_COMMIT_SIZE == 0:
            print("Committing batch to SQLite...")
            conn.commit()

        return description, isbn_10, isbn_13

from pathlib import Path

path = f"data/book_data_chunks/enriched_v{VERSION}"
Path(path).mkdir(parents=True, exist_ok=True)

def save_enriched_chunk(df, chunk_num):
    output_path = f"{path}/enriched_chunk_{chunk_num}.csv"
    df.to_csv(output_path, index=False)
    print(f"Saved enriched chunk {chunk_num} to {output_path}")

async def process_chunk_async(file_path):
    chunk_num = int(file_path.split('_')[-1].split('.')[0])
    print(f"Start process descriptions for chunk: {chunk_num}")
    df = pd.read_csv(file_path)
    descriptions = []
    isbns_10 = []
    isbns_13 = []

    semaphore = asyncio.Semaphore(1)
    BATCH_SIZE = 10
    
    async with aiohttp.ClientSession() as session:
        for i in range(0, len(df), BATCH_SIZE):
            batch = df.iloc[i:i+BATCH_SIZE]
            tasks = []
            for _, row in batch.iterrows():
                title = row.get('judul_buku', '')
                author = row.get('penulis', '')
                author_last_name = row.get('nama_belakang', '')
                raw_isbn = row.get('isbn_issn', '')

                task = fetch_data_async(session, title, author, author_last_name, raw_isbn, semaphore)
                tasks.append(task)
            
            try:
                results = await asyncio.gather(*tasks)
                for res in results:
                    desc, i10, i13 = res
                    descriptions.append(desc)
                    isbns_10.append(i10)
                    isbns_13.append(i13)
                
                await asyncio.sleep(2)

            except Exception as e:
                print(f"Batch failed: {e}. Sleeping for 10s before retry...")
                for _ in range(len(batch)):
                    descriptions.append(None)
                    isbns_10.append(None)
                    isbns_13.append(None)
                await asyncio.sleep(10)
                
    df['deskripsi'] = descriptions
    df['isbn_10'] = isbns_10
    df['isbn_13'] = isbns_13

    save_enriched_chunk(df, chunk_num)
    conn.commit()


async def main():
    chunk_files = glob.glob('data/book_data_chunks/raw_v4/*.csv')
    chunk_files.sort()

    # Check for terminal arguments
    args = sys.argv[1:]

    if len(args) == 1:
        target_chunk = int(args[0])
        print(f"--- Processing ONLY chunk index: {target_chunk} ---")
        if target_chunk < len(chunk_files):
            await process_chunk_async(chunk_files[target_chunk])
        else:
            print(f"Error: Index {target_chunk} out of range. Max index is {len(chunk_files)-1}")

    elif len(args) == 2:
        start, end = int(args[0]), int(args[1])
        print(f"--- Processing chunks from index {start} to {end} ---")
        for i in range(start, min(end + 1, len(chunk_files))):
            await process_chunk_async(chunk_files[i])

    else:
        print(f"--- Processing ALL {len(chunk_files)} chunks ---")
        for file_path in chunk_files:
            await process_chunk_async(file_path)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Process interrupted by user.")
    finally:
        conn.close()
        print("Data Enrichment Process complete")
