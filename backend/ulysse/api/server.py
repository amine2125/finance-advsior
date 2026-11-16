"""Local development server (FastAPI). Same routes and handlers as the Lambda function URL.
Run: uvicorn ulysse.api.server:app --port 8000   (or `make api`)"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from ulysse.api.routes import handle
from ulysse.config import ROOT

app = FastAPI(title="ULYSSE (local)", docs_url=None, redoc_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1000)   # CloudFront compresses in production (Compress: true)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST"], allow_headers=["content-type", "x-ulysse-jeton", "x-amz-content-sha256"])
DIST = ROOT / "frontend" / "dist"


@app.api_route("/api/{path:path}", methods=["GET", "POST"])
async def api(path: str, request: Request):
    body = None
    if request.method == "POST":
        raw = await request.body()
        body = (await request.json()) if raw else {}
    status, payload = handle(request.method, "/api/" + path, dict(request.query_params), body, dict(request.headers))
    return JSONResponse(payload, status_code=status)


@app.get("/{path:path}")
async def spa(path: str):
    f = DIST / path
    if path and f.is_file():
        return FileResponse(f)
    idx = DIST / "index.html"
    if idx.exists():
        return FileResponse(idx)
    return JSONResponse({"message": "Interface non construite : lancez `make web` (développement) ou `make web-build`."}, status_code=404)
