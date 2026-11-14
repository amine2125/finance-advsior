"""Lens 2 primitives: DCF and reverse DCF (section 8A.3). Shows what a price implies; never a fair-value verdict.

Convention: FCF_1 = FCF_0 × (1 + growth); terminal value on FCF_n × (1 + g).
"""
from __future__ import annotations


def dcf_value(fcf0: float, growth: float, years: int, r: float, g: float, net_debt: float, shares: float) -> dict:
    if r <= g:
        raise ValueError("discount rate must exceed terminal growth")
    pv_fcf, fcf = 0.0, fcf0
    flows = []
    for t in range(1, years + 1):
        fcf = fcf * (1 + growth)
        pv = fcf / (1 + r) ** t
        flows.append({"year": t, "fcf": fcf, "pv": pv})
        pv_fcf += pv
    tv = fcf * (1 + g) / (r - g)
    pv_tv = tv / (1 + r) ** years
    ev = pv_fcf + pv_tv
    equity = ev - net_debt
    return {"pv_explicit": pv_fcf, "terminal_value": tv, "pv_terminal": pv_tv, "enterprise_value": ev,
            "terminal_share": pv_tv / ev if ev else None, "equity_value": equity,
            "value_per_share": equity / shares, "flows": flows}


def sensitivity_grid(fcf0: float, growth: float, years: int, rs: list[float], gs: list[float], net_debt: float,
                     shares: float) -> list[dict]:
    rows = []
    for r in rs:
        row = {"r": r}
        for g in gs:
            row[f"g={g}"] = dcf_value(fcf0, growth, years, r, g, net_debt, shares)["value_per_share"]
        rows.append(row)
    return rows


def implied_growth(price: float, fcf0: float, years: int, r: float, g: float, net_debt: float, shares: float,
                   lo: float = -0.5, hi: float = 1.5, tol: float = 1e-7) -> float | None:
    """Reverse DCF: growth over `years` that equates value per share with `price` (bisection)."""
    if fcf0 <= 0 or shares <= 0:
        return None
    f = lambda x: dcf_value(fcf0, x, years, r, g, net_debt, shares)["value_per_share"] - price  # noqa: E731
    flo, fhi = f(lo), f(hi)
    if flo * fhi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        fm = f(mid)
        if abs(fm) < tol:
            return mid
        if flo * fm < 0:
            hi, fhi = mid, fm
        else:
            lo, flo = mid, fm
    return (lo + hi) / 2
