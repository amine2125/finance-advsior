"""Module C - Portfolio Guardian deterministic rules. Levels describe review urgency, never predicted outcomes."""
from __future__ import annotations

import numpy as np

from ..analytics.risk import simple_returns
from ..i18n import sector_fr
from ..methodology import METHODOLOGY
from ..models import InvestorProfile, Severity

SKIP = ("Diversified", "Fixed Income", "Commodities", "Cryptoassets")


def _pct(x):
    return f"{x * 100:.1f} %".replace(".", ",")


def evaluate(md, xr: dict, persona: InvestorProfile | None, target_weights: dict | None, research: list[dict] | None = None,
             value_drawdown: float | None = None) -> list[dict]:
    cfg = METHODOLOGY["guardian"]
    out: list[dict] = []
    led = xr["ledger"]
    weights = {p["asset_id"]: p["weight"] for p in xr["positions"]}
    pa = xr.get("persona_assessment") or {}
    b = persona.budget if persona else None
    # 1-2 concentration rules (persona-aware thresholds)
    sectors = {k: v for k, v in xr["exposures"]["sector"].items() if k not in SKIP}
    if sectors and b:
        s, w = max(sectors.items(), key=lambda kv: kv[1])
        if w > b.max_single_sector:
            out.append({"rule_id": "sector_concentration", "severity": Severity.CRITICAL if w > 1.5 * b.max_single_sector else Severity.WARNING,
                        "title": f"Concentration sectorielle : {sector_fr(s)} {_pct(w)}", "trigger": f"{_pct(w)} > plafond {_pct(b.max_single_sector)} du profil",
                        "assets": [a for a, p in ((p["asset_id"], p) for p in xr["positions"]) if p["sector"] == s], "key": s,
                        "metrics": {"sector_weight": w, "limit": b.max_single_sector}, "constraint": f"Secteur max. {_pct(b.max_single_sector)}",
                        "explanation": "Exposition directe (titres individuels); les FNB ne sont pas reclassés sans composition vérifiée."})
    singles = {p["asset_id"]: p["weight"] for p in xr["positions"] if p["is_single_issuer"] and p["asset_class"] != "crypto"}
    if singles and b:
        a, w = max(singles.items(), key=lambda kv: kv[1])
        if w > b.max_single_issuer:
            out.append({"rule_id": "single_asset_concentration", "severity": Severity.CRITICAL if w > 2 * b.max_single_issuer else Severity.WARNING,
                        "title": f"Position dominante : {a} {_pct(w)}", "trigger": f"{_pct(w)} > plafond émetteur {_pct(b.max_single_issuer)}",
                        "assets": [a], "key": a, "metrics": {"weight": w, "limit": b.max_single_issuer},
                        "constraint": f"Émetteur max. {_pct(b.max_single_issuer)}", "explanation": "Un seul émetteur peut subir une perte permanente."})
    # 3 risk drift
    if pa and pa.get("portfolio_tier") not in (None, "UNKNOWN"):
        order = ["LOW", "MEDIUM", "HIGH"]
        if order.index(pa["portfolio_tier"]) > order.index(pa["allowed_tier"]):
            out.append({"rule_id": "risk_drift", "severity": Severity.WARNING, "title": f"Niveau de risque {pa['portfolio_tier']} > permis {pa['allowed_tier']}",
                        "trigger": "niveau mesuré du portefeuille au-dessus du niveau permis (règle de l'horizon)", "assets": list(weights), "key": "tier",
                        "metrics": {"vol": led.get("pf.vol", {}).get("value"), "mdd": led.get("pf.mdd", {}).get("value")},
                        "constraint": f"Niveau permis {pa['allowed_tier']} ({', '.join(pa.get('binding_inputs', []))})",
                        "explanation": "La volatilité et la perte historiques des pondérations actuelles dépassent la plage du niveau permis."})
    # 4 correlation rise
    roll = [r["value"] for r in xr["risk"].get("rolling_avg_corr", [])]
    if len(roll) >= 20:
        base = float(np.median(roll[:-4]))
        cur = roll[-1]
        if cur - base > cfg["corr_rise_threshold"]:
            out.append({"rule_id": "correlation_rise", "severity": Severity.INFO, "title": f"Corrélation moyenne en hausse : {cur:.2f} vs {base:.2f}".replace(".", ","),
                        "trigger": f"hausse > {cfg['corr_rise_threshold']} sur fenêtre glissante 63 j", "assets": list(weights), "key": "corr",
                        "metrics": {"current": cur, "baseline_median": base}, "constraint": None,
                        "explanation": "Des positions auparavant moins corrélées évoluent davantage ensemble: la diversification observée diminue."})
    # 5 drawdown review
    dd = value_drawdown if value_drawdown is not None else led.get("pf.current_dd", {}).get("value")
    if dd is not None and b and dd <= b.drawdown_review:
        out.append({"rule_id": "drawdown_review", "severity": Severity.CRITICAL if dd <= 1.5 * b.drawdown_review else Severity.WARNING,
                    "title": f"Recul de {_pct(dd)} depuis le sommet", "trigger": f"recul ≤ seuil de revue {_pct(b.drawdown_review)} du profil",
                    "assets": list(weights), "key": "dd", "metrics": {"drawdown": dd, "threshold": b.drawdown_review},
                    "constraint": f"Revue si perte ≤ {_pct(b.drawdown_review)}",
                    "explanation": "Seuil de revue atteint. Cela ne dit rien de la suite: c'est un signal d'examen, pas une prévision."})
    # 6 allocation drift
    if target_weights:
        diffs = {a: weights.get(a, 0.0) - t for a, t in target_weights.items()}
        a, d = max(diffs.items(), key=lambda kv: abs(kv[1]))
        if abs(d) > cfg["drift_tolerance"]:
            out.append({"rule_id": "allocation_drift", "severity": Severity.INFO if abs(d) < 2 * cfg["drift_tolerance"] else Severity.WARNING,
                        "title": f"Dérive d'allocation : {a} {d * 100:+.1f} pts".replace(".", ","), "trigger": f"écart > {cfg['drift_tolerance'] * 100:.0f} pts vs cible",
                        "assets": [a], "key": a, "metrics": {"weight": weights.get(a, 0.0), "target": target_weights[a]}, "constraint": "Allocation cible enregistrée",
                        "explanation": "La pondération réelle s'est écartée de la cible enregistrée sous l'effet des prix."})
    # 7 market volatility (benchmark 21-day vol percentile, data available at as_of only)
    try:
        r = simple_returns(md.native_series("SPY", "adj_close"))
        rv = r.rolling(21).std().dropna()
        if len(rv) > 120:
            pct = float((rv <= rv.iloc[-1]).mean())
            if pct >= cfg["market_vol_percentile"]:
                out.append({"rule_id": "market_volatility", "severity": Severity.INFO, "title": f"Volatilité de marché élevée (centile {pct * 100:.0f})",
                            "trigger": f"vol. 21 j de SPY ≥ centile {cfg['market_vol_percentile'] * 100:.0f} de son historique", "assets": ["SPY"], "key": "mkt",
                            "metrics": {"percentile": pct}, "constraint": None,
                            "explanation": "Indicateur de risque au-dessus d'un seuil transparent; ce n'est pas une prédiction de krach."})
    except Exception:  # noqa: BLE001
        pass
    # 8 data quality
    stale = xr["data_quality"].get("stale_assets") or []
    if stale:
        out.append({"rule_id": "data_quality", "severity": Severity.WARNING, "title": "Données périmées : " + ", ".join(stale),
                    "trigger": f"dernier cours > {cfg['stale_business_days']} jours ouvrables", "assets": stale, "key": ",".join(stale),
                    "metrics": {}, "constraint": None, "explanation": "Les métriques dépendant de ces actifs sont moins fiables."})
    # 9-10 verified events / attention / rumors (only from research actually executed)
    for res in research or []:
        a = res["asset_id"]
        flags = [f for e in res.get("events", []) if e.get("primary_source") for f in e.get("red_flags", [])]
        if flags:
            out.append({"rule_id": "verified_event", "severity": Severity.WARNING, "title": f"Événement vérifié pour {a} : {', '.join(sorted(set(flags)))}",
                        "trigger": "dépôt officiel SEC avec un élément 8-K sensible", "assets": [a], "key": a, "metrics": {}, "constraint": None,
                        "explanation": "Fait vérifié (dépôt officiel). Son effet sur le prix n'est pas établi."})
        att = res.get("attention", {})
        if att.get("value") is not None and att["value"] >= 70:
            out.append({"rule_id": "attention_spike", "severity": Severity.INFO, "title": f"Pic d'attention pour {a} (indice {att['value']:.0f})",
                        "trigger": "indice heuristique d'attention ≥ 70", "assets": [a], "key": a, "metrics": {"index": att["value"]}, "constraint": None,
                        "explanation": "Hausse de l'attention mesurée; ce n'est pas une détérioration confirmée des fondamentaux."})
        unv = [c for c in res.get("claims", []) if c["status"] in ("UNVERIFIED", "DISPUTED", "FALSE_AS_SUPPORTED_BY_EVIDENCE")
               and c["claim_type"] not in ("analyst_opinion_forecast",)]
        if unv:
            out.append({"rule_id": "unverified_claims", "severity": Severity.INFO, "title": f"{len(unv)} affirmation(s) non vérifiée(s) ou contredite(s) sur {a}",
                        "trigger": "affirmations en circulation sans preuve primaire après investigation", "assets": [a], "key": a,
                        "metrics": {"count": len(unv)}, "constraint": None, "no_push": True,
                        "explanation": "Non vérifié: l'alerte ne reprend pas le contenu des rumeurs et n'est jamais poussée en notification."})
    return out
