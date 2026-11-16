"""Shared news cache: a fresh copy is reused (and logged as such with its real date); stale parts are re-read; a failed
live read falls back to a dated copy; claims are re-extracted only when the articles change."""
from __future__ import annotations

import time

from app.analytics.ledger import MetricLedger
from app.hype_research import news_cache


class FakeTool:
    """Stands in for WebResearchTool: counts live reads, can be told to fail."""

    def __init__(self, articles=None, fail=False):
        self.enabled = True
        self.calls: list[dict] = []
        self.live = 0
        self.fail = fail
        self.articles = articles if articles is not None else [{"title": "Synthetic Tech Corp beats", "evidence_id": "a1"}]

    def _hit(self, name, value):
        self.live += 1
        self.calls.append({"tool": name, "status": "error" if self.fail else "ok"})
        return None if self.fail else value

    def news(self, query, days=14):
        return self._hit("news_search", self.articles)

    def news_timeline(self, query, days=90):
        return self._hit("news_attention_timeline", [{"date": "2026-11-01", "count": 3}])

    def filings(self, *a, **k):
        return self._hit("sec_filings", [])

    def crypto_snapshot(self, *a):
        return self._hit("crypto_snapshot", {"price_usd": 1})

    def crypto_trending(self):
        return self._hit("crypto_trending", {"coins": []})

    def cached(self, name, provider, fetched_at, n, stale=False):
        self.calls.append({"tool": name, "status": "cache_stale" if stale else "cache", "fetched_at": fetched_at})


def test_fresh_copy_is_reused_and_dated(md, fresh_store):
    t1 = FakeTool()
    a = news_cache.gather(md, "AAA", t1)
    assert t1.live == 2 and a["articles"] and a["read_at"]  # articles + timeline read live, then stored
    t2 = FakeTool()
    b = news_cache.gather(md, "AAA", t2)
    assert t2.live == 0 and b["articles"] == a["articles"] and b["read_at"] == a["read_at"]
    assert {c["status"] for c in t2.calls} == {"cache"} and all(c["fetched_at"] for c in t2.calls)


def test_stale_part_is_reread_and_failure_falls_back_to_dated_copy(md, fresh_store):
    news_cache.gather(md, "AAA", FakeTool())
    rec = news_cache.load("AAA")
    rec["parts"]["articles"]["at"] -= news_cache.MAX_AGE_S["articles"] + 5  # articles now too old for an analysis
    fresh_store.put(news_cache.OWNER, news_cache.KIND, "AAA", rec)
    t = FakeTool(articles=[{"title": "Synthetic Tech Corp new", "evidence_id": "a2"}])
    out = news_cache.gather(md, "AAA", t)
    assert t.live == 1 and out["articles"][0]["evidence_id"] == "a2"  # only the stale part was read live
    rec = news_cache.load("AAA")
    rec["parts"]["articles"]["at"] -= news_cache.MAX_AGE_S["articles"] + 5
    fresh_store.put(news_cache.OWNER, news_cache.KIND, "AAA", rec)
    down = FakeTool(fail=True)
    out = news_cache.gather(md, "AAA", down)
    assert out["articles"][0]["evidence_id"] == "a2" and any(c["status"] == "cache_stale" for c in down.calls)
    assert out["read_at"] < news_cache._iso(time.time() - news_cache.MAX_AGE_S["articles"])  # the old date is reported, not today


def test_disabled_research_never_serves_the_cache(md, fresh_store):
    news_cache.gather(md, "AAA", FakeTool())
    off = FakeTool(fail=True)
    off.enabled = False
    out = news_cache.gather(md, "AAA", off)
    assert out["articles"] is None and out["read_at"] is None


def test_claims_are_reused_only_for_the_same_articles(md, fresh_store):
    c1 = [{"cluster_id": "clu.1", "title": "x", "first_seen": "2026-11-01"}]
    k1 = news_cache.claims_key("AAA", c1)
    news_cache.store_claims("AAA", k1, [{"claim_id": "claim.1"}], {"method": "llm", "usage": {"input_tokens": 3}})
    raw, ext = news_cache.cached_claims("AAA", k1)
    assert raw == [{"claim_id": "claim.1"}] and ext["method"] == "llm" and ext["cached_at"] and "usage" not in ext
    assert news_cache.cached_claims("AAA", news_cache.claims_key("AAA", c1 + [{"cluster_id": "clu.2", "title": "y"}])) is None
    news_cache.store_claims("AAA", "other", [], {"method": "deterministic_fallback"})  # a model failure is never cached
    assert news_cache.cached_claims("AAA", k1) is not None


def test_late_research_merge_gives_the_same_ledger():
    research, own = MetricLedger(), MetricLedger()
    research.add("asset.vol", "v", 0.3, "pct", "m")
    research.add("pf.vol", "v", 0.9, "pct", "m")
    own.add("pf.vol", "v", 0.1, "pct", "m")
    own.add("mnd.amount", "a", 100, "cad", "m")
    before = MetricLedger()
    before.merge(research)
    before.merge(own)
    own.merge_first(research)
    assert [(r.metric_id, r.value) for r in own.records()] == [(r.metric_id, r.value) for r in before.records()]


def test_analysis_never_waits_for_the_live_timeline(md, fresh_store):
    t = FakeTool()
    a = news_cache.gather(md, "AAA", t, live_timeline=False)
    assert t.live == 1 and a["articles"] and a["timeline"] is None  # no copy yet: skipped, not read live
    news_cache.gather(md, "AAA", FakeTool())  # refresh / security page reads it
    rec = news_cache.load("AAA")
    rec["parts"]["timeline"]["at"] -= 3 * 86400  # 3 days old: too old for the refresh, fine for an analysis
    fresh_store.put(news_cache.OWNER, news_cache.KIND, "AAA", rec)
    t2 = FakeTool()
    b = news_cache.gather(md, "AAA", t2, live_timeline=False)
    assert t2.live == 0 and b["timeline"] and {c["tool"]: c["status"] for c in t2.calls}["news_attention_timeline"] == "cache_stale"
    assert b["read_at"] != _iso_of(rec["parts"]["timeline"]["at"])  # the old timeline does not age the news date


def _iso_of(t):
    return news_cache._iso(t)
