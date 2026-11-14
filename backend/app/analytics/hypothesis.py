"""Section 16A.3 / 16B.1: pre-registered hypotheses evaluated walk-forward on an untouched holdout.

Protocol: the specification (statement, assets, windows, thresholds, success criterion) is frozen and hashed
at registration. Development-window quantities are computed on `md.as_of(cutoff)` only, so no later
observation can leak into them. If a specification for the same hypothesis key is changed after a holdout
evaluation exists, the new registration is flagged `holdout_contaminated`.
"""
from __future__ import annotations

import hashlib
import json
import math

import numpy as np
import pandas as pd

from ..data.loader import DataUnavailableError, MarketData
from ..methodology import METHODOLOGY
from .risk import ewma_vol, max_drawdown, simple_returns, spearman
from .tiers import classify_risk_tier
from .trend import momentum_12_1

DEFAULT_CUTOFF = "2024-06-28"

TEMPLATES: dict[str, dict] = {
    "H1": {"key": "H1", "title": "Persistance de la volatilité",
           "statement": "Pour les actifs de l'univers, une prévision EWMA (λ=0,94) de la volatilité réalisée des 21 prochaines "
                        "séances a une erreur absolue moyenne plus faible sur la période de test que la moyenne historique longue.",
           "params": {"lambda": 0.94, "horizon": 21, "origin_step": 21, "min_history": 120},
           "success": "MAE_EWMA groupée < MAE_moyenne_longue groupée", "low_power": False},
    "H2": {"key": "H2", "title": "Diversification instable (actions/obligations)",
           "statement": "La corrélation glissante 63 j entre SPY et AGG sur la période de test s'écarte de l'estimation de la période "
                        "de développement de plus de 0,15 dans plus de 25 % des fenêtres.",
           "params": {"a": "SPY", "b": "AGG", "window": 63, "deviation": 0.15, "share_threshold": 0.25, "step": 5},
           "success": "part des fenêtres avec |écart| > 0,15 supérieure à 25 %", "low_power": False},
    "H3": {"key": "H3", "title": "Les niveaux de risque portent de l'information",
           "statement": "Les niveaux de risque attribués à la date de coupure classent la perte maximale réalisée des actifs sur la "
                        "période de test (corrélation de rang de Spearman > 0,30).",
           "params": {"rho_threshold": 0.30}, "success": "Spearman(niveau, |perte max test|) > 0,30", "low_power": True},
    "H4": {"key": "H4", "title": "Momentum 12-1 (faible puissance)",
           "statement": "Le momentum 12-1 classe les rendements des 3 mois suivants (IC de rang moyen > 0 et t > 2).",
           "params": {"horizon": 63, "origin_step": 63}, "success": "IC moyen > 0 avec t-stat > 2",
           "low_power": True},
}


def spec_hash(spec: dict) -> str:
    core = {k: spec[k] for k in ("key", "statement", "params", "success", "cutoff", "assets")}
    return hashlib.sha256(json.dumps(core, sort_keys=True, default=str).encode()).hexdigest()[:16]


def build_spec(key: str, cutoff: str, assets: list[str], overrides: dict | None = None) -> dict:
    t = json.loads(json.dumps(TEMPLATES[key]))
    if overrides:
        t["params"].update(overrides)
    t.update({"cutoff": cutoff, "assets": sorted(assets)})
    t["spec_hash"] = spec_hash(t)
    return t


def _holdout_returns(md: MarketData, asset: str, cutoff: pd.Timestamp) -> tuple[pd.Series, pd.Series]:
    r = simple_returns(md.native_series(asset, "adj_close"))
    return r[r.index <= cutoff], r[r.index > cutoff]


