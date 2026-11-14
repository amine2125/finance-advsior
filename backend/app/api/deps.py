"""Request-scoped dependencies: demo user identity (sandbox key, not authentication) and rate limiting."""
from __future__ import annotations

import re
import threading
import time

from fastapi import Header, HTTPException

_USER_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{2,40}$")
_buckets: dict[str, list[float]] = {}
_lock = threading.Lock()


def owner_id(x_aegis_user: str | None = Header(default=None)) -> str:
    """Each browser generates a random sandbox id; every record is partitioned by it. Not an authentication mechanism (see limitations)."""
    if x_aegis_user is None:
        return "demo-user"
    v = x_aegis_user.strip().lower()
    if not _USER_RE.match(v) or v == "system":
        raise HTTPException(status_code=400, detail={"code": "invalid_user", "message": "En-tête X-AEGIS-User invalide"})
    return v


def rate_limit(owner: str, kind: str, per_minute: int = 12) -> None:
    now = time.time()
    key = f"{owner}:{kind}"
    with _lock:
        b = [t for t in _buckets.get(key, []) if now - t < 60]
        if len(b) >= per_minute:
            raise HTTPException(status_code=429, detail={"code": "rate_limited", "message": "Trop de requêtes IA; réessayez dans une minute."})
        b.append(now)
        _buckets[key] = b
