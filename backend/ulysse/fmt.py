"""French (Canada) number formatting used by every template (no thousands comma, decimal comma)."""
from __future__ import annotations

NBSP = " "


def nombre(x: float | None, d: int = 1) -> str:
    if x is None:
        return "?"
    s = f"{x:,.{d}f}"
    return s.replace(",", NBSP).replace(".", ",")


def pct(x: float | None, d: int = 1) -> str:
    return f"{nombre(x, d)}{NBSP}%"


def cad(x: float | None, d: int = 0) -> str:
    return f"{nombre(x, d)}{NBSP}$"
