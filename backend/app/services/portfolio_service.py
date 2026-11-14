"""Investor profiles and simulated portfolios (CRUD, CSV import).

Nothing is pre-seeded: every profile comes from the user's onboarding answers and every portfolio from
what the user enters. The datathon reference personas live in `seed.py` and are only loaded on explicit request.
"""
from __future__ import annotations

import csv
import io

import pandas as pd

from ..analytics.portfolio import quantities_from_amounts
from ..data.loader import DataUnavailableError
from ..data.registry import get_market_data
from ..errors import NotFound
from ..ids import new_id
from ..models import InvestorProfile, Portfolio, PortfolioCreate, PortfolioHolding, utcnow
from ..storage.store import get_store


def list_personas(owner: str) -> list[InvestorProfile]:
    items = [InvestorProfile(**p) for p in get_store().list(owner, "PERSONA", 100)]
    return sorted(items, key=lambda p: p.created_at, reverse=True)


def get_persona(owner: str, persona_id: str) -> InvestorProfile:
    stored = get_store().get(owner, "PERSONA", persona_id)
    if not stored:
        raise NotFound(f"profil {persona_id} introuvable")
    return InvestorProfile(**stored)


def resolve_persona(owner: str, persona_id: str | None = None, pf: Portfolio | None = None) -> InvestorProfile:
    """Explicit id, else the portfolio's profile, else the user's most recent profile. Never a default persona."""
    pid = persona_id or (pf.persona_id if pf else None)
    if pid:
        return get_persona(owner, pid)
    items = list_personas(owner)
    if not items:
        raise NotFound("Aucun profil investisseur: complétez d'abord l'inscription.")
    return items[0]


def resolve_portfolio(owner: str, portfolio_id: str | None = None) -> Portfolio:
    if portfolio_id:
        return get_portfolio(owner, portfolio_id)
    items = list_portfolios(owner)
    if not items:
        raise NotFound("Aucun portefeuille: ajoutez vos placements ou démarrez de zéro.")
    return items[0]


def save_persona(owner: str, profile: InvestorProfile) -> InvestorProfile:
    existing = get_store().get(owner, "PERSONA", profile.persona_id)
    if existing:
        profile.budget.version = int(existing.get("budget", {}).get("version", 1)) + 1
        profile.created_at = existing.get("created_at", profile.created_at)
    get_store().put(owner, "PERSONA", profile.persona_id, profile.model_dump(mode="json"))
    return profile


def delete_persona(owner: str, persona_id: str) -> None:
    get_store().delete(owner, "PERSONA", persona_id)


def _build_holdings(inputs: list[dict], as_of: pd.Timestamp | None) -> tuple[list[PortfolioHolding], str | None]:
    md = get_market_data()
    ts = as_of or md.end_date
    qs = quantities_from_amounts(md, inputs, ts)
    notes = [q["note"] for q in qs if q.get("note")]
    return [PortfolioHolding(asset_id=q["asset_id"], quantity=q["quantity"], note=q.get("note")) for q in qs], \
        ("Montants convertis en quantités simulées au " + ts.date().isoformat()) if notes else None


def create_portfolio(owner: str, req: PortfolioCreate, is_demo: bool = False, demo_id: str | None = None) -> Portfolio:
    holdings, note = _build_holdings([h.model_dump() for h in req.holdings], pd.Timestamp(req.as_of) if req.as_of else None)
    pid = demo_id or new_id("pf")
    pf = Portfolio(portfolio_id=pid, owner_id=owner, name=req.name, persona_id=req.persona_id, holdings=holdings,
                   target_weights=req.target_weights, valuation_note=note, is_demo=is_demo)
    get_store().put(owner, "PORTFOLIO", pid, pf.model_dump(mode="json"))
    return pf


def list_portfolios(owner: str) -> list[Portfolio]:
    items = [Portfolio(**p) for p in get_store().list(owner, "PORTFOLIO", 100)]
    return sorted(items, key=lambda p: p.created_at, reverse=True)


def get_portfolio(owner: str, portfolio_id: str) -> Portfolio:
    d = get_store().get(owner, "PORTFOLIO", portfolio_id)
    if not d:
        raise NotFound(f"portefeuille {portfolio_id} introuvable")
    return Portfolio(**d)


def add_holdings(owner: str, portfolio_id: str, inputs: list[dict]) -> Portfolio:
    pf = get_portfolio(owner, portfolio_id)
    new, _ = _build_holdings(inputs, None)
    pf.holdings += new
    pf.updated_at = utcnow()
    get_store().put(owner, "PORTFOLIO", portfolio_id, pf.model_dump(mode="json"))
    return pf


def replace_holdings(owner: str, portfolio_id: str, inputs: list[dict]) -> Portfolio:
    pf = get_portfolio(owner, portfolio_id)
    pf.holdings, _ = _build_holdings(inputs, None)
    pf.updated_at = utcnow()
    get_store().put(owner, "PORTFOLIO", portfolio_id, pf.model_dump(mode="json"))
    return pf


def delete_portfolio(owner: str, portfolio_id: str) -> None:
    get_store().delete(owner, "PORTFOLIO", portfolio_id)


def parse_csv(text: str) -> list[dict]:
    """Documented format: header `asset_id,quantity` or `asset_id,amount_cad` (one of the two per row)."""
    if len(text) > 200_000:
        raise ValueError("fichier CSV trop volumineux (max 200 Ko)")
    reader = csv.DictReader(io.StringIO(text.strip()))
    cols = {c.strip().lower() for c in (reader.fieldnames or [])}
    if "asset_id" not in cols or not ({"quantity", "amount_cad"} & cols):
        raise ValueError("colonnes requises: asset_id et quantity ou amount_cad")
    md = get_market_data()
    rows = []
    for i, r in enumerate(reader, start=2):
        r = {k.strip().lower(): (v or "").strip() for k, v in r.items() if k}
        aid = r["asset_id"].upper()
        if not md.has_asset(aid):
            raise DataUnavailableError(f"ligne {i}: actif inconnu « {aid} » (hors univers du jeu de données)")
        q, a = r.get("quantity"), r.get("amount_cad")
        try:
            if q:
                rows.append({"asset_id": aid, "quantity": float(q)})
            elif a:
                rows.append({"asset_id": aid, "amount_cad": float(a)})
            else:
                raise ValueError
        except ValueError:
            raise ValueError(f"ligne {i}: quantité ou montant invalide") from None
        if (rows[-1].get("quantity") or rows[-1].get("amount_cad")) <= 0:
            raise ValueError(f"ligne {i}: valeur non positive")
    if not rows:
        raise ValueError("aucune ligne")
    return rows
