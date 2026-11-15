"""Time-sortable identifiers (sortable by creation time within a DynamoDB partition)."""
from __future__ import annotations

import secrets
import time

_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"


def new_id(prefix: str) -> str:
    ms = int(time.time() * 1000)
    t = ""
    for _ in range(9):
        t = _ALPHABET[ms % 32] + t
        ms //= 32
    return f"{prefix}_{t}{secrets.token_hex(4)}"
