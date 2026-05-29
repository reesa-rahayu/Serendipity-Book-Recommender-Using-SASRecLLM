# ─────────────────────────────────────────────────────────
# LibRec — SASRec + FAISS Book Recommendation System
# Multi-stage Dockerfile
# ─────────────────────────────────────────────────────────

# Stage 1: Build frontend static assets
FROM node:22-slim AS frontend-builder
WORKDIR /build
COPY react-frontend/package.json react-frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY react-frontend/ ./
RUN npm run build

# Stage 2: Production runtime
FROM python:3.11-slim AS runtime

# System dependencies for faiss-cpu and TensorFlow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy data & model artifacts
COPY data/ ./data/
COPY saved_model/ ./saved_model/
COPY results_v2/ ./results_v2/

# Copy pre-built frontend
COPY --from=frontend-builder /build/dist ./react-frontend/dist

# Expose API port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start uvicorn
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
