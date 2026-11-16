"""Research tools: nothing published after the simulated date, near-duplicates grouped, honest when unavailable."""
from datetime import date, timedelta

import pytest

from ulysse import nouvelles

pytestmark = pytest.mark.datapack


def _fake(monkeypatch, gdelt_articles):
    jour = lambda d: d.strftime("%Y%m%dT120000Z")  # noqa: E731
    def fake_json(url, nom, headers=None):
        if "company_tickers" in url:
            return {"0": {"ticker": "NVDA", "cik_str": 1045810}}
        if "submissions" in url:
            return {"filings": {"recent": {"form": ["8-K", "10-Q", "8-K", "4"], "filingDate": ["2026-11-20", "2026-10-01", "2026-06-01", "2026-11-01"],
                                           "items": ["2.02", "", "5.02", ""], "accessionNumber": ["a-1", "a-2", "a-3", "a-4"],
                                           "primaryDocument": ["x.htm", "y.htm", "z.htm", "w.htm"]}}}
        return {"articles": [{"title": t, "domain": dom, "seendate": jour(d), "url": f"https://{dom}/{i}"} for i, (t, dom, d) in enumerate(gdelt_articles)]}
    monkeypatch.setattr(nouvelles, "_json", fake_json)
    monkeypatch.setattr(nouvelles, "actif", lambda: True)


def test_filings_stop_at_the_simulated_date(monkeypatch, dp):
    _fake(monkeypatch, [])
    e = nouvelles.ev_depots(dp.asof("2026-11-14"), "NVDA")
    assert e.statut == "ok" and [x["forme"] for x in e.valeur["depots"]] == ["10-Q"]      # the 8-K of 2026-11-20 is in the future, 2026-06 too old
    assert e.valeur["depots"][0]["url"].startswith("https://www.sec.gov/Archives/edgar/data/1045810/")


def test_no_filings_for_a_canadian_fund(dp):
    assert nouvelles.ev_depots(dp.asof("2026-11-14"), "XIU.TO").statut == "donnees_insuffisantes"


def test_articles_are_grouped_and_never_after_the_date(monkeypatch, dp):
    day = date.today() - timedelta(days=2)
    v = dp.asof(day.isoformat())
    fin = date.fromisoformat(str(v.day))
    _fake(monkeypatch, [("Nvidia reports record revenue", "a.com", fin), ("NVIDIA reports record revenue!", "b.com", fin),
                        ("Nvidia unveils new chip", "c.com", fin - timedelta(days=3)), ("Future story", "d.com", fin + timedelta(days=1))])
    e = nouvelles.ev_articles(v, "NVDA")
    assert e.statut == "ok" and e.valeur["n_articles"] == 3 and e.valeur["n_independants"] == 2


def test_old_dates_say_gdelt_does_not_cover_them(monkeypatch, dp):
    monkeypatch.setattr(nouvelles, "actif", lambda: True)
    e = nouvelles.ev_articles(dp.asof("2023-03-01"), "NVDA")
    assert e.statut == "donnees_insuffisantes" and "ne couvre" in e.note


def test_switched_off_by_default_in_tests(dp):
    assert nouvelles.ev_depots(dp.asof("2026-11-14"), "NVDA").statut == "donnees_insuffisantes"
