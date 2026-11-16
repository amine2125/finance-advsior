"""Tiny cached HTTP helper. Every download is written to data/cache with a manifest entry
(url, retrieved_at, sha256, bytes) so a source can be audited later.

Politeness: a minimum delay between two live requests to the same host, Retry-After honoured on
429/503, no retry on 4xx other than 429 (a 404 means "no such page", not a transient error)."""
from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from ulysse.config import CACHE_DIR, USER_AGENT

MANIFEST = CACHE_DIR / "manifest.jsonl"
MIN_INTERVAL_S = {"wikimedia.org": 1.0, "en.wikipedia.org": 1.0}
_last_call: dict[str, float] = {}


class NotFound(RuntimeError):
    pass


def fetch(url: str, dest: Path, *, refresh: bool = False, headers: dict | None = None,
          retries: int = 5, timeout: int = 60) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not refresh:
        return dest
    hdrs = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    hdrs.update(headers or {})
    host = urllib.parse.urlparse(url).hostname or ""
    last: Exception | None = None
    for attempt in range(retries):
        _pace(host)
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
            dest.write_bytes(body)
            _log(url, dest, body)
            return dest
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 404:
                raise NotFound(url) from e
            if e.code in (429, 503):
                wait = float(e.headers.get("Retry-After") or 10 * 2 ** attempt)
                time.sleep(min(wait, 120))
                continue
            if 400 <= e.code < 500:
                raise RuntimeError(f"HTTP {e.code} for {url}") from e
            time.sleep(2 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"download failed after {retries} attempts: {url} ({last})")


def _pace(host: str) -> None:
    gap = next((v for k, v in MIN_INTERVAL_S.items() if host.endswith(k)), 0.0)
    if gap:
        elapsed = time.monotonic() - _last_call.get(host, 0.0)
        if elapsed < gap:
            time.sleep(gap - elapsed)
    _last_call[host] = time.monotonic()


def _log(url: str, dest: Path, body: bytes) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "url": url,
        "file": str(dest.relative_to(CACHE_DIR)),
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sha256": hashlib.sha256(body).hexdigest(),
        "bytes": len(body),
    }
    with MANIFEST.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
