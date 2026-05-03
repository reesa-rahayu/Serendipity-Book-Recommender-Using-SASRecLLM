"""
Recommendation logic — warm-start (SASRec) and cold-start (FAISS).
"""

import numpy as np
import pandas as pd
from utils.loader import state

MAX_CONTEXT = 10


# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────

def _book_row_to_dict(row: pd.Series) -> dict:
    """Convert a books dataframe row to the API response schema."""
    def safe(v):
        if isinstance(v, float) and np.isnan(v):
            return None
        return v

    return {
        "book_id": safe(row.get("book_id")),
        "judul_buku": safe(row.get("judul_buku")),
        "penulis": safe(row.get("penulis")),
        "kategori": safe(row.get("kategori")),
        "tahun_terbit": safe(row.get("tahun_terbit")),
        "deskripsi": safe(row.get("deskripsi")),
        "image_url": safe(row.get("image_url")),
        "bahasa": safe(row.get("bahasa")),
        "type": safe(row.get("type")),
        "faiss_idx": int(row.get("faiss_idx", -1)),
    }


def _int_ids_to_books(int_ids: list[int], exclude_ids: set = None) -> list[dict]:
    """Convert a list of int bookIds → book dicts, skipping excludes."""
    results = []
    for iid in int_ids:
        book_id = state.id_to_books.get(iid)
        if book_id is None:
            continue
        if exclude_ids and book_id in exclude_ids:
            continue
        row_idx = state.book_id_to_row.get(book_id)
        if row_idx is None:
            continue
        row = state.books.iloc[row_idx]
        results.append(_book_row_to_dict(row))
    return results


# ────────────────────────────────────────────────────────────────────────────
# WARM-START  (SASRec → re-rank with item embeddings)
# ────────────────────────────────────────────────────────────────────────────

