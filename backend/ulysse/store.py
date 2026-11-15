"""Storage: the state lives in storage, so everything can resume and be replayed (method, level 8).

LocalStore  : JSON files under .ulysse/ (default; tests and local demo, no AWS).
AwsStore    : DynamoDB (records) + S3 (large artefacts: dossiers' evidence and traces) — see
              ulysse/aws_store.py (phase 7). Same interface.
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from ulysse.config import STATE_DIR

_LOCK = threading.RLock()


class LocalStore:
    def __init__(self, root: Path | str = STATE_DIR):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    # generic -----------------------------------------------------------------
    def _path(self, kind: str, key: str) -> Path:
        safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in key)
        return self.root / kind / f"{safe}.json"

    def put(self, kind: str, key: str, value: Any) -> None:
        p = self._path(kind, key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(f".{uuid.uuid4().hex}.tmp")
        with _LOCK:
            tmp.write_text(json.dumps(value, ensure_ascii=False, default=str))
            os.replace(tmp, p)

    def get(self, kind: str, key: str, default: Any = None) -> Any:
        p = self._path(kind, key)
        if not p.exists():
            return default
        with _LOCK:
            return json.loads(p.read_text())

    def list(self, kind: str) -> list[str]:
        d = self.root / kind
        return sorted(p.stem for p in d.glob("*.json")) if d.exists() else []

    def delete(self, kind: str, key: str) -> None:
        self._path(kind, key).unlink(missing_ok=True)

    def append(self, kind: str, key: str, item: Any, cap: int = 500) -> None:
        with _LOCK:
            items = self.get(kind, key, [])
            items.append(item)
            self.put(kind, key, items[-cap:])

    def wipe(self) -> None:
        import shutil
        with _LOCK:
            shutil.rmtree(self.root, ignore_errors=True)
            self.root.mkdir(parents=True, exist_ok=True)

    # counters (LLM daily budget guard) ---------------------------------------
    def incr(self, kind: str, key: str, by: float) -> float:
        with _LOCK:
            v = float(self.get(kind, key, 0.0) or 0.0) + by
            self.put(kind, key, v)
            return v


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())


_STORE = None


def get_store():
    global _STORE
    if _STORE is None:
        if os.environ.get("ULYSSE_STORE") == "aws":
            from ulysse.aws_store import AwsStore   # phase 7
            _STORE = AwsStore()
        else:
            _STORE = LocalStore()
    return _STORE


def set_store(store) -> None:
    global _STORE
    _STORE = store
