"""Backward extension of FX and macro series from the same official sources as the kit:
Bank of Canada Valet API and FRED (Federal Reserve Bank of St. Louis)."""
from __future__ import annotations

import io
import json

import pandas as pd

from ulysse.config import CACHE_DIR, EXT_OVERLAP_END, EXT_START
from ulysse.data.sources.http import fetch

OUT = CACHE_DIR / "macro"
BOC = ["FXUSDCAD", "V39079", "BD.CDN.2YR.DQ.YLD", "BD.CDN.10YR.DQ.YLD", "STATIC_TOTALCPICHANGE"]
FRED = ["DFF", "DGS2", "DGS10", "CPIAUCSL", "UNRATE"]


def boc(series_id: str, refresh: bool = False) -> pd.DataFrame:
    url = f"https://www.bankofcanada.ca/valet/observations/{series_id}/json?start_date={EXT_START}&end_date={EXT_OVERLAP_END}"
    path = fetch(url, OUT / f"boc_{series_id}.json", refresh=refresh)
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = [(o["d"], o[series_id]["v"]) for o in data["observations"]
            if series_id in o and o[series_id].get("v") not in (None, "")]
    df = pd.DataFrame(rows, columns=["date", "value"])
    df["date"] = pd.to_datetime(df["date"])
    df["value"] = df["value"].astype(float)
    return df


def fred(series_id: str, refresh: bool = False) -> pd.DataFrame:
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd={EXT_START}&coed={EXT_OVERLAP_END}"
    path = fetch(url, OUT / f"fred_{series_id}.csv", refresh=refresh)
    df = pd.read_csv(io.BytesIO(path.read_bytes()))
    df.columns = ["date", "value"]
    df["date"] = pd.to_datetime(df["date"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    return df.dropna()


def download_all(refresh: bool = False) -> dict[str, pd.DataFrame]:
    out = {s: boc(s, refresh) for s in BOC}
    out.update({s: fred(s, refresh) for s in FRED})
    return out
