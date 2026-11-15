"""Request-scoped dependencies: who is calling, and rate limiting.

Identity has two modes (AEGIS_AUTH):
  - "cognito": a real Amazon Cognito account. The browser sends the Cognito ACCESS token; it is validated by Cognito itself
    (GetUser), so a forged, expired or revoked token is refused. The owner key is the account's immutable `sub`.
    Passwords never reach this server.
  - "header": a random sandbox id sent by the browser (tests, offline demo). Not authentication.
"""
from __future__ import annotations

import re
import threading
import time

import hashlib
from dataclasses import dataclass

from fastapi import Header, HTTPException

from ..config import get_settings

_USER_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{2,40}$")
_buckets: dict[str, list[float]] = {}
_lock = threading.Lock()


@dataclass(frozen=True)
class Account:
    sub: str
    email: str | None


_tokens: dict[str, tuple[float, Account]] = {}
_TOKEN_CACHE_S = 300  # a validated token is re-checked with Cognito at most every 5 minutes per container


def _cognito_account(token: str) -> Account:
    """Validates an access token with Cognito (signature, expiry, revocation) and returns the account."""
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    hit = _tokens.get(key)
    if hit and hit[0] > now:
        return hit[1]
    import boto3
    from botocore.exceptions import ClientError
    s = get_settings()
    try:
        r = boto3.client("cognito-idp", region_name=s.cognito_region).get_user(AccessToken=token)
    except ClientError as exc:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "Session expirée : reconnectez-vous."}) from exc
    attrs = {a["Name"]: a["Value"] for a in r.get("UserAttributes", [])}
    acct = Account(sub=attrs.get("sub", r["Username"]).lower(), email=(attrs.get("email") or "").lower() or None)
    with _lock:
        if len(_tokens) > 5000:
            _tokens.clear()
        _tokens[key] = (now + _TOKEN_CACHE_S, acct)
    return acct


def current_account(authorization: str | None = Header(default=None)) -> Account | None:
    """The signed-in Cognito account (None in sandbox mode)."""
    if get_settings().auth_mode != "cognito":
        return None
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "Connectez-vous pour continuer."})
    return _cognito_account(authorization.split(" ", 1)[1].strip())


def owner_id(x_aegis_user: str | None = Header(default=None), authorization: str | None = Header(default=None)) -> str:
    if get_settings().auth_mode == "cognito":
        acct = current_account(authorization)
        return "u-" + acct.sub  # partition key of every record of this account
    return _sandbox_owner(x_aegis_user)


def _sandbox_owner(x_aegis_user: str | None) -> str:
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
