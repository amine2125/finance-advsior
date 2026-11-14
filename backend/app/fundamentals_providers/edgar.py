"""SEC EDGAR XBRL (companyfacts + submissions) provider for lens 1 and lens 2.

Endpoints (verified 2026-11-14): https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json and
https://data.sec.gov/submissions/CIK##########.json. SEC fair-access policy: declare a User-Agent with contact,
stay under 10 requests/second. Point in time: a fact is visible only from its `filed` date.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import threading
import time
from pathlib import Path

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)
_lock = threading.Lock()
_last_call = [0.0]
_mem: dict[str, tuple[float, dict]] = {}
TTL_S = 24 * 3600


class ProviderError(RuntimeError):
    pass


def _cache_dir() -> Path:
    s = get_settings()
    base = Path("/tmp/aegis-cache") if s.data_s3_bucket else s.local_store_dir / "cache"
    base.mkdir(parents=True, exist_ok=True)
    return base


def sec_get_json(url: str, cache_key: str) -> dict:
    now = time.time()
    if cache_key in _mem and now - _mem[cache_key][0] < TTL_S:
        return _mem[cache_key][1]
    path = _cache_dir() / f"{cache_key}.json"
    if path.exists() and now - path.stat().st_mtime < TTL_S:
        data = json.loads(path.read_text())
        _mem[cache_key] = (now, data)
        return data
    with _lock:
        wait = 0.15 - (time.time() - _last_call[0])
        if wait > 0:
            time.sleep(wait)
        _last_call[0] = time.time()
    try:
        r = httpx.get(url, headers={"User-Agent": get_settings().sec_user_agent, "Accept-Encoding": "gzip"}, timeout=25)
    except httpx.HTTPError as exc:
        raise ProviderError(f"SEC EDGAR unreachable: {exc.__class__.__name__}") from exc
    if r.status_code != 200:
        raise ProviderError(f"SEC EDGAR HTTP {r.status_code} for {url}")
    data = r.json()
    path.write_text(json.dumps(data))
    _mem[cache_key] = (now, data)
    return data


def company_facts(cik: str) -> dict:
    return sec_get_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json", f"companyfacts_{cik}")


def submissions(cik: str) -> dict:
    return sec_get_json(f"https://data.sec.gov/submissions/CIK{cik}.json", f"submissions_{cik}")


TAGS = {
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet",
                "RevenueFromContractWithCustomerIncludingAssessedTax"],
    "cost_of_revenue": ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["OperatingIncomeLoss"],
    "net_income": ["NetIncomeLoss", "ProfitLoss"],
    "pretax_income": ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
                      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"],
    "income_tax": ["IncomeTaxExpenseBenefit"],
    "ocf": ["NetCashProvidedByUsedInOperatingActivities"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    "dep_amort": ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet",
                  "Depreciation"],
    "interest_expense": ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"],
    "sga": ["SellingGeneralAndAdministrativeExpense"],
    "total_assets": ["Assets"],
    "current_assets": ["AssetsCurrent"],
    "current_liabilities": ["LiabilitiesCurrent"],
    "total_liabilities": ["Liabilities"],
    "equity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "retained_earnings": ["RetainedEarningsAccumulatedDeficit"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    "lt_debt": ["LongTermDebtNoncurrent", "LongTermDebt"],
    "st_debt": ["LongTermDebtCurrent", "DebtCurrent", "CommercialPaper"],
    "receivables": ["AccountsReceivableNetCurrent"],
    "ppe_net": ["PropertyPlantAndEquipmentNet"],
    "shares_diluted": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
}
FLOW = {"revenue", "cost_of_revenue", "gross_profit", "operating_income", "net_income", "pretax_income", "income_tax",
        "ocf", "capex", "dep_amort", "interest_expense", "sga", "shares_diluted"}


def _annual_values(facts: dict, item: str, as_of: dt.date) -> dict[str, dict]:
    """fiscal-year-end -> fact, using the latest value filed on or before as_of (point in time)."""
    gaap = facts.get("facts", {}).get("us-gaap", {})
    merged: dict[str, dict] = {}
    for tag in TAGS[item]:  # priority order; per period the first tag that reports it wins
        node = gaap.get(tag)
        if not node:
            continue
        unit = "shares" if item == "shares_diluted" else "USD"
        entries = node.get("units", {}).get(unit, [])
        out: dict[str, dict] = {}
        for e in entries:
            if e.get("form") not in ("10-K", "10-K/A") or e.get("fp") != "FY":
                continue
            filed = dt.date.fromisoformat(e["filed"])
            if filed > as_of:
                continue
            if item in FLOW:
                if not e.get("start"):
                    continue
                days = (dt.date.fromisoformat(e["end"]) - dt.date.fromisoformat(e["start"])).days
                if not 350 <= days <= 380:
                    continue
            key = e["end"]
            prev = out.get(key)
            if prev is None or e["filed"] >= prev["filed"]:
                out[key] = {"value": float(e["val"]), "end": e["end"], "filed": e["filed"], "accn": e.get("accn"), "tag": tag}
        for key, val in out.items():
            merged.setdefault(key, val)
    return merged


def annual_statements(cik: str, as_of: dt.date, years: int = 4) -> dict:
    facts = company_facts(cik)
    series = {item: _annual_values(facts, item, as_of) for item in TAGS}
    ends = sorted({e for item in ("revenue", "total_assets", "net_income") for e in series[item]}, reverse=True)
    ends = [e for e in ends if series["total_assets"].get(e) and (series["revenue"].get(e) or series["net_income"].get(e))][:years]
    periods = []
    for e in ends:
        row = {"period_end": e}
        filed, accns = [], set()
        for item in TAGS:
            f = series[item].get(e)
            row[item] = f["value"] if f else None
            if f:
                filed.append(f["filed"])
                accns.add(f["accn"])
        row["filed"] = max(filed) if filed else None
        row["accession_numbers"] = sorted(a for a in accns if a)
        if row["gross_profit"] is None and row["revenue"] is not None and row["cost_of_revenue"] is not None:
            row["gross_profit"] = row["revenue"] - row["cost_of_revenue"]
        if row["total_liabilities"] is None and row["total_assets"] is not None and row["equity"] is not None:
            row["total_liabilities"] = row["total_assets"] - row["equity"]
        periods.append(row)
    dei = facts.get("facts", {}).get("dei", {}).get("EntityCommonStockSharesOutstanding", {}).get("units", {}).get("shares", [])
    shares = [e for e in dei if dt.date.fromisoformat(e["filed"]) <= as_of]
    shares_out = max(shares, key=lambda e: (e["filed"], e["end"])) if shares else None
    return {"entity": facts.get("entityName"), "cik": cik, "periods": periods,
            "shares_outstanding": {"value": float(shares_out["val"]), "as_of": shares_out["end"], "filed": shares_out["filed"],
                                   "accn": shares_out.get("accn")} if shares_out else None,
            "source_url": f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json",
            "retrieved_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()}


def sic_code(cik: str) -> str | None:
    try:
        return str(submissions(cik).get("sic") or "") or None
    except ProviderError:
        return None


def recent_filings(cik: str, since: dt.date, until: dt.date, limit: int = 25) -> list[dict]:
    sub = submissions(cik)
    rec = sub.get("filings", {}).get("recent", {})
    out = []
    for i, form in enumerate(rec.get("form", [])):
        fdate = dt.date.fromisoformat(rec["filingDate"][i])
        if not since <= fdate <= until:
            continue
        if form not in ("8-K", "10-Q", "10-K", "6-K", "8-K/A", "10-K/A", "SC 13D", "SC 13G", "DEF 14A", "S-1", "S-3"):
            continue
        accn = rec["accessionNumber"][i]
        doc = rec.get("primaryDocument", [""] * (i + 1))[i]
        cik_int = str(int(cik))
        url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accn.replace('-', '')}/{doc}" if doc else \
            f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accn.replace('-', '')}/"
        out.append({"form": form, "filing_date": rec["filingDate"][i], "report_date": rec.get("reportDate", [None] * (i + 1))[i],
                    "accession_number": accn, "items": rec.get("items", [""] * (i + 1))[i],
                    "description": rec.get("primaryDocDescription", [""] * (i + 1))[i], "url": url,
                    "acceptance": rec.get("acceptanceDateTime", [None] * (i + 1))[i]})
        if len(out) >= limit:
            break
    return out
