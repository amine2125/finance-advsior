"""Runs a dossier in the background. Local: a thread. AWS: an asynchronous invocation of the same
Lambda (InvocationType=Event), so the HTTP request returns at once (decision D-032)."""
from __future__ import annotations

import json
import os
import threading

from ulysse import orchestrator
from ulysse.llm import get_llm
from ulysse.store import get_store


def lancer(dossier_id: str, llm_kind: str | None = None) -> None:
    if os.environ.get("ULYSSE_RUNNER") == "lambda":
        import boto3
        boto3.client("lambda").invoke(FunctionName=os.environ["AWS_LAMBDA_FUNCTION_NAME"], InvocationType="Event",
                                      Payload=json.dumps({"action": "executer_dossier", "id": dossier_id, "llm": llm_kind}).encode())
        return
    if os.environ.get("ULYSSE_RUNNER") == "sync":     # tests: run inline
        orchestrator.executer(get_store(), dossier_id, get_llm(llm_kind))
        return
    threading.Thread(target=orchestrator.executer, args=(get_store(), dossier_id, get_llm(llm_kind)), daemon=True).start()