def recommend_warm(user_id: str, top_k: int = 10) -> dict:
    """
    1. Get user's borrowing history (int book ids).
    2. Run SASRec forward pass.
    3. Extract the 'query vector' (user representation) from the last non-padding token.
    4. Compute scores for ALL items using the model's internal projection/embeddings.
    5. Filter out history and padding (index 0).
    6. Pick top 100 for SOG reranking (if enabled).
    """
    seq = state.user_sequences.get(user_id, [])
    if not seq:
        return {"source": "warm_fallback", "books": recommend_cold_popular(top_k=top_k)}

    # Prepare input mirroring notebook: truncate to model's max_sequence_length
    max_len = state.sasrec.max_sequence_length
    raw_seq = [int(sid) for sid in seq]
    seq_truncated = raw_seq[-max_len:]

    # Create input tensor with zeros (padding)
    item_ids = np.zeros(max_len, dtype="int32")
    item_ids[:len(seq_truncated)] = seq_truncated
    
    # Notebook logic: SASRec expects inputs up to max_len-1 if training, 
    # but for inference we use the full sequence available.
    input_item_ids = np.array([item_ids], dtype=np.int32)
    input_mask = (input_item_ids == 0)

    # 1. Forward pass to get sequence embeddings
    outputs = state.sasrec({"item_ids": input_item_ids, "padding_mask": input_mask}, training=False)
    seq_embeddings = outputs["item_sequence_embedding"] # (1, max_len, hidden_dim)

    # 2. Extract last non-padding token (notebook/model logic)
    # We can either use model._get_last_non_padding_token or replicate logic:
    # Since it's inference, the last item in seq_truncated is our 'query' item.
    last_idx = len(seq_truncated) - 1
    query_vec = seq_embeddings[0, last_idx, :] # (hidden_dim,)

    # 3. Score all items using the same logic as the model's internal call
    # We grab the model's weights to be 100% consistent with its projection layer
    item_emb_layer = state.sasrec.item_embedding
    all_items = np.arange(0, state.sasrec.vocabulary_size, dtype=np.int32)
    all_item_vecs = item_emb_layer(all_items) # (V, llm_dim)
    
    if state.sasrec.projection is not None:
        all_item_vecs = state.sasrec.projection(all_item_vecs) # (V, hidden_dim)
    
    # Dot product scores
    scores = np.dot(all_item_vecs.numpy(), query_vec.numpy()) # (V,)

    # 4. Filtering (Notebook Logic)
    history_set = set(raw_seq)
    
    # Pick Top 100 candidates for SOG (to allow room for diversity)
    POOL_SIZE = 100
    ranked_all = np.argsort(-scores)
    
    pool_indices = []
    pool_scores = []
    seen_in_pool = set()
    
    for idx in ranked_all:
        item_id = int(idx)
        # Notebook rules: No padding(0), No history, No duplicates
        if item_id != 0 and item_id not in history_set and item_id not in seen_in_pool:
            pool_indices.append(item_id)
            pool_scores.append(float(scores[idx]))
            seen_in_pool.add(item_id)
        
        if len(pool_indices) >= POOL_SIZE:
            break

    # 5. Apply SOG Reranking (Scenario 3)
    if hasattr(state, 'sog_weights') and state.sog_weights and len(seq) > 0:
        w_rel, w_div, w_dis, w_unpop = state.sog_weights
        candidate_items = np.array(pool_indices)
        relevance_scores = np.array(pool_scores)
        
        # Internal embedding matrix for similarity calculations
        emb = all_item_vecs.numpy()
        
        valid_history = [int(i) for i in seq if i != 0]
        history_vecs = emb[valid_history]
        candidate_vecs = emb[candidate_items]
        
        def _cos_sim(a, b):
            a_norm = a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-8)
            b_norm = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-8)
            return a_norm @ b_norm.T
            
        # Dissimilarity to history
        sim_to_history = _cos_sim(candidate_vecs, history_vecs)
        dis_scores = 1.0 - np.mean(sim_to_history, axis=1) if len(valid_history) > 0 else np.zeros(len(candidate_items))
        
        # Diversity
        sim_to_candidates = _cos_sim(candidate_vecs, candidate_vecs)
        div_scores = 1.0 - np.mean(sim_to_candidates, axis=1)
        
        # Unpopularity
        unpop_scores = []
        for c_idx in candidate_items:
            b_id = state.id_to_books.get(int(c_idx), "")
            unpop_scores.append(state.item_unpopularity.get(b_id, 1.0))
        unpop_scores = np.array(unpop_scores)
        
        def min_max_scale(arr):
            min_v, max_v = np.min(arr), np.max(arr)
            if max_v - min_v == 0: return np.zeros_like(arr)
            return (arr - min_v) / (max_v - min_v)
            
        rel_norm = min_max_scale(relevance_scores)
        div_norm = min_max_scale(div_scores)
        dis_norm = min_max_scale(dis_scores)
        unpop_norm = min_max_scale(unpop_scores)
        
        serendipity_scores = (w_rel * rel_norm) + (w_div * div_norm) + (w_dis * dis_norm) + (w_unpop * unpop_norm)
        
        reranked_order = np.argsort(serendipity_scores)[::-1]
        final_indices = np.array(pool_indices)[reranked_order]
        final_scores = serendipity_scores[reranked_order]
    else:
        final_indices = np.array(pool_indices)
        final_scores = np.array(pool_scores)

    # 6. Final Formatting
    results = []
    for idx, score in zip(final_indices, final_scores):
        book_id = state.id_to_books.get(int(idx))
        row_idx = state.book_id_to_row.get(book_id)
        if row_idx is not None:
            row = state.books.iloc[row_idx]
            d = _book_row_to_dict(row)
            d["score"] = float(score)
            results.append(d)
        if len(results) >= top_k:
            break

    # History for display
    history_ids = raw_seq[-5:][::-1]
    history = _int_ids_to_books(history_ids)

    # Calculate final Serendipity Score (unSerendipity) for the top_k recommendations
    valid_history = [int(i) for i in seq if i != 0]
    if valid_history and final_indices[:top_k].size > 0:
        emb = all_item_vecs.numpy()
        history_vecs = emb[valid_history]
        candidate_vecs = emb[final_indices[:top_k]]
        def _cos_sim_eval(a, b):
            a_n = a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-8)
            b_n = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-8)
            return a_n @ b_n.T
        sim_to_hist = _cos_sim_eval(candidate_vecs, history_vecs)
        dis = 1.0 - np.mean(sim_to_hist, axis=1)
        user_serendipity_score = float(np.mean(dis))
    else:
        user_serendipity_score = 0.0

    return {
        "source": "sasrec",
        "history": history,
        "user_serendipity_score": user_serendipity_score,
        "books": results,
    }


# ────────────────────────────────────────────────────────────────────────────
# COLD-START  (FAISS similarity on user-picked books + demographic fallback)
# ────────────────────────────────────────────────────────────────────────────

