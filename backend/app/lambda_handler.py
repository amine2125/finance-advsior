"""AWS Lambda entry points.

* `api_handler`   - API Gateway HTTP API (payload v2) -> FastAPI via Mangum.
* `worker_handler` - asynchronous agent jobs ({"task": "job"}).
"""
from __future__ import annotations

import json
import logging

from mangum import Mangum

from .main import app

log = logging.getLogger("aegis.lambda")
_mangum = Mangum(app, lifespan="off", api_gateway_base_path=None)


def api_handler(event, context):
    return _mangum(event, context)


def worker_handler(event, context):
    task = (event or {}).get("task")
    if task == "job":
        from .services.jobs import execute

        execute(event["owner"], event["job_id"])
        return {"ok": True}
    if task == "news_refresh":  # EventBridge schedule: keep the shared news cache warm
        from .data.registry import get_market_data
        from .hype_research.pipeline import refresh

        out = refresh(get_market_data(), period_s=int(event.get("period_s") or 900))
        log.info(json.dumps({"event": "news_refresh", **out}))
        return {"ok": True, **out}
    log.warning(json.dumps({"event": "unknown_task", "payload_keys": sorted((event or {}).keys())}))
    return {"ok": False, "error": "unknown task"}