def eval_h1(md: MarketData, spec: dict) -> dict:
    p = spec["params"]
    cutoff = pd.Timestamp(spec["cutoff"])
    per_asset, err_e, err_l = [], [], []
    for a in spec["assets"]:
        r = simple_returns(md.native_series(a, "adj_close"))
        ppy = md.periods_per_year(a)
        hold_idx = np.where(r.index > cutoff)[0]
        if len(hold_idx) < p["horizon"] * 3:
            continue
        ae, al = [], []
        for pos in range(hold_idx[0], len(r) - p["horizon"], p["origin_step"]):
            past = r.iloc[:pos]
            if len(past) < p["min_history"]:
                continue
            fut = r.iloc[pos:pos + p["horizon"]]
            realized = float(fut.std(ddof=1) * math.sqrt(ppy))
            f_e = ewma_vol(past, ppy, p["lambda"])
            f_l = float(past.std(ddof=1) * math.sqrt(ppy))
            ae.append(abs(f_e - realized))
            al.append(abs(f_l - realized))
        if ae:
            per_asset.append({"asset_id": a, "n_origins": len(ae), "mae_ewma": float(np.mean(ae)), "mae_longrun": float(np.mean(al)),
                              "ewma_better": float(np.mean(ae)) < float(np.mean(al))})
            err_e += ae
            err_l += al
    if not err_e:
        return {"status": "insufficient_data"}
    mae_e, mae_l = float(np.mean(err_e)), float(np.mean(err_l))
    diff = np.array(err_l) - np.array(err_e)
    se = float(diff.std(ddof=1) / math.sqrt(len(diff))) if len(diff) > 1 else None
    return {"status": "evaluated", "supported": mae_e < mae_l, "pooled": {"mae_ewma": mae_e, "mae_longrun": mae_l,
            "improvement": 1 - mae_e / mae_l, "n_forecasts": len(err_e), "diff_mean": float(diff.mean()), "diff_se": se,
            "assets_where_ewma_better": sum(1 for x in per_asset if x["ewma_better"]), "n_assets": len(per_asset)},
            "per_asset": per_asset, "baseline": "moyenne historique longue (écart-type de tout le passé disponible)",
            "caveat": "Origines chevauchant des régimes; les erreurs ne sont pas indépendantes entre actifs."}


