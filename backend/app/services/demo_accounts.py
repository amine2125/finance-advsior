"""Demo accounts for the jury: the three investors of the official brief (Amira, Mateo, Robert), as REAL Cognito accounts.

Each one is an ordinary account — same questionnaire answers (editable), same profile engine, same agents — pre-filled so a
judge can sign in and test at once. Their data is (re)created on first sign-in when the account is empty, so « Tout effacer »
gives the next judge a clean demo. Portfolios are fictional but priced with real historical closes (gains are real numbers).
"""
from __future__ import annotations

import datetime as dt
import os

import pandas as pd

from ..analytics.profile_builder import OnboardingAnswers, build_profile
from ..data.registry import get_market_data
from ..models import Portfolio, PortfolioHolding
from ..ids import new_id
from ..storage.store import get_store
from . import portfolio_service as ps

PASSWORD_ENV = "AEGIS_DEMO_PASSWORD"
DEFAULT_PASSWORD = "AegisDemo2026!"

_BASE = dict(credit_card_debt_cad=0, other_debt_cad=0, esg_preference=False, interests=[], excluded_sectors=[])

DEMO: list[dict] = [
    {"key": "amira", "email": "amira@demo.aegis-finance.ca", "name": "Amira",
     "tagline": "26 ans · profil élevé · croissance, technologie et un peu de crypto", "cash": 5000.0,
     "answers": dict(display_name="Amira", age=26, household="single", dependants_count=0, employment="permanent", income_outlook="up",
                     income_net_monthly=4800, expenses_monthly=3000, savings_cad=15000, investments_cad=25000, home_owner=False, capital_cad=10000,
                     knowledge_self="basic", products_held=["savings", "etf", "stocks", "crypto"], quiz_diversification="b", quiz_bonds="b",
                     quiz_inflation="c", objective="growth", horizon_years=20, liquidity_needs="low", portfolio_choice="D", max_decline=0.45,
                     gamble="big_risk", drop_reaction="buy_more", volatility_feeling="ok", past_behavior="bought", crypto_interest="yes",
                     interests=["Technologie et IA"]),
     "accounts": {"CELI": [("QQQ", 6000, "2023-03-15"), ("NVDA", 4000, "2023-06-01"), ("SHOP.TO", 2500, "2024-02-12"), ("MSFT", 3000, "2023-09-20")],
                  "Non enregistré": [("BTC-USD", 2500, "2024-01-15"), ("XIU.TO", 4000, "2022-11-01"), ("ESGV", 3000, "2023-01-10")]}},
    {"key": "mateo", "email": "mateo@demo.aegis-finance.ca", "name": "Mateo",
     "tagline": "41 ans · profil modéré · deux enfants, préférences ESG", "cash": 10000.0,
     "answers": dict(display_name="Mateo", age=41, household="couple_kids", dependants_count=2, employment="permanent", income_outlook="stable",
                     income_net_monthly=7500, expenses_monthly=5600, savings_cad=42000, investments_cad=50000, home_owner=True, capital_cad=50000,
                     knowledge_self="good", products_held=["savings", "mutual_funds", "etf"], quiz_diversification="b", quiz_bonds="a",
                     quiz_inflation="c", objective="balanced", horizon_years=10, liquidity_needs="moderate", portfolio_choice="C", max_decline=0.3,
                     gamble="small_risk", drop_reaction="hold", volatility_feeling="ok", past_behavior="held", crypto_interest="no",
                     esg_preference=True, excluded_sectors=["Energy"]),
     "accounts": {"REER": [("ESGV", 11000, "2022-06-15"), ("XIU.TO", 8000, "2022-10-03"), ("XBB.TO", 13000, "2023-02-01")],
                  "CELI": [("AGG", 8000, "2023-05-15"), ("XBB.TO", 5000, "2024-03-01"), ("FTS.TO", 2500, "2023-08-10"), ("CNR.TO", 2500, "2024-05-20")]}},
    {"key": "robert", "email": "robert@demo.aegis-finance.ca", "name": "Robert",
     "tagline": "59 ans · profil faible à modéré · attiré par les titres populaires", "cash": 20000.0,
     "answers": dict(display_name="Robert", age=59, household="couple", dependants_count=0, employment="permanent", income_outlook="stable",
                     income_net_monthly=6500, expenses_monthly=4500, savings_cad=40000, investments_cad=100000, home_owner=True, capital_cad=100000,
                     knowledge_self="basic", products_held=["savings", "gic", "mutual_funds", "stocks"], quiz_diversification="b", quiz_bonds="b",
                     quiz_inflation="c", objective="income", horizon_years=5, liquidity_needs="moderate", portfolio_choice="B", max_decline=0.2,
                     gamble="small_risk", drop_reaction="hold", volatility_feeling="uneasy", past_behavior="held", crypto_interest="maybe",
                     interests=["Dividendes stables", "Entreprises canadiennes"]),
     "accounts": {"REER": [("NVDA", 18000, "2023-11-01"), ("MSFT", 15000, "2023-04-03"), ("QQQ", 15000, "2022-09-01"), ("SPY", 12000, "2022-12-01")],
                  "Non enregistré": [("TSLA", 8000, "2024-06-03"), ("XBB.TO", 20000, "2022-03-01"), ("ZST.TO", 12000, "2024-09-03")]}},
]
BY_EMAIL = {d["email"]: d for d in DEMO}


