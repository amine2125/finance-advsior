"""Repository adapters. Every record lives under its owner's partition: users cannot read each other's data.

DynamoDB single-table design:
  PK = "USER#<owner_id>"   SK = "<KIND>#<time-sortable id>"   data = JSON (zlib+base64 when > 90 KB)
  Queries use PK + begins_with(SK, "<KIND>#"), never scans. Optional `ttl` attribute for jobs.
"""
from __future__ import annotations

import base64
import json
import re
import threading
import time
import zlib
from pathlib import Path
from typing import Protocol

from ..config import get_settings

KINDS = {"PORTFOLIO", "PERSONA", "ANALYSIS", "SNAPSHOT", "DEBATE", "ALERT", "JOB", "REPORT", "CONV", "HYPE", "HYP", "RESEARCH", "REPLAY", "META"}
_SAFE = re.compile(r"^[A-Za-z0-9_.\-]{1,80}$")


def _check(owner: str, kind: str, item_id: str) -> None:
    if kind not in KINDS:
        raise ValueError(f"unknown kind {kind}")
    if not _SAFE.match(owner) or not _SAFE.match(item_id):
        raise ValueError("invalid identifier")


class Store(Protocol):
    def put(self, owner: str, kind: str, item_id: str, data: dict, ttl_s: int | None = None) -> None: ...
    def get(self, owner: str, kind: str, item_id: str) -> dict | None: ...
    def list(self, owner: str, kind: str, limit: int = 50) -> list[dict]: ...
    def delete(self, owner: str, kind: str, item_id: str) -> None: ...


class LocalStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self._lock = threading.Lock()

    def _path(self, owner: str, kind: str, item_id: str) -> Path:
        return self.root / owner / kind / f"{item_id}.json"

    def put(self, owner, kind, item_id, data, ttl_s=None):
        _check(owner, kind, item_id)
        p = self._path(owner, kind, item_id)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        with self._lock:
            tmp.write_text(json.dumps(data, default=str, ensure_ascii=False))
            tmp.replace(p)

    def get(self, owner, kind, item_id):
        _check(owner, kind, item_id)
        p = self._path(owner, kind, item_id)
        if not p.exists():
            return None
        return json.loads(p.read_text())

    def list(self, owner, kind, limit=50):
        _check(owner, kind, "x")
        d = self.root / owner / kind
        if not d.exists():
            return []
        files = sorted(d.glob("*.json"), key=lambda f: f.name, reverse=True)[:limit]
        return [json.loads(f.read_text()) for f in files]

    def delete(self, owner, kind, item_id):
        _check(owner, kind, item_id)
        p = self._path(owner, kind, item_id)
        if p.exists():
            p.unlink()


class DynamoStore:
    def __init__(self, table: str) -> None:
        import boto3

        self.table = boto3.resource("dynamodb").Table(table)

    @staticmethod
    def _encode(data: dict) -> dict:
        raw = json.dumps(data, default=str, ensure_ascii=False)
        if len(raw) > 90_000:
            return {"z": base64.b64encode(zlib.compress(raw.encode(), 9)).decode()}
        return {"d": raw}

    @staticmethod
    def _decode(item: dict) -> dict:
        if "z" in item:
            return json.loads(zlib.decompress(base64.b64decode(item["z"])).decode())
        return json.loads(item["d"])

    def put(self, owner, kind, item_id, data, ttl_s=None):
        _check(owner, kind, item_id)
        item = {"PK": f"USER#{owner}", "SK": f"{kind}#{item_id}", **self._encode(data), "updated_at": int(time.time())}
        if ttl_s:
            item["ttl"] = int(time.time()) + ttl_s
        self.table.put_item(Item=item)

    def get(self, owner, kind, item_id):
        _check(owner, kind, item_id)
        r = self.table.get_item(Key={"PK": f"USER#{owner}", "SK": f"{kind}#{item_id}"})
        return self._decode(r["Item"]) if "Item" in r else None

    def list(self, owner, kind, limit=50):
        from boto3.dynamodb.conditions import Key

        _check(owner, kind, "x")
        r = self.table.query(KeyConditionExpression=Key("PK").eq(f"USER#{owner}") & Key("SK").begins_with(f"{kind}#"),
                             ScanIndexForward=False, Limit=limit)
        return [self._decode(i) for i in r.get("Items", [])]

    def delete(self, owner, kind, item_id):
        _check(owner, kind, item_id)
        self.table.delete_item(Key={"PK": f"USER#{owner}", "SK": f"{kind}#{item_id}"})


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        s = get_settings()
        _store = DynamoStore(s.dynamodb_table) if s.storage_backend == "dynamodb" else LocalStore(s.local_store_dir / "store")
    return _store


def set_store(store: Store | None) -> None:
    global _store
    _store = store
