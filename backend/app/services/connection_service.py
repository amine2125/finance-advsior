"""« Connecter mon compte de placement » — SIMULATED brokerage aggregation (sandbox).

No credential is ever requested or transmitted, no real institution is contacted: the challenge forbids real client accounts.
The sandbox returns a realistic EXISTING portfolio so the agents have something real-looking to analyse and compare:
  * accounts typical of a Canadian investor (CELI, REER, non enregistré, CELIAPP), each with its own style of holdings;
  * every position was "bought" on a past trading day at that day's real close (dataset prices, Bank of Canada FX),
    so cost, current value and gain/loss since purchase are all computed from real data;
  * deterministic per (user, institution): reconnecting shows the same accounts.
"""
from __future__ import annotations

import hashlib
import random

import pandas as pd

from ..data.loader import MarketData
from ..ids import new_id
from ..models import Portfolio, PortfolioHolding

INSTITUTIONS = [
    {"id": "bnc", "name": "Banque Nationale", "kind": "Banque"},
    {"id": "desjardins", "name": "Desjardins", "kind": "Coopérative"},
    {"id": "rbc", "name": "RBC Banque Royale", "kind": "Banque"},
    {"id": "td", "name": "TD", "kind": "Banque"},
    {"id": "bmo", "name": "BMO", "kind": "Banque"},
    {"id": "scotia", "name": "Banque Scotia", "kind": "Banque"},
    {"id": "cibc", "name": "CIBC", "kind": "Banque"},
    {"id": "wealthsimple", "name": "Wealthsimple", "kind": "Courtier en ligne"},
    {"id": "questrade", "name": "Questrade", "kind": "Courtier en ligne"},
    {"id": "disnat", "name": "Disnat", "kind": "Courtier en ligne"},
]

# Account styles seen in practice: a tech-heavy CELI, a "classic" REER, a speculative non-registered account, a cautious CELIAPP.
ACCOUNT_TYPES = {
    "celi": {"label": "CELI", "range": (12000, 45000),
             "mix": [("QQQ", .30), ("NVDA", .15), ("SHOP.TO", .12), ("AAPL", .10), ("XIU.TO", .18), ("MSFT", .15)]},
    "reer": {"label": "REER", "range": (20000, 80000),
             "mix": [("XIU.TO", .30), ("SPY", .25), ("RY.TO", .12), ("TD.TO", .10), ("XBB.TO", .15), ("ENB.TO", .08)]},
    "non_reg": {"label": "Non enregistré", "range": (5000, 30000),
                "mix": [("TSLA", .25), ("BTC-USD", .15), ("AMZN", .20), ("CNQ.TO", .15), ("GLD", .10), ("ATD.TO", .15)]},
    "celiapp": {"label": "CELIAPP", "range": (4000, 16000),
                "mix": [("XBB.TO", .40), ("ZST.TO", .30), ("XIU.TO", .30)]},
}
PURCHASE_WINDOW = ("2022-02-01", "2025-09-30")


def _rng(owner: str, inst: str) -> random.Random:
    return random.Random(int(hashlib.sha256(f"{owner}:{inst}".encode()).hexdigest()[:12], 16))


def _accounts(md: MarketData, owner: str, inst_id: str) -> list[dict]:
    rng = _rng(owner, inst_id)
    kinds = ["celi", "reer"] + (["non_reg"] if rng.random() < 0.75 else []) + (["celiapp"] if rng.random() < 0.4 else [])
    out = []
    start, end = pd.Timestamp(PURCHASE_WINDOW[0]), pd.Timestamp(PURCHASE_WINDOW[1])
    span = (end - start).days
    for k in kinds:
        t = ACCOUNT_TYPES[k]
        mix = [(a, w * rng.uniform(0.6, 1.4)) for a, w in t["mix"] if md.has_asset(a)]
        if len(mix) > 3 and rng.random() < 0.5:
            mix.pop(rng.randrange(len(mix)))
        tot_w = sum(w for _, w in mix)
        invested = round(rng.uniform(*t["range"]), -2)
        lines = []
        for a, w in mix:
            d = start + pd.Timedelta(days=rng.randrange(span))
            price, pdate = md.last_price(a, d, "close")
            fx, _ = md.fx_factor(md.asset(a)["currency"], pdate)
            amount = invested * w / tot_w
            qty = amount / (price * fx)
            lines.append({"asset_id": a, "quantity": qty, "acquisition_date": pdate.date().isoformat(), "acquisition_price": price,
                          "cost_cad": amount})
        now = 0.0
        for ln in lines:
            p, pd_ = md.last_price(ln["asset_id"], md.end_date, "close")
            fx, _ = md.fx_factor(md.asset(ln["asset_id"])["currency"], pd_)
            now += ln["quantity"] * p * fx
        out.append({"id": k, "label": t["label"], "number": f"•••• {rng.randrange(1000, 9999)}", "value_cad": round(now, 2),
                    "cost_cad": round(sum(x["cost_cad"] for x in lines), 2), "n_holdings": len(lines), "lines": lines})
    return out


def preview(md: MarketData, owner: str, inst_id: str) -> dict:
    inst = next((i for i in INSTITUTIONS if i["id"] == inst_id), None)
    if inst is None:
        raise ValueError("institution inconnue")
    accts = _accounts(md, owner, inst_id)
    return {"institution": inst, "accounts": [{k: v for k, v in a.items() if k != "lines"} for a in accts],
            "mode": "simulation", "note": "Aucune connexion réelle : comptes et placements simulés à partir de prix historiques réels."}


def connect(md: MarketData, owner: str, persona_id: str, inst_id: str, account_ids: list[str]) -> Portfolio:
    inst = next((i for i in INSTITUTIONS if i["id"] == inst_id), None)
    if inst is None:
        raise ValueError("institution inconnue")
    accts = [a for a in _accounts(md, owner, inst_id) if a["id"] in set(account_ids)]
    if not accts:
        raise ValueError("choisissez au moins un compte")
    holdings = [PortfolioHolding(asset_id=ln["asset_id"], quantity=ln["quantity"], acquisition_date=ln["acquisition_date"],
                                 acquisition_price=ln["acquisition_price"], note=f"Compte {a['label']} {a['number']}")
                for a in accts for ln in a["lines"]]
    return Portfolio(portfolio_id=new_id("pf"), owner_id=owner, name=inst["name"], persona_id=persona_id, holdings=holdings,
                     valuation_note=f"Comptes connectés (simulation) : {', '.join(a['label'] for a in accts)}")