def recommend_cold(
    fakultas: str | None = None,
    jurusan: str | None = None,
    liked_book_ids: list[str] | None = None,
    top_k: int = 10,
    faiss_model: str = "minilm",
) -> dict:
    """
    Strategy:
    A) If user provides liked books → average their FAISS vectors, search.
    B) Else → filter catalogue by faculty keyword, return top popular.
    """
    faiss_index = state.faiss_indices.get(faiss_model) or list(state.faiss_indices.values())[0]

    if liked_book_ids:
        # Get FAISS indices for liked books
        faiss_idxs = []
        for bid in liked_book_ids:
            row_idx = state.book_id_to_row.get(bid)
            if row_idx is not None:
                faiss_idxs.append(row_idx)

        if faiss_idxs:
            # Reconstruct vectors from FAISS index
            dim = faiss_index.d
            vecs = np.zeros((len(faiss_idxs), dim), dtype=np.float32)
            for i, fi in enumerate(faiss_idxs):
                faiss_index.reconstruct(fi, vecs[i])
            query_vec = vecs.mean(axis=0, keepdims=True).astype(np.float32)

            n_search = top_k + len(faiss_idxs) + 10
            distances, indices = faiss_index.search(query_vec, n_search)

            exclude = set(liked_book_ids)
            results = []
            for fi in indices[0]:
                if fi < 0 or fi >= len(state.books):
                    continue
                row = state.books.iloc[fi]
                if row["book_id"] in exclude:
                    continue
                results.append(_book_row_to_dict(row))
                if len(results) >= top_k:
                    break

            return {"source": "cold_faiss", "books": results}

    # Fallback: demographic / popular
    return {"source": "cold_popular", "books": recommend_cold_popular(fakultas, jurusan, top_k)}


def recommend_cold_popular(fakultas: str | None = None, jurusan: str | None = None, top_k: int = 10) -> list[dict]:
    """Return most-borrowed books, optionally filtered by faculty/jurusan keyword."""
    # Count borrowings per book_id
    borrow_counts = state.trans.groupby("book_id").size().reset_index(name="count")
    borrow_counts = borrow_counts.sort_values("count", ascending=False)

    books_merged = state.books.merge(borrow_counts, on="book_id", how="left")
    books_merged["count"] = books_merged["count"].fillna(0)

    if fakultas or jurusan:
        FACULTY_KEYWORDS = {
            "Fakultas Ekonomi dan Bisnis": ["ekonomi", "bisnis", "manajemen", "akuntansi", "keuangan"],
            "Fakultas Teknik dan Sains": ["teknik", "fisika", "kimia", "matematika", "sains", "engineering"],
            "Fakultas Hukum": ["hukum", "law", "legal", "pidana", "perdata"],
            "Fakultas Ilmu Sosial dan Ilmu Politik": ["sosial", "politik", "communication", "hubungan"],
            "Fakultas Pertanian": ["pertanian", "agri", "hortikultura", "botani"],
            "Fakultas Kedokteran": ["kedokteran", "medis", "kesehatan", "farmasi", "biologi"],
        }
        keywords = []
        if fakultas:
            keywords += FACULTY_KEYWORDS.get(fakultas, [fakultas.lower()])
        if jurusan:
            # Use jurusan words directly as additional keywords
            jurusan_words = [w.strip().lower() for w in jurusan.replace("/", " ").split() if len(w.strip()) > 3]
            keywords += jurusan_words

        if keywords:
            pattern = "|".join(set(keywords))
            mask = (
                books_merged["kategori"].str.contains(pattern, case=False, na=False) |
                books_merged["judul_buku"].str.contains(pattern, case=False, na=False)
            )
            filtered = books_merged[mask]
            if len(filtered) >= top_k:
                books_merged = filtered

    top = books_merged.sort_values("count", ascending=False).head(top_k)
    return [_book_row_to_dict(row) for _, row in top.iterrows()]

# SEMANTIC SEARCH
def semantic_search(query: str, top_k: int = 10, faiss_model: str = "qwen") -> dict:
    faiss_index = state.faiss_indices.get(faiss_model)
    if not faiss_index:
        faiss_index = list(state.faiss_indices.values())[0]
        faiss_model = list(state.faiss_indices.keys())[0]

    # Dynamically select the encoder that matches the FAISS model
    # (Requires state.encoders to be a dict: {model_name: encoder_instance})
    encoder = getattr(state, "encoders", {}).get(faiss_model)
    
    # Fallback to state.encoder for backward compatibility if dict is not fully set up
    if not encoder and hasattr(state, "encoder"):
        encoder = state.encoder
        
    if not encoder:
        raise ValueError(f"No encoder found for model: {faiss_model}")

    query_vec = encoder.encode([query], normalize_embeddings=True).astype(np.float32)
    
    # Strictly validate dimension match
    if query_vec.shape[1] != faiss_index.d:
        raise ValueError(
            f"Dimension mismatch! Encoder output: {query_vec.shape[1]}, "
            f"but FAISS index '{faiss_model}' expects: {faiss_index.d}. "
            "Ensure the active encoder perfectly matches the FAISS index."
        )

    distances, indices = faiss_index.search(query_vec, top_k + 5)

    results = []
    for fi, dist in zip(indices[0], distances[0]):
        if fi < 0 or fi >= len(state.books):
            continue
        row = state.books.iloc[fi]
        d = _book_row_to_dict(row)
        d["score"] = float(dist)
        results.append(d)
        if len(results) >= top_k:
            break

    return {"source": "semantic_search", "query": query, "books": results}
