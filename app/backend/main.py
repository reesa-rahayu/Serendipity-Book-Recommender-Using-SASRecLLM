import os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from contextlib import asynccontextmanager

from utils.loader import state
from utils import recommender


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.load()
    yield

app = FastAPI(
    title="LibRec API",
    description="Book Recommendation System — SASRec + FAISS",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── SOG weight scenarios (thesis-defined) ────────────────────────────────────
SOG_SCENARIOS = {
    "weight_1": (0.7, 0.1, 0.1, 0.1),
    "weight_2": (0.4, 0.2, 0.2, 0.2),
    "weight_3": (0.1, 0.2, 0.4, 0.3),
    "weight_4": (0.1, 0.3, 0.3, 0.3),
}

# ── Category clusters (4 groups for cold-start book picker) ──────────────────
CATEGORY_CLUSTERS = {
    "Sains & Teknologi": [
        "Ilmu Pengetahuan Terapan/Teknologi",
        "Ilmu Pengetahuan Murni",
        "Komputer",
        "Matematika",
        "Fisika",
        "Kimia",
    ],
    "Sosial & Bisnis": [
        "Ilmu Sosial",
        "Ekonomi",
        "Manajemen",
        "Hukum",
        "Politik",
        "Bisnis",
    ],
    "Seni & Budaya": [
        "Seni, Olahraga",
        "Kesusastraan Sejarah, Geografi",
        "Bahasa",
        "Filsafat",
        "Agama",
    ],
    "Umum & Lainnya": [
        "Karya Umum",
        "Lainnya",
        "Kesehatan",
        "Pertanian",
    ],
}


# ── Pydantic models ──────────────────────────────────────────────────────────
class ColdStartRequest(BaseModel):
    fakultas: Optional[str] = None
    jurusan: Optional[str] = None
    liked_book_ids: Optional[list[str]] = []
    top_k: int = 10
    faiss_model: Optional[str] = None

class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    faiss_model: Optional[str] = None

class ConfigRequest(BaseModel):
    sog_weights: Optional[list[float]] = None
    faiss_model: Optional[str] = None


# ────────────────────────────────────────────────────────────────────────────
# Routes
# ────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "loaded": state._loaded}


@app.get("/check-user")
def check_user(npm: str = Query(...)):
    """Returns 'warm' if user exists in system, 'cold' otherwise."""
    uid = str(npm).strip()
    is_warm = uid in state.known_user_ids
    user_info = None
    if is_warm:
        row = state.users[state.users["ID Anggota"].astype(str) == uid]
        if not row.empty:
            r = row.iloc[0]
            user_info = {
                "nama": r.get("Nama Anggota"),
                "fakultas": r.get("fakultas"),
                "jurusan": r.get("jurusan"),
                "role": r.get("role"),
                "jenjang": r.get("jenjang"),
            }
    return {"status": "warm" if is_warm else "cold", "user": user_info}


@app.get("/user/history")
def get_user_history(npm: str = Query(...), top_n: int = Query(20, ge=1, le=100)):
    """Return borrowing history for a user (most recent first, deduplicated)."""
    uid = str(npm).strip()
    if uid not in state.known_user_ids:
        raise HTTPException(status_code=404, detail="User not found")

    user_trans = state.trans[state.trans["ID Anggota"] == uid].copy()
    date_cols = [c for c in user_trans.columns
                 if any(kw in c.lower() for kw in ["tanggal", "date", "tgl", "waktu"])]
    if date_cols:
        try:
            user_trans = user_trans.sort_values(date_cols[0], ascending=False)
        except Exception:
            pass

    books, seen = [], set()
    from utils.recommender import _book_row_to_dict
    for _, row in user_trans.iterrows():
        bid = row.get("book_id")
        if bid and bid not in seen:
            seen.add(bid)
            row_idx = state.book_id_to_row.get(bid)
            if row_idx is not None:
                bdict = _book_row_to_dict(state.books.iloc[row_idx])
                if date_cols:
                    bdict["tanggal_pinjam"] = str(row.get(date_cols[0], ""))
                books.append(bdict)
        if len(books) >= top_n:
            break

    return {"npm": uid, "total": len(books), "books": books}


@app.get("/recommend/warm")
def recommend_warm(
    npm: str = Query(...),
    top_k: int = Query(10, ge=1, le=30),
):
    """SASRec-based recommendation for known users."""
    uid = str(npm).strip()
    if uid not in state.known_user_ids:
        raise HTTPException(status_code=404, detail="User not found (cold user)")
    return recommender.recommend_warm(uid, top_k=top_k)


@app.post("/recommend/cold")
def recommend_cold(body: ColdStartRequest):
    """Cold-start recommendation via FAISS similarity or popularity."""
    faiss_pref = body.faiss_model or getattr(state, "active_faiss_model", "qwen")
    return recommender.recommend_cold(
        fakultas=body.fakultas,
        jurusan=body.jurusan,
        liked_book_ids=body.liked_book_ids,
        top_k=body.top_k,
        faiss_model=faiss_pref,
    )


@app.post("/search")
def search(body: SearchRequest):
    """Semantic search via MiniLM encoder + FAISS."""
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Empty query")
    faiss_pref = body.faiss_model or getattr(state, "active_faiss_model", "qwen")
    return recommender.semantic_search(
        query=body.query,
        top_k=body.top_k,
        faiss_model=faiss_pref,
    )


@app.get("/books/search/autocomplete")
def autocomplete(q: str = Query(..., min_length=2), limit: int = 8):
    """Fast title-based autocomplete."""
    matches = state.books[
        state.books["judul_buku"].str.lower().str.contains(q.lower(), na=False)
    ].head(limit)
    return [
        {"book_id": r["book_id"], "judul_buku": r["judul_buku"], "penulis": r.get("penulis")}
        for _, r in matches.iterrows()
    ]


@app.get("/books/clusters")
def books_clusters(top_n: int = Query(6, ge=2, le=20)):
    """
    Return top-N most-borrowed books from the top categories.
    Used in cold-start book preference picker.
    """
    from utils.recommender import _book_row_to_dict
    borrow_counts = state.trans.groupby("book_id").size().to_dict()

    kategori_counts = state.books["kategori"].dropna().value_counts()
    top_categories = [k for k in kategori_counts.index if isinstance(k, str) and k.strip()]

    result = {}
    for cat in top_categories:
        mask = state.books["kategori"] == cat
        cluster_books = state.books[mask].copy()
        cluster_books["_count"] = cluster_books["book_id"].map(lambda bid: borrow_counts.get(bid, 0))
        top = cluster_books.nlargest(top_n, "_count")
        result[cat] = [_book_row_to_dict(row) for _, row in top.iterrows()]

    return result


@app.get("/books/{book_id}")
def get_book(book_id: str):
    row_idx = state.book_id_to_row.get(book_id)
    if row_idx is None:
        raise HTTPException(status_code=404, detail="Book not found")
    from utils.recommender import _book_row_to_dict
    return _book_row_to_dict(state.books.iloc[row_idx])


@app.get("/faculties")
def list_faculties():
    """Return distinct faculty names."""
    faculties = sorted(state.users["fakultas"].dropna().unique().tolist())
    return {"faculties": faculties}


@app.get("/jurusan")
def list_jurusan(fakultas: str = Query(None)):
    """Return distinct jurusan STRING names, optionally filtered by fakultas."""
    df = state.users
    if fakultas:
        df = df[df["fakultas"] == fakultas]
    # Always return the 'jurusan' column (string names), not numeric IDs
    jurusan_list = sorted(df["jurusan"].dropna().astype(str).unique().tolist())
    return {"jurusan": jurusan_list}


@app.get("/stats")
def stats():
    return {
        "total_books": len(state.books),
        "total_users": len(state.users),
        "total_transactions": len(state.trans),
        "faiss_models": list(state.faiss_indices.keys()),
        "warm_users": len(state.user_sequences),
        "sog_scenarios": {k: list(v) for k, v in SOG_SCENARIOS.items()},
    }


@app.get("/config")
def get_config():
    w = state.sog_weights
    active_faiss = getattr(state, "active_faiss_model", "qwen")
    return {
        "sog_weights": list(w) if w else None,
        "faiss_model": active_faiss,
        "sog_scenarios": {k: list(v) for k, v in SOG_SCENARIOS.items()},
    }


@app.post("/config")
def update_config(req: ConfigRequest):
    if req.sog_weights is not None:
        if len(req.sog_weights) == 4:
            state.sog_weights = tuple(req.sog_weights)
        elif req.sog_weights == []:
            state.sog_weights = None
    if req.faiss_model is not None:
        state.active_faiss_model = req.faiss_model
    return {
        "message": "Config updated",
        "sog_weights": list(state.sog_weights) if state.sog_weights else None,
        "faiss_model": getattr(state, "active_faiss_model", "qwen"),
    }

@app.get("/eval-metrics")
def get_eval_metrics():
    import pandas as pd
    import json
    eval_csv = Path(__file__).parent.parent / "results_v2" / "evaluation_metrics_l_2_h_1_hd_1024_trainable_True_lr_0.0001.csv"
    if not eval_csv.exists():
        raise HTTPException(status_code=404, detail="Eval metrics not found")
    
    try:
        df = pd.read_csv(eval_csv)
        df = df[df["k"] != 50]
        # Convert df to json string first (which properly converts NaN to null), then parse back to dict
        return json.loads(df.to_json(orient="records"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/eval-metrics/models")
def get_eval_models():
    """Return distinct model names available in the evaluation CSV."""
    import pandas as pd
    eval_csv = Path(__file__).parent.parent / "results_v2" / "evaluation_metrics_l_2_h_1_hd_1024_trainable_True_lr_0.0001.csv"
    if not eval_csv.exists():
        raise HTTPException(status_code=404, detail="Eval metrics not found")
    try:
        df = pd.read_csv(eval_csv)
        models = sorted(df["Model"].dropna().unique().tolist())
        k_values = sorted(df[df["k"] != 50]["k"].dropna().unique().tolist())
        return {"models": models, "k_values": k_values}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