def password() -> str:
    return os.getenv(PASSWORD_ENV, DEFAULT_PASSWORD)


def public_list() -> list[dict]:
    """What the sign-in page shows: who they are and how to sign in (fictional demo accounts, no real data)."""
    return [{"key": d["key"], "name": d["name"], "email": d["email"], "password": password(), "tagline": d["tagline"]} for d in DEMO]


def _portfolio(owner: str, persona_id: str, spec: dict) -> Portfolio:
    md = get_market_data()
    holdings = []
    for label, lines in spec["accounts"].items():
        for asset_id, amount, day in lines:
            if not md.has_asset(asset_id):
                continue
            price, pdate = md.last_price(asset_id, pd.Timestamp(day), "close")
            fx, _ = md.fx_factor(md.asset(asset_id)["currency"], pdate)
            holdings.append(PortfolioHolding(asset_id=asset_id, quantity=amount / (price * fx), acquisition_date=pdate.date().isoformat(),
                                             acquisition_price=price, note=f"Compte {label} •••• {1000 + sum(map(ord, spec['key'] + label)) % 9000}"))
    return Portfolio(portfolio_id=new_id("pf"), owner_id=owner, name="Banque Nationale (démo)", persona_id=persona_id, holdings=holdings,
                     valuation_note="Compte de démonstration : placements fictifs, achetés aux vrais prix historiques.")


def seed_if_empty(owner: str, email: str | None) -> bool:
    """Creates the demo investor's profile, answers and portfolio the first time the demo account is used (or after a reset)."""
    spec = BY_EMAIL.get((email or "").lower())
    if spec is None:
        return False
    if ps.list_personas(owner):
        from . import wallet
        if wallet.get(owner, create=False) is None:  # demo accounts created before simulated cash existed
            wallet.set_start(owner, spec["cash"])
        return False
    answers = OnboardingAnswers(**{**_BASE, **spec["answers"]})
    profile, derivation = build_profile(answers)
    saved = ps.save_persona(owner, profile)
    store = get_store()
    store.put(owner, "META", "onboarding", {"answers": answers.model_dump(mode="json"), "derivation": derivation,
                                            "at": dt.datetime.utcnow().isoformat(), "demo": spec["key"]})
    pf = _portfolio(owner, saved.persona_id, spec)
    store.put(owner, "PORTFOLIO", pf.portfolio_id, pf.model_dump(mode="json"))
    from . import wallet
    wallet.set_start(owner, spec["cash"])
    return True
