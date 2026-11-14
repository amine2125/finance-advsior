"""Module F - What Changed? Compares two analysis snapshots and attributes the value change.

Attribution (exact, additive):
  market effect      = Σ q_old,i × (P_new,i·FX_new,i − P_old,i·FX_old,i)       (same quantities, new prices/FX)
  composition effect = Σ (q_new,i − q_old,i) × P_new,i·FX_new,i                 (quantity changes valued at new prices)
  total change       = market effect + composition effect
Data / methodology changes are reported separately (dataset, methodology and calculation versions).
"""
from __future__ import annotations

from ..storage.store import get_store


def _unit_value(s: dict, a: str) -> float | None:
    q = s["quantities"].get(a)
    v = s["values_cad"].get(a)
    if not q or v is None:
        return None
    return v / q


def compare(old: dict, new: dict) -> dict:
    assets = sorted(set(old["quantities"]) | set(new["quantities"]))
    market, comp, rows = 0.0, 0.0, []
    for a in assets:
        q0, q1 = old["quantities"].get(a, 0.0), new["quantities"].get(a, 0.0)
        u0, u1 = _unit_value(old, a), _unit_value(new, a)
        m = q0 * (u1 - u0) if (u0 is not None and u1 is not None) else 0.0
        c = (q1 - q0) * u1 if u1 is not None else (-(q0 * u0) if u0 is not None else 0.0)
        market += m
        comp += c
        rows.append({"asset_id": a, "weight_before": old["weights"].get(a, 0.0), "weight_after": new["weights"].get(a, 0.0),
                     "weight_change": new["weights"].get(a, 0.0) - old["weights"].get(a, 0.0), "market_effect": m, "composition_effect": c,
                     "price_change": (u1 / u0 - 1) if (u0 and u1) else None})
    metric_rows = []
    for k in sorted(set(old["key_metrics"]) | set(new["key_metrics"])):
        b, a = old["key_metrics"].get(k), new["key_metrics"].get(k)
        metric_rows.append({"metric": k, "before": b, "after": a, "change": (a - b) if a is not None and b is not None else None})
    sectors = sorted(set(old["sector_weights"]) | set(new["sector_weights"]))
    sec_rows = [{"sector": s, "before": old["sector_weights"].get(s, 0.0), "after": new["sector_weights"].get(s, 0.0),
                 "change": new["sector_weights"].get(s, 0.0) - old["sector_weights"].get(s, 0.0)} for s in sectors]
    material = [r for r in metric_rows if r["change"] is not None and abs(r["change"]) >= 0.02 and r["metric"] not in ("pf.effective_n",)]
    versions = {k: {"before": old.get(k), "after": new.get(k), "changed": old.get(k) != new.get(k)}
                for k in ("dataset_version", "methodology_version", "calculation_version")}
    total = new["total_value_cad"] - old["total_value_cad"]
    return {"before": {"snapshot_id": old["snapshot_id"], "as_of": old["as_of"], "label": old.get("label"), "total": old["total_value_cad"]},
            "after": {"snapshot_id": new["snapshot_id"], "as_of": new["as_of"], "label": new.get("label"), "total": new["total_value_cad"]},
            "total_change": total, "market_effect": market, "composition_effect": comp, "residual": total - market - comp,
            "assets": rows, "metrics": metric_rows, "sectors": sec_rows, "material_changes": material, "versions": versions,
            "alerts_before": old.get("alerts", []), "alerts_after": new.get("alerts", []),
            "hype_fit_before": old.get("hype_fit"), "hype_fit_after": new.get("hype_fit"),
            "explanation": ("Effet marché = mêmes quantités, nouveaux prix et taux de change; effet composition = variations de quantités "
                            "(transactions hypothétiques) aux nouveaux prix. Les changements de version de données ou de méthode sont listés à part.")}


def list_snapshots(owner: str, portfolio_id: str | None = None, limit: int = 50) -> list[dict]:
    snaps = get_store().list(owner, "SNAPSHOT", 200)
    if portfolio_id:
        snaps = [s for s in snaps if s["portfolio_id"] == portfolio_id]
    return snaps[:limit]


def compare_latest(owner: str, portfolio_id: str) -> dict | None:
    snaps = sorted(list_snapshots(owner, portfolio_id), key=lambda s: (s["as_of"], s["created_at"]))
    if len(snaps) < 2:
        return None
    return compare(snaps[-2], snaps[-1])
