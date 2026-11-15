"""Simulated cash: every account starts with money to invest, approved orders spend it and sales refill it.

Starting balance = what the person said they plan to invest soon (questionnaire, « montant que vous pensez investir bientôt »),
or DEFAULT_START when they did not say. Simulation only: no real money ever moves.
"""
from __future__ import annotations

from ..models import utcnow
from ..storage.store import get_store

DEFAULT_START = 10_000.0
MAX_DEPOSIT = 100_000.0


class InsufficientCash(ValueError):
    pass


def _start_amount(owner: str) -> float:
    answers = (get_store().get(owner, "META", "onboarding") or {}).get("answers") or {}
    cap = answers.get("capital_cad")
    return float(cap) if cap and cap > 0 else DEFAULT_START


def get(owner: str, create: bool = True) -> dict | None:
    """The account's cash record; created with the starting balance the first time (accounts that finished the questionnaire)."""
    st = get_store()
    w = st.get(owner, "META", "wallet")
    if w is None and create:
        start = round(_start_amount(owner), 2)
        w = {"cash_cad": start, "start_cad": start, "created_at": utcnow(),
             "moves": [{"at": utcnow(), "kind": "start", "amount_cad": start, "label": "Solde de départ (simulation)"}]}
        st.put(owner, "META", "wallet", w)
    return w


def cash(owner: str) -> float:
    w = get(owner)
    return float(w["cash_cad"]) if w else 0.0


def _move(owner: str, delta: float, kind: str, label: str) -> dict:
    w = get(owner)
    new = round(float(w["cash_cad"]) + delta, 2)
    if new < -0.5:
        raise InsufficientCash(f"Solde insuffisant : {w['cash_cad']:,.0f} $ disponibles.".replace(",", " "))
    w["cash_cad"] = max(0.0, new)
    w["moves"] = ([{"at": utcnow(), "kind": kind, "amount_cad": round(delta, 2), "label": label}] + w.get("moves", []))[:50]
    get_store().put(owner, "META", "wallet", w)
    return w


def deposit(owner: str, amount: float) -> dict:
    if not 0 < amount <= MAX_DEPOSIT:
        raise ValueError(f"Montant entre 1 $ et {MAX_DEPOSIT:,.0f} $.".replace(",", " "))
    return _move(owner, amount, "deposit", "Dépôt (simulation)")


def apply_orders(owner: str, orders: list[dict], label: str) -> dict:
    """Buys spend cash, sales refill it. Refused when the buys exceed what is available (nothing is applied)."""
    buys = sum(o["amount_cad"] for o in orders if o["side"] == "buy")
    sells = sum(o["amount_cad"] for o in orders if o["side"] == "sell")
    return _move(owner, sells - buys, "orders", label)


def set_start(owner: str, amount: float) -> dict:
    """Demo accounts: a known balance."""
    w = {"cash_cad": amount, "start_cad": amount, "created_at": utcnow(),
         "moves": [{"at": utcnow(), "kind": "start", "amount_cad": amount, "label": "Solde de départ (simulation)"}]}
    get_store().put(owner, "META", "wallet", w)
    return w