def eval_h2(md: MarketData, spec: dict) -> dict:
    p = spec["params"]
    cutoff = pd.Timestamp(spec["cutoff"])
    dev = md.as_of(cutoff)
    ra = simple_returns(dev.native_series(p["a"], "adj_close"))
    rb = simple_returns(dev.native_series(p["b"], "adj_close"))
    dev_df = pd.concat([ra, rb], axis=1, join="inner").dropna()
    dev_corr = float(dev_df.corr().iloc[0, 1])
    full = pd.concat([simple_returns(md.native_series(p["a"], "adj_close")), simple_returns(md.native_series(p["b"], "adj_close"))],
                     axis=1, join="inner").dropna()
    hold = full[full.index > cutoff]
    vals = []
    for end in range(p["window"], len(hold) + 1, p["step"]):
        w = hold.iloc[end - p["window"]:end]
        vals.append({"date": w.index[-1].date().isoformat(), "corr": float(w.corr().iloc[0, 1])})
    if not vals:
        return {"status": "insufficient_data"}
    devs = [abs(v["corr"] - dev_corr) for v in vals]
    share = float(np.mean([d > p["deviation"] for d in devs]))
    return {"status": "evaluated", "supported": share > p["share_threshold"], "dev_corr": dev_corr, "dev_n_obs": int(len(dev_df)),
            "holdout_windows": len(vals), "share_beyond_deviation": share, "mean_abs_deviation": float(np.mean(devs)),
            "holdout_min": float(min(v["corr"] for v in vals)), "holdout_max": float(max(v["corr"] for v in vals)),
            "series": vals[:: max(1, len(vals) // 120)]}


def eval_h3(md: MarketData, spec: dict) -> dict:
    cutoff = pd.Timestamp(spec["cutoff"])
    order = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    rows = []
    for a in spec["assets"]:
        t = classify_risk_tier(md, a, cutoff)  # uses only data <= cutoff
        if t["tier"] == "UNKNOWN":
            continue
        prices = md.native_series(a, "adj_close")
        hold = prices[prices.index > cutoff]
        dd = max_drawdown(hold)
        if dd is None:
            continue
        rows.append({"asset_id": a, "tier_at_cutoff": t["tier"], "holdout_mdd": dd["max_drawdown"]})
    rho = spearman([order[r["tier_at_cutoff"]] for r in rows], [-r["holdout_mdd"] for r in rows])
    thr = spec["params"]["rho_threshold"]
    by_tier = {}
    for r in rows:
        by_tier.setdefault(r["tier_at_cutoff"], []).append(r["holdout_mdd"])
    return {"status": "evaluated" if rho is not None else "insufficient_data", "supported": rho is not None and rho > thr,
            "spearman": rho, "n_assets": len(rows), "rows": rows,
            "median_mdd_by_tier": {k: float(np.median(v)) for k, v in by_tier.items()},
            "caveat": "Échantillon de 31 actifs sélectionnés (biais de sélection); nombreux ex aequo dans les niveaux."}


def eval_h4(md: MarketData, spec: dict) -> dict:
    p = spec["params"]
    cutoff = pd.Timestamp(spec["cutoff"])
    assets = [a for a in spec["assets"] if md.calendar_of(a) == "business"]
    panel = md.adj_close[assets].dropna(how="all")
    idx = np.where(panel.index > cutoff)[0]
    ics = []
    for pos in range(idx[0], len(panel) - p["horizon"], p["origin_step"]):
        moms, fwd = [], []
        for a in assets:
            s = panel[a].iloc[:pos + 1].dropna()
            m = momentum_12_1(s)
            f = panel[a].iloc[pos + p["horizon"]] / panel[a].iloc[pos] - 1
            if m is not None and pd.notna(f):
                moms.append(m)
                fwd.append(float(f))
        ic = spearman(moms, fwd)
        if ic is not None:
            ics.append({"date": panel.index[pos].date().isoformat(), "ic": ic, "n": len(moms)})
    if len(ics) < 2:
        return {"status": "insufficient_data"}
    vals = np.array([x["ic"] for x in ics])
    t = float(vals.mean() / (vals.std(ddof=1) / math.sqrt(len(vals))))
    return {"status": "evaluated", "supported": bool(vals.mean() > 0 and t > 2), "mean_ic": float(vals.mean()), "t_stat": t,
            "n_origins": len(ics), "ics": ics, "low_power": True,
            "caveat": "Faible puissance: 29 actifs non crypto, peu d'origines indépendantes."}


EVALUATORS = {"H1": eval_h1, "H2": eval_h2, "H3": eval_h3, "H4": eval_h4}


def evaluate(md: MarketData, spec: dict) -> dict:
    if spec_hash(spec) != spec["spec_hash"]:
        return {"status": "rejected", "reason": "La spécification a été modifiée après enregistrement (empreinte différente)"}
    cutoff = pd.Timestamp(spec["cutoff"])
    try:
        res = EVALUATORS[spec["key"]](md, spec)
    except (DataUnavailableError, KeyError, IndexError, ValueError) as exc:
        res = {"status": "insufficient_data", "supported": None, "reason": f"{exc.__class__.__name__}: {str(exc)[:200]}"}
    hold_end = md.end_date.date().isoformat()
    res.update({"hypothesis_key": spec["key"], "spec_hash": spec["spec_hash"],
                "split": {"development": [md.start_date.date().isoformat(), spec["cutoff"]],
                          "holdout": [(cutoff + pd.Timedelta(days=1)).date().isoformat(), hold_end]},
                "methodology_version": METHODOLOGY["version"], "dataset_version": md.dataset_version,
                "costs": "Aucun coût de transaction: tests statistiques, pas de stratégie négociée",
                "interpretation": "Association historique hors échantillon, pas une preuve causale ni une prévision fiable",
                "survivorship": "Univers de départ = liste sélectionnée, pas un univers investissable complet"})
    return res
