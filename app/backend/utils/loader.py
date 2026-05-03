"""
Startup loader — loads all artifacts once at server startup.
Shared across all request handlers via a singleton.
"""

import os, pickle, re
import numpy as np
import pandas as pd
import faiss
from pathlib import Path

# ── paths (relative to project root, called from app/backend/) ──────────────
ROOT = Path(__file__).resolve().parents[3]   # project-code/
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "saved_model"
BOOKS_CSV  = DATA_DIR / "processed" / "books_enriched_with_type.csv"
USERS_CSV  = DATA_DIR / "users" / "all_users.csv"
TRANS_CSV  = DATA_DIR / "processed" / "transactions_enriched.csv"
ARTIFACTS  = MODEL_DIR / "recsys_artifacts.pkl"
FAISS_DIR  = DATA_DIR / "books_vector_v2"
ITEM_EMB   = MODEL_DIR / "item_embeddings.npy"
WEIGHTS    = MODEL_DIR / "best_sasrec_weights.weights.h5"


class AppState:
    """Singleton that holds all loaded data/models."""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._loaded = False
        return cls._instance

    def load(self):
        if self._loaded:
            return
        print("[loader] Loading artifacts …")

        # Books catalogue 
        books = pd.read_csv(BOOKS_CSV, sep=";", low_memory=False)
        books = books.dropna(subset=["book_id"])
        books = books.reset_index(drop=True)
        # Integer index matching FAISS / item_embeddings order
        books["faiss_idx"] = books.index
        self.books: pd.DataFrame = books
        # book_id (Bxxxxxx) → row in books dataframe
        self.book_id_to_row: dict = {row["book_id"]: i
                                     for i, row in books.iterrows()}

        # Users
        users = pd.read_csv(USERS_CSV)

        # Fix: jurusan column has mixed data — some rows contain float-IDs (e.g. "8.0")
        # while prodi_id contains the actual program name string.
        # Replace numeric jurusan values with prodi_id (the real name).
        def _fix_jurusan(row):
            jur = str(row.get("jurusan", "") or "").strip()
            # Numeric check: matches patterns like "8.0", "1.0", "12"
            try:
                float(jur)
                is_numeric = True
            except (ValueError, TypeError):
                is_numeric = False
            if is_numeric or jur == "" or jur == "nan":
                prodi = str(row.get("prodi_id", "") or "").strip()
                try:
                    float(prodi)
                    is_prodi_numeric = True
                except (ValueError, TypeError):
                    is_prodi_numeric = False
                if not is_prodi_numeric and prodi and prodi != "nan":
                    return prodi
                return None  # Cannot resolve
            return jur

        users["jurusan"] = users.apply(_fix_jurusan, axis=1)
        self.users: pd.DataFrame = users

        # Known user IDs (as strings, to handle both numeric and alphanumeric)
        self.known_user_ids: set = set(
            self.users["ID Anggota"].astype(str).tolist()
        )

        # Transactions 
        trans = pd.read_csv(TRANS_CSV, sep=";")
        trans["ID Anggota"] = trans["ID Anggota"].astype(str)
        self.trans: pd.DataFrame = trans

        # Compute item unpopularity for SOG rerank
        total_transactions = len(trans)
        item_counts = trans["book_id"].value_counts().to_dict()
        self.item_unpopularity: dict[str, float] = {
            book_id: 1.0 - (count / total_transactions) 
            for book_id, count in item_counts.items()
        }

        # SASRec pickle artifacts 
        with open(ARTIFACTS, "rb") as f:
            art = pickle.load(f)
        self.sequences_dict: dict  = art["sequences_dict"]   # user_row → list[{bookId, timestamp}]
        self.id_to_books: dict     = art["id_to_books"]       # int_id → book_id (Bxxxxxx)
        self.books_to_id: dict     = {v: k for k, v in art["id_to_books"].items()}
        self.sog_weights: tuple    = art["sog_weights"]       # (w1,w2,w3,w4) reranking

        # Item embeddings (SASRec internal, dim=256) 
        self.item_embeddings: np.ndarray = np.load(str(ITEM_EMB))
        # shape: (14503, 256) — index matches int book id

        # SASRec model 
        from model.sasrec import SasRecLLM
        NUM_ITEMS = len(self.id_to_books)           # 14503
        self.sasrec = SasRecLLM(
            vocabulary_size=NUM_ITEMS,
            num_layers=2,
            num_heads=2,
            hidden_dim=256,
            llm_embedding_matrix=self.item_embeddings,
            max_sequence_length=10
        )
        # Dummy forward pass to build weights
        dummy_inputs = {
            "item_ids": np.zeros((1, 10), dtype=np.int32),
            "padding_mask": np.ones((1, 10), dtype=bool)
        }
        self.sasrec(dummy_inputs, training=False)
        self.sasrec.load_weights(str(WEIGHTS), skip_mismatch=True)
        print(f"[loader] SASRec loaded — {NUM_ITEMS} items")

        # FAISS indices 
        self.faiss_indices: dict = {}
        for f in FAISS_DIR.glob("*.faiss"):
            name = f.stem.replace("_db", "") 
            self.faiss_indices[name] = faiss.read_index(str(f))
        print(f"[loader] FAISS indices loaded: {list(self.faiss_indices.keys())}")

        from sentence_transformers import SentenceTransformer
        import os
        try:
            from dotenv import load_dotenv
            env_path = Path(__file__).parent.parent.parent / ".env"
            load_dotenv(dotenv_path=env_path)
        except ImportError:
            pass

        hf_token = os.environ.get("HF_ACCESS_TOKEN")

        self.encoders: dict = {}
        if "qwen" in self.faiss_indices:
            self.encoders["qwen"] = SentenceTransformer(
                "Qwen/Qwen3-Embedding-0.6B",
                trust_remote_code=True,
                token=hf_token
            )
        elif "minilm" in self.faiss_indices:
            self.encoders["minilm"] = SentenceTransformer("all-MiniLM-L6-v2")

        # Fallback for backward compatibility
        self.encoder = self.encoders.get("qwen") or (list(self.encoders.values())[0] if self.encoders else None)
        
        print(f"[loader] Encoders ready: {list(self.encoders.keys())}")

        # User sequences (numeric book ids, sorted by time)
        # Build: user_str_id → [int_book_id, ...] (most recent last)
        self.user_sequences: dict[str, list[int]] = {}

        # Fix: use enumerate() for row position — avoids off-by-1 when CSV
        # has its own index column that shifts DataFrame row indices.
        user_row_to_id: dict = {}
        users_reset = self.users.reset_index(drop=True)
        for row_pos, row in users_reset.iterrows():
            # Store with both float and int keys to match pkl variability
            user_row_to_id[float(row_pos)] = str(row["ID Anggota"])
            user_row_to_id[int(row_pos)]   = str(row["ID Anggota"])

        for row_key, seq_list in self.sequences_dict.items():
            uid = user_row_to_id.get(row_key) or user_row_to_id.get(float(row_key))
            if uid is None:
                continue
            sorted_seq = sorted(seq_list, key=lambda x: str(x.get("timestamp", 0)))
            int_ids = [item.get("bookId", item.get("book_id")) for item in sorted_seq]
            self.user_sequences[uid] = [i for i in int_ids if i is not None]

        self._loaded = True
        print("[loader] All artifacts loaded OK")

state = AppState()
