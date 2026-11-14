"""Lens 1: fundamental quality, solvency and earnings-quality screens (section 8A.2).

Pure functions over annual statement dicts (most recent first). Scores are screening flags:
wording is always "flagged for review", never "fraud" or "will go bankrupt".
"""
from __future__ import annotations

from ..methodology import METHODOLOGY

FIN_SIC_PREFIXES = ("60", "61", "62", "63", "64", "67")


def _div(a, b):
    if a is None or b in (None, 0):
        return None
    return a / b


def is_financial(sic: str | None) -> bool:
    return bool(sic) and sic[:2] in FIN_SIC_PREFIXES


def is_manufacturer(sic: str | None) -> bool:
    return bool(sic) and sic.isdigit() and 2000 <= int(sic) <= 3999


def debt(p: dict) -> float | None:
    if p.get("lt_debt") is None and p.get("st_debt") is None:
        return None
    return (p.get("lt_debt") or 0.0) + (p.get("st_debt") or 0.0)


def ebitda(p: dict) -> float | None:
    if p.get("operating_income") is None or p.get("dep_amort") is None:
        return None
    return p["operating_income"] + p["dep_amort"]


def altman_z(p: dict, market_cap: float | None, manufacturer: bool) -> dict:
    ta, tl = p.get("total_assets"), p.get("total_liabilities")
    wc = None if p.get("current_assets") is None or p.get("current_liabilities") is None else p["current_assets"] - p["current_liabilities"]
    x1, x2, x3 = _div(wc, ta), _div(p.get("retained_earnings"), ta), _div(p.get("operating_income"), ta)
    cfg = METHODOLOGY["fundamentals"]
    if manufacturer:
        x4, x5 = _div(market_cap, tl), _div(p.get("revenue"), ta)
        parts = {"X1": x1, "X2": x2, "X3": x3, "X4": x4, "X5": x5}
        if any(v is None for v in parts.values()):
            return {"status": "PARTIAL", "variant": "Z", "inputs": parts, "missing": [k for k, v in parts.items() if v is None]}
        z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5
        zone = "safe" if z > cfg["altman_safe"] else ("grey" if z >= cfg["altman_distress"] else "distress")
        return {"status": "COMPUTED", "variant": "Z (manufacturier, 1968)", "value": z, "zone": zone, "inputs": parts}
    x4 = _div(p.get("equity"), tl)
    parts = {"X1": x1, "X2": x2, "X3": x3, "X4": x4}
    if any(v is None for v in parts.values()):
        return {"status": "PARTIAL", "variant": "Z''", "inputs": parts, "missing": [k for k, v in parts.items() if v is None]}
    z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4
    zone = "safe" if z > cfg["altman_zpp_safe"] else ("grey" if z >= cfg["altman_zpp_distress"] else "distress")
    return {"status": "COMPUTED", "variant": "Z'' (non manufacturier)", "value": z, "zone": zone, "inputs": parts}


def beneish_m(t: dict, t1: dict) -> dict:
    def gm(p):
        return _div(p.get("gross_profit"), p.get("revenue"))

    def aq(p):
        if None in (p.get("current_assets"), p.get("ppe_net"), p.get("total_assets")):
            return None
        return 1 - (p["current_assets"] + p["ppe_net"]) / p["total_assets"]

    def dep_rate(p):
        if None in (p.get("dep_amort"), p.get("ppe_net")):
            return None
        return p["dep_amort"] / (p["dep_amort"] + p["ppe_net"])

    def lev(p):
        if None in (p.get("current_liabilities"), p.get("total_assets")):
            return None
        return (p["current_liabilities"] + (p.get("lt_debt") or 0.0)) / p["total_assets"]

    ratios = {
        "DSRI": _div(_div(t.get("receivables"), t.get("revenue")), _div(t1.get("receivables"), t1.get("revenue"))),
        "GMI": _div(gm(t1), gm(t)),
        "AQI": _div(aq(t), aq(t1)),
        "SGI": _div(t.get("revenue"), t1.get("revenue")),
        "DEPI": _div(dep_rate(t1), dep_rate(t)),
        "SGAI": _div(_div(t.get("sga"), t.get("revenue")), _div(t1.get("sga"), t1.get("revenue"))),
        "TATA": _div(None if t.get("net_income") is None or t.get("ocf") is None else t["net_income"] - t["ocf"], t.get("total_assets")),
        "LVGI": _div(lev(t), lev(t1)),
    }
    missing = [k for k, v in ratios.items() if v is None]
    if missing:
        return {"status": "PARTIAL", "ratios": ratios, "missing": missing}
    m = (-4.84 + 0.920 * ratios["DSRI"] + 0.528 * ratios["GMI"] + 0.404 * ratios["AQI"] + 0.892 * ratios["SGI"]
         + 0.115 * ratios["DEPI"] - 0.172 * ratios["SGAI"] + 4.679 * ratios["TATA"] - 0.327 * ratios["LVGI"])
    flag = m > METHODOLOGY["fundamentals"]["beneish_flag"]
    return {"status": "COMPUTED", "value": m, "flagged_for_review": flag, "ratios": ratios,
            "wording": "signalé pour revue" if flag else "sous le seuil de signalement"}


