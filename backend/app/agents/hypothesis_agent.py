"""Agent 9 - Historical Validation / Hypothesis Testing. Deterministic: registers frozen specs, then evaluates walk-forward."""
from __future__ import annotations

from ..analytics import hypothesis as H
from ..analytics.ledger import MetricLedger
from ..data.loader import MarketData
from ..errors import NotFound
from ..ids import new_id
from ..models import utcnow
from ..storage.store import get_store

AGENT_ID = "hypothesis_agent"
SYSTEM_OWNER = "system"


def register(owner: str, md: MarketData, key: str, cutoff: str = H.DEFAULT_CUTOFF, assets: list[str] | None = None,
             overrides: dict | None = None) -> dict:
    if key not in H.TEMPLATES:
        raise ValueError(f"hypothèse inconnue {key}")
    assets = assets or (["SPY", "AGG"] if key == "H2" else list(md.universe.index))
    spec = H.build_spec(key, cutoff, assets, overrides)
    store = get_store()
    contaminated = False
    for prev in store.list(owner, "HYP", 200):
        if prev["spec"]["key"] == key and prev.get("result") and prev["spec"]["spec_hash"] != spec["spec_hash"] \
                and prev["spec"]["cutoff"] == cutoff:
            contaminated = True
    rec = {"hypothesis_id": new_id("hyp"), "owner": owner, "spec": spec, "registered_at": utcnow(), "status": "registered",
           "holdout_contaminated": contaminated,
           "contamination_note": ("Une évaluation hors échantillon existait déjà pour cette hypothèse avec d'autres paramètres: la période "
                                  "de test est contaminée; une nouvelle fenêtre d'évaluation est requise.") if contaminated else None,
           "result": None}
    store.put(owner, "HYP", rec["hypothesis_id"], rec)
    return rec


def evaluate(owner: str, md: MarketData, hypothesis_id: str) -> dict:
    store = get_store()
    rec = store.get(owner, "HYP", hypothesis_id)
    if not rec:
        raise NotFound("hypothèse introuvable")
    res = H.evaluate(md, rec["spec"])
    rec.update({"status": "evaluated" if res.get("status") == "evaluated" else res.get("status"), "result": res, "evaluated_at": utcnow()})
    store.put(owner, "HYP", hypothesis_id, rec)
    return rec


def standard_results(md: MarketData) -> dict[str, dict]:
    """Pre-registered H1–H4 at the default cutoff, evaluated once per dataset version (cached under the system partition)."""
    store = get_store()
    cache_id = f"std-{md.dataset_version}"
    cached = store.get(SYSTEM_OWNER, "HYP", cache_id)
    if cached:
        return cached["results"]
    results = {}
    for key in ("H1", "H2", "H3", "H4"):
        rec = register(SYSTEM_OWNER, md, key)
        results[key] = evaluate(SYSTEM_OWNER, md, rec["hypothesis_id"])
    store.put(SYSTEM_OWNER, "HYP", cache_id, {"results": results, "spec": {"key": "cache", "spec_hash": cache_id, "cutoff": ""}})
    return results


def register_metrics(results: dict[str, dict], led: MetricLedger) -> None:
    for key, rec in results.items():
        r = rec.get("result") or {}
        split = r.get("split", {})
        win = (split.get("holdout", [None, None])[0], split.get("holdout", [None, None])[1])
        if key == "H1" and r.get("pooled"):
            led.add("hyp.H1.mae_ewma", "H1 – erreur absolue moyenne EWMA (test)", r["pooled"]["mae_ewma"], "pct", "MAE vol. 21 j", window=win)
            led.add("hyp.H1.mae_longrun", "H1 – erreur absolue moyenne moyenne longue (test)", r["pooled"]["mae_longrun"], "pct", "MAE", window=win)
        if key == "H2" and r.get("dev_corr") is not None:
            led.add("hyp.H2.dev_corr", "H2 – corrélation SPY/AGG période de développement", r["dev_corr"], "ratio", "Pearson",
                    window=tuple(split.get("development", [None, None])))
            led.add("hyp.H2.share", "H2 – part des fenêtres test s'écartant de plus de 0,15", r["share_beyond_deviation"], "pct", "fenêtres 63 j", window=win)
            led.add("hyp.H2.min", "H2 – corrélation 63 j minimale (test)", r["holdout_min"], "ratio", "Pearson", window=win)
            led.add("hyp.H2.max", "H2 – corrélation 63 j maximale (test)", r["holdout_max"], "ratio", "Pearson", window=win)
        if key == "H3" and r.get("spearman") is not None:
            led.add("hyp.H3.spearman", "H3 – Spearman niveau de risque / perte max. test", r["spearman"], "ratio", "corrélation de rang", window=win)
        if key == "H4" and r.get("mean_ic") is not None:
            led.add("hyp.H4.mean_ic", "H4 – IC de rang moyen du momentum 12-1 (faible puissance)", r["mean_ic"], "ratio", "Spearman moyen", window=win)
            led.add("hyp.H4.t", "H4 – statistique t", r["t_stat"], "ratio", "moyenne/erreur-type", window=win)


def summary_text(results: dict[str, dict]) -> str:
    lines = []
    for key, rec in results.items():
        r = rec.get("result") or {}
        verdict = "CONFIRMÉE" if r.get("supported") else ("NON CONFIRMÉE" if r.get("status") == "evaluated" else "NON ÉVALUABLE")
        lines.append(f"{key} ({H.TEMPLATES[key]['title']}): {verdict} hors échantillon {r.get('split', {}).get('holdout')}")
    return "TESTS D'HYPOTHÈSES PRÉ-ENREGISTRÉES (agent de validation historique):\n" + "\n".join(lines)
