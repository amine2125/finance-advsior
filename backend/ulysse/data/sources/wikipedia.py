"""Daily Wikipedia page views (Wikimedia REST API, agent=user) used as a public attention proxy
for the hype detector. Data for day D is published after D ends: a simulation dated D may only
use views up to D-1 (enforced in the datapack 'available_from' column)."""
from __future__ import annotations

import json
import urllib.parse

import pandas as pd

from ulysse.config import CACHE_DIR, KIT_END, MANUAL_DIR, kit_end
from ulysse.data.sources.http import NotFound, fetch

OUT = CACHE_DIR / "wikipedia"
API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{project}/all-access/user/{article}/daily/{start}/{end}"
START = "20160101"


def mapping() -> pd.DataFrame:
    return pd.read_csv(MANUAL_DIR / "wikipedia_articles.csv", dtype=str).fillna("")


def article_views(project: str, article: str, refresh: bool = False) -> pd.Series:
    end = kit_end().replace("-", "")
    url = API.format(project=project, article=urllib.parse.quote(article, safe=""), start=START, end=end)
    safe = article.replace("/", "_").replace(",", "").replace("&", "and")
    tag = "" if end == KIT_END.replace("-", "") else f"__{end}"  # an extended kit needs views up to its own last day
    path = fetch(url, OUT / f"{project}__{safe}{tag}.json", refresh=refresh)
    items = json.loads(path.read_text()).get("items", [])
    s = pd.Series({pd.Timestamp(i["timestamp"][:8]): i["views"] for i in items}, dtype="float64")
    return s.sort_index()


def download_all(refresh: bool = False) -> pd.DataFrame:
    """Long frame: date, ticker, views (current title + former titles summed)."""
    rows = []
    for _, m in mapping().iterrows():
        titles = [m.article] + [t for t in m.former_titles.split("|") if t]
        total = None
        for t in titles:
            try:
                s = article_views(m.project, t, refresh)
            except NotFound:
                s = pd.Series(dtype="float64")  # title did not exist over the window: no views
            total = s if total is None else total.add(s, fill_value=0)
        rows.append(pd.DataFrame({"date": total.index, "ticker": m.ticker, "views": total.values}))
    return pd.concat(rows, ignore_index=True)