def piotroski_f(t: dict, t1: dict, t2: dict | None) -> dict:
    tests: dict[str, bool | None] = {}
    avg_ta_t = t1.get("total_assets")
    roa_t = _div(t.get("net_income"), avg_ta_t)
    roa_t1 = _div(t1.get("net_income"), (t2 or {}).get("total_assets")) if t2 else None
    tests["roa_positive"] = None if roa_t is None else roa_t > 0
    tests["cfo_positive"] = None if t.get("ocf") is None else t["ocf"] > 0
    tests["roa_rising"] = None if roa_t is None or roa_t1 is None else roa_t > roa_t1
    tests["cfo_above_net_income"] = None if t.get("ocf") is None or t.get("net_income") is None else t["ocf"] > t["net_income"]
    lev_t, lev_t1 = _div(t.get("lt_debt") or 0.0, t.get("total_assets")), _div(t1.get("lt_debt") or 0.0, t1.get("total_assets"))
    tests["leverage_lower"] = None if lev_t is None or lev_t1 is None else lev_t <= lev_t1
    cr_t, cr_t1 = _div(t.get("current_assets"), t.get("current_liabilities")), _div(t1.get("current_assets"), t1.get("current_liabilities"))
    tests["current_ratio_higher"] = None if cr_t is None or cr_t1 is None else cr_t > cr_t1
    sh_t, sh_t1 = t.get("shares_diluted"), t1.get("shares_diluted")
    tests["no_new_shares"] = None if sh_t is None or sh_t1 is None else sh_t <= sh_t1 * 1.001
    gm_t, gm_t1 = _div(t.get("gross_profit"), t.get("revenue")), _div(t1.get("gross_profit"), t1.get("revenue"))
    tests["gross_margin_higher"] = None if gm_t is None or gm_t1 is None else gm_t > gm_t1
    at_t, at_t1 = _div(t.get("revenue"), t1.get("total_assets")), _div(t1.get("revenue"), (t2 or {}).get("total_assets")) if t2 else None
    tests["asset_turnover_higher"] = None if at_t is None or at_t1 is None else at_t > at_t1
    ran = {k: v for k, v in tests.items() if v is not None}
    score = sum(1 for v in ran.values() if v)
    return {"status": "COMPUTED" if len(ran) == 9 else "PARTIAL", "value": score if len(ran) == 9 else None,
            "partial_score": f"{score}/{len(ran)}", "tests": tests}


def quality_metrics(periods: list[dict], cost_of_capital: float | None) -> dict:
    t = periods[0]
    out: dict = {}
    revs = [p.get("revenue") for p in periods if p.get("revenue")]
    if len(revs) >= 2:
        n = len(revs) - 1
        out["revenue_cagr"] = (revs[0] / revs[-1]) ** (1 / n) - 1 if revs[-1] > 0 else None
        out["revenue_cagr_years"] = n
    margins = [_div(p.get("operating_income"), p.get("revenue")) for p in periods]
    out["operating_margin"] = margins[0]
    out["operating_margin_trend"] = [m for m in margins if m is not None]
    gms = [_div(p.get("gross_profit"), p.get("revenue")) for p in periods]
    out["gross_margin_series"] = [g for g in gms if g is not None]
    gm_valid = [g for g in gms if g is not None]
    out["gross_margin_down_3y"] = len(gm_valid) >= 3 and gm_valid[0] < gm_valid[1] < gm_valid[2]
    tax_rate = _div(t.get("income_tax"), t.get("pretax_income"))
    tax_flag = None
    if tax_rate is None or not 0 <= tax_rate <= 0.35:
        tax_rate, tax_flag = 0.21, "taux d'imposition effectif hors bornes ou absent: 21 % (taux fédéral US) supposé"
    nopat = None if t.get("operating_income") is None else t["operating_income"] * (1 - tax_rate)
    d = debt(t)
    invested = None if t.get("equity") is None else t["equity"] + (d or 0.0) - (t.get("cash") or 0.0)
    out["roic"] = _div(nopat, invested) if invested and invested > 0 else None
    out["roic_tax_note"] = tax_flag
    out["cost_of_capital_assumption"] = cost_of_capital
    out["roic_above_cost_of_capital"] = None if out["roic"] is None or cost_of_capital is None else out["roic"] > cost_of_capital
    fcf = None if t.get("ocf") is None or t.get("capex") is None else t["ocf"] - t["capex"]
    out["free_cash_flow"] = fcf
    out["cash_conversion"] = _div(fcf, t.get("net_income")) if (t.get("net_income") or 0) > 0 else None
    e = ebitda(t)
    out["ebitda"] = e
    out["net_debt"] = None if d is None else d - (t.get("cash") or 0.0)
    out["net_debt_to_ebitda"] = _div(out["net_debt"], e) if e and e > 0 else None
    out["interest_coverage"] = _div(t.get("operating_income"), t.get("interest_expense")) if t.get("interest_expense") else None
    out["accrual_ratio"] = _div(None if t.get("net_income") is None or t.get("ocf") is None else t["net_income"] - t["ocf"],
                                t.get("total_assets"))
    shares = [p.get("shares_diluted") for p in periods if p.get("shares_diluted")]
    out["share_count_change"] = (shares[0] / shares[-1] - 1) if len(shares) >= 2 else None
    return out
