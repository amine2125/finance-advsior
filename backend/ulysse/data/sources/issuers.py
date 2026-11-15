"""ETF compositions from the issuers' public 'download holdings' links (honest user agent, cached,
max 1 request/s). Every snapshot keeps its 'as of' date; a simulation dated t may only use a
snapshot dated <= t - 1 business day (published the next business day).

- SSGA: SPY daily holdings (current only) and the 11 Select Sector SPDR funds, whose membership
  gives the GICS sector of each S&P 500 constituent (same issuer, same date).
- iShares Canada: XIU (current + month-end history via the product page's 'as of' selector) and XBB.
QQQ and ESGV: the issuers do not offer an automatable public download; see docs/donnees.md."""
from __future__ import annotations

import io
from datetime import date, datetime

import pandas as pd

from ulysse.config import CACHE_DIR
from ulysse.data.sources.http import NotFound, fetch, MIN_INTERVAL_S

OUT = CACHE_DIR / "etf"
MIN_INTERVAL_S.update({"ssga.com": 1.0, "blackrock.com": 1.0})

SSGA_URL = "https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-{t}.xlsx"
SELECT_SECTORS = {  # Select Sector SPDR fund -> GICS sector (fund names and index methodology: SSGA)
    "XLK": "Information Technology", "XLC": "Communication Services", "XLY": "Consumer Discretionary",
    "XLP": "Consumer Staples", "XLE": "Energy", "XLF": "Financials", "XLV": "Health Care",
    "XLI": "Industrials", "XLB": "Materials", "XLRE": "Real Estate", "XLU": "Utilities",
}
ISHARES_CA = {  # ticker -> (product id, slug) on blackrock.com/ca
    "XIU.TO": ("239832", "ishares-sptsx-60-index-etf"),
    "XBB.TO": ("239493", "ishares-canadian-universe-bond-index-etf"),
}
ISHARES_CA_URL = ("https://www.blackrock.com/ca/investors/en/products/{pid}/{slug}/1464253357814.ajax"
                  "?fileType=csv&fileName={name}_holdings&dataType=fund{asof}")


def ssga_holdings(fund: str, refresh: bool = False) -> pd.DataFrame:
    path = fetch(SSGA_URL.format(t=fund.lower()), OUT / "ssga" / f"{fund.lower()}.xlsx", refresh=refresh)
    raw = pd.read_excel(path, header=None)
    as_of = None
    for _, row in raw.head(5).iterrows():
        if str(row[0]).startswith("Holdings"):
            as_of = datetime.strptime(str(row[1]).replace("As of", "").strip(), "%d-%b-%Y").date()
    hdr = raw.index[raw[0].astype(str).eq("Name")][0]
    df = raw.iloc[hdr + 1:, :].copy()
    df.columns = [str(c) for c in raw.iloc[hdr]]
    df = df[df["Ticker"].notna() & pd.to_numeric(df["Weight"], errors="coerce").notna()]
    out = pd.DataFrame({
        "fund": fund, "as_of": as_of, "holding_ticker": df["Ticker"].astype(str).str.strip(),
        "name": df["Name"].astype(str).str.strip(), "cusip": df["Identifier"].astype(str).str.strip(),
        "weight": pd.to_numeric(df["Weight"]) / 100.0,
    })
    return out.reset_index(drop=True)


def ssga_sector_map(refresh: bool = False) -> pd.DataFrame:
    frames = []
    for fund, sector in SELECT_SECTORS.items():
        h = ssga_holdings(fund, refresh)
        h = h[~h.holding_ticker.str.contains("CASH|USD|-", regex=True)]
        frames.append(h.assign(sector=sector)[["holding_ticker", "cusip", "name", "sector", "as_of"]])
    m = pd.concat(frames, ignore_index=True).drop_duplicates("holding_ticker")
    return m


def ishares_ca_holdings(ticker: str, as_of: date | None = None, refresh: bool = False) -> pd.DataFrame:
    pid, slug = ISHARES_CA[ticker]
    name = ticker.split(".")[0]
    asof = f"&asOfDate={as_of:%Y%m%d}" if as_of else ""
    tag = as_of.isoformat() if as_of else "latest"
    url = ISHARES_CA_URL.format(pid=pid, slug=slug, name=name, asof=asof)
    path = fetch(url, OUT / "ishares_ca" / f"{name}_{tag}.csv", refresh=refresh)
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    if not lines or not lines[0].startswith("Fund Holdings as of"):
        raise NotFound(f"no holdings table for {ticker} as of {tag}")
    stamp = lines[0].split(",", 1)[1].strip().strip('"')
    if stamp in ("-", ""):
        path.unlink(missing_ok=True)  # empty answer (non-business day): do not cache it
        raise NotFound(f"no holdings published for {ticker} as of {tag}")
    snap = datetime.strptime(stamp, "%b %d, %Y").date()
    start = next(i for i, l in enumerate(lines) if l.startswith("Ticker,"))
    body = []
    for l in lines[start:]:
        if not l.strip() or l.startswith("\xa0") or l.startswith('"The content'):
            break
        body.append(l)
    df = pd.read_csv(io.StringIO("\n".join(body)), thousands=",")
    df = df[pd.to_numeric(df["Weight (%)"], errors="coerce").notna()]
    return pd.DataFrame({
        "fund": ticker, "as_of": snap, "holding_ticker": df["Ticker"].astype(str).str.strip(),
        "name": df["Name"].astype(str).str.strip(), "sector": df["Sector"].astype(str).str.strip(),
        "asset_class": df["Asset Class"].astype(str).str.strip(),
        "location": df.get("Location", pd.Series([""] * len(df))).astype(str).str.strip(),
        "currency": df.get("Currency", pd.Series([""] * len(df))).astype(str).str.strip(),
        "weight": pd.to_numeric(df["Weight (%)"]) / 100.0,
    }).reset_index(drop=True)


def month_ends(start: str, end: str) -> list[date]:
    """Last weekday of each month (holiday handled by stepping back in ishares_ca_history)."""
    out = []
    for p in pd.period_range(start, end, freq="M"):
        d = p.end_time.normalize()
        while d.weekday() >= 5:
            d -= pd.Timedelta(days=1)
        out.append(d.date())
    return out


def ishares_ca_history(ticker: str, start: str, end: str, refresh: bool = False) -> pd.DataFrame:
    frames = []
    for d in month_ends(start, end):
        got = None
        for back in range(0, 5):  # step back over holidays
            try:
                got = ishares_ca_holdings(ticker, (pd.Timestamp(d) - pd.tseries.offsets.BDay(back)).date(), refresh)
                break
            except NotFound:
                continue
        if got is not None and len(got):
            frames.append(got)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
