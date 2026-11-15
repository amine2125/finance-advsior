"""Asynchronous job runner. Locally: a thread pool. On AWS: asynchronous self-invocation of the worker Lambda.

Long multi-agent workflows exceed the API Gateway 30 s limit; the API returns a job id and the UI polls real step states.
"""
from __future__ import annotations

import json
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor

from ..config import get_settings
from ..ids import new_id
from ..models import Job
from ..storage.store import get_store

log = logging.getLogger("aegis.jobs")
_pool = ThreadPoolExecutor(max_workers=4)
HANDLERS: dict = {}


def handler(kind: str):
    def deco(fn):
        HANDLERS[kind] = fn
        return fn
    return deco


def submit(owner: str, kind: str, request: dict) -> Job:
    job = Job(job_id=new_id("job"), owner_id=owner, kind=kind, request=request)
    get_store().put(owner, "JOB", job.job_id, job.model_dump(mode="json"), ttl_s=7 * 24 * 3600)
    s = get_settings()
    if s.job_runner == "lambda" and s.worker_function_name:
        import boto3

        boto3.client("lambda").invoke(FunctionName=s.worker_function_name, InvocationType="Event",
                                      Payload=json.dumps({"task": "job", "owner": owner, "job_id": job.job_id}).encode())
    elif s.job_runner == "inline":
        execute(owner, job.job_id)
    else:
        _pool.submit(execute, owner, job.job_id)
    return job


def execute(owner: str, job_id: str) -> None:
    from ..agents.base import JobTracker

    data = get_store().get(owner, "JOB", job_id)
    if not data:
        log.error("job not found %s", job_id)
        return
    job = Job(**data)
    tracker = JobTracker(job)
    try:
        fn = HANDLERS[job.kind]
        result, ref = fn(tracker, owner, job.request)
        tracker.finish(result=result, result_ref=ref)
    except Exception as exc:  # noqa: BLE001
        log.error("job %s failed: %s\n%s", job_id, exc, traceback.format_exc())
        tracker.finish(error=f"{exc.__class__.__name__}: {str(exc)[:300]}")


def get_job(owner: str, job_id: str) -> Job | None:
    d = get_store().get(owner, "JOB", job_id)
    return Job(**d) if d else None
