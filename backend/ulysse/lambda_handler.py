"""AWS Lambda entry point (single function, decision D-030).
- Function URL (behind CloudFront /api/*): HTTP event -> same router as the local server.
- EventBridge Scheduler (hourly): {"source": "ulysse.scheduler", "action": "vigie"} -> Vigie.
- Asynchronous self-invocation: {"action": "executer_dossier", "id": ...} -> dossier orchestration."""
from __future__ import annotations

import base64
import json

import os


def _datapack_froid() -> None:
    """Cold start: copy the datapack from the private data bucket to /tmp (once per container)."""
    prefix, bucket = os.environ.get("ULYSSE_DATAPACK_S3_PREFIX"), os.environ.get("ULYSSE_DATA_BUCKET")
    dest = os.environ.get("ULYSSE_DATAPACK_DIR", "/tmp/datapack")
    if not prefix or not bucket or os.path.exists(os.path.join(dest, "meta.json")):
        return
    import boto3
    s3 = boto3.client("s3")
    os.makedirs(dest, exist_ok=True)
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for o in page.get("Contents", []):
            name = o["Key"][len(prefix):]
            if name:
                s3.download_file(bucket, o["Key"], os.path.join(dest, name))


_datapack_froid()
from ulysse.api.routes import handle  # noqa: E402  (after the datapack is in place)


def handler(event, context):
    if event.get("action") == "vigie" or event.get("source") == "ulysse.scheduler":
        from ulysse import vigie
        return vigie.executer(event.get("as_of"))
    if event.get("action") == "executer_dossier":
        from ulysse import orchestrator
        from ulysse.llm import get_llm
        from ulysse.store import get_store
        d = orchestrator.executer(get_store(), event["id"], get_llm(event.get("llm")))
        return {"id": d["id"], "etat": d["etat"]}
    http = event.get("requestContext", {}).get("http", {})
    method, path = http.get("method", "GET"), event.get("rawPath", "/")
    body = event.get("body")
    if body and event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode()
    payload = json.loads(body) if body else None
    status, out = handle(method, path, event.get("queryStringParameters") or {}, payload)
    return {"statusCode": status, "headers": {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"},
            "body": json.dumps(out, ensure_ascii=False, default=str)}
