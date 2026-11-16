"""ULYSSE market signals used by the AEGIS interface. Each one is computed from data public at the date used, never a forecast.

- climat(): the market regime (calm / tense / agitated) from a 3-component Gaussian mixture on weekly market features;
- attention(): unusual attention per security (Wikipedia views and traded volume vs. their own history, Isolation Forest);
- fiche(t): extra risk facts for one security (CVaR, recent risk, longest time below a previous peak, attention).
Only plain numbers leave this module; the AEGIS API turns them into French sentences.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from ulysse.analytics import core, hype, regime
from ulysse.config import DEFAULT_ASOF
from ulysse.data.datapack import get_datapack

REGIME_FR = {"calme": "calme", "tendu": "tendu", "agité": "agité"}


def _view(as_of: str | None):
    dp = get_datapack()
    return dp, dp.asof(as_of or DEFAULT_ASOF or str(dp.last_day + np.timedelta64(2, "D")))


@lru_cache(maxsize=4)
def climat(as_of: str | None = None) -> dict:
    _, v = _view(as_of)
    e = regime.ev_regime(v)
    val = e.valeur or {}
    return {"as_of": e.as_of, "regime": val.get("regime"), "semaines": val.get("semaines_consecutives"),
            "probabilites_pct": val.get("probabilites_pct") or {}, "methode": "Mélange gaussien à 3 états sur des mesures hebdomadaires du marché (S&P 500, TSX 60, pente des taux)",
            "statut": e.statut}


def _attention_one(v, t: str) -> dict | None:
    e = hype.ev_engouement(v, t)
    val = e.valeur or {}
    if e.statut != "ok" or not val:
        return None
    return {"asset_id": t, "inhabituel": bool(val.get("engouement")), "plus_inhabituel_que_pct": val.get("plus_inhabituel_que_pct_des_jours"),
            "vues_x": val.get("vues_vs_habituel"), "volume_x": val.get("volume_vs_habituel"), "rendement_20j_pct": val.get("rendement_20j_pct")}


@lru_cache(maxsize=4)
def attention(as_of: str | None = None) -> list[dict]:
    """Every stock and crypto of the universe, most unusual first."""
    dp, v = _view(as_of)
    rows = [r for a in dp.assets if a["asset_class"] in ("equity", "crypto") and v.first_valid(a["ticker"]) is not None
            for r in [_attention_one(v, a["ticker"])] if r]
    return sorted(rows, key=lambda r: (not r["inhabituel"], -(r["plus_inhabituel_que_pct"] or 0)))


def fiche(t: str, as_of: str | None = None) -> dict | None:
    dp, v = _view(as_of)
    if t not in dp.idx or v.first_valid(t) is None:
        return None
    cv = core.cvar(v, t, horizon=20).valeur or {}
    ew = [e.valeur for e in core.ewma(v, t)]
    under = core.duree_sous_l_eau(v, t).valeur or {}
    out = {"asset_id": t, "cvar_20j_pct": cv.get("cvar_pct"), "var_20j_pct": cv.get("var_pct"),
           "vol_recente_pct": ew[0] if ew else None, "ratio_risque_recent": ew[1] if len(ew) > 1 else None,
           "sous_l_eau_annees": under.get("annees"), "sous_l_eau_debut": under.get("debut"), "sous_l_eau_fin": under.get("fin"),
           "sous_l_eau_termine": under.get("termine"), "attention": None}
    if dp.asset[t]["asset_class"] in ("equity", "crypto"):
        out["attention"] = _attention_one(v, t)
    return out


def export_all(path, as_of: str | None = None) -> dict:
    """Pre-computes every signal for the datapack date into one small JSON file, so a deployment can serve them without
    shipping the statistical engine (scikit-learn, SciPy) inside the Lambda package."""
    import json
    from pathlib import Path

    dp, v = _view(as_of)
    out = {"as_of": str(v.day), "climat": climat(as_of), "attention": attention(as_of),
           "fiches": {a["ticker"]: fiche(a["ticker"], as_of) for a in dp.assets}}
    Path(path).write_text(json.dumps(out, ensure_ascii=False, default=str), encoding="utf-8")
    return out


if __name__ == "__main__":  # python -m ulysse.signaux <output.json>
    import sys

    export_all(sys.argv[1] if len(sys.argv) > 1 else "signals.json")
