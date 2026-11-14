"""FastAPI application: structured errors, request IDs, CORS restricted to configured origins."""
from __future__ import annotations

import json
import logging
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .agents.llm import LLMError
from .config import get_settings
from .data.loader import DataUnavailableError
from .services import job_handlers  # noqa: F401  (registers job kinds)
from .errors import NotFound

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("aegis.api")
logging.getLogger("httpx").setLevel(logging.WARNING)

app = FastAPI(title="AEGIS API", version=__version__,
              description="AEGIS – intelligence de portefeuille multi-agents. Simulation et éducation uniquement: aucune transaction, aucun conseil personnalisé.")
s = get_settings()
app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_methods=["GET", "POST", "PUT", "DELETE"],
                   allow_headers=["Content-Type", "X-AEGIS-User"], max_age=600)


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    t0 = time.time()
    try:
        response = await call_next(request)
    except Exception:  # noqa: BLE001
        log.exception("unhandled")
        response = JSONResponse(status_code=500, content={"error": {"code": "internal", "message": "Erreur interne", "request_id": rid}})
    response.headers["x-request-id"] = rid
    log.info(json.dumps({"event": "request", "request_id": rid, "method": request.method, "path": request.url.path,
                         "status": response.status_code, "ms": int((time.time() - t0) * 1000)}))
    return response


def _err(status: int, code: str, message: str, request: Request, extra: dict | None = None):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, **(extra or {})}})


@app.exception_handler(DataUnavailableError)
async def _data(request: Request, exc: DataUnavailableError):
    return _err(422, "data_unavailable", str(exc), request)


@app.exception_handler(NotFound)
async def _nf(request: Request, exc: NotFound):
    return _err(404, "not_found", str(exc), request)


@app.exception_handler(ValueError)
async def _val(request: Request, exc: ValueError):
    return _err(400, "invalid_request", str(exc)[:300], request)


@app.exception_handler(LLMError)
async def _llm(request: Request, exc: LLMError):
    return _err(503, "llm_unavailable", "Service Amazon Bedrock indisponible", request)


@app.exception_handler(HTTPException)
async def _http(request: Request, exc: HTTPException):
    d = exc.detail if isinstance(exc.detail, dict) else {"code": "http_error", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": d})


@app.exception_handler(RequestValidationError)
async def _rv(request: Request, exc: RequestValidationError):
    errs = [{"loc": e.get("loc"), "msg": e.get("msg")} for e in exc.errors()][:10]
    return JSONResponse(status_code=422, content={"error": {"code": "validation_error", "message": "Requête invalide", "details": errs}})


from .api.routes import router  # noqa: E402

app.include_router(router)
