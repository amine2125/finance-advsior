"""WebResearchTool: the only path by which agents reach the Internet. Every call is logged for audit."""
from __future__ import annotations

import datetime as dt
import time

from ..config import get_settings
from ..models import utcnow
from . import providers
from .http import ResearchError


class WebResearchTool:
    def __init__(self) -> None:
        self.enabled = get_settings().web_research_enabled
        self.calls: list[dict] = []

    def _run(self, name: str, provider: str, fn, *args, **kwargs):
        rec = {"tool": name, "provider": provider, "args": [str(a) for a in args], "started_at": utcnow(), "status": "ok"}
        t0 = time.time()
        if not self.enabled:
            rec.update(status="disabled", error="Recherche Internet désactivée (AEGIS_WEB_RESEARCH_ENABLED=false)")
            self.calls.append(rec)
            return None
        try:
            out = fn(*args, **kwargs)
            rec["n_results"] = len(out) if isinstance(out, list) else 1
            return out
        except ResearchError as exc:
            rec.update(status=exc.kind, error=str(exc))
            return None
        except Exception as exc:  # noqa: BLE001 - provider failures must never crash research
            rec.update(status="error", error=f"{exc.__class__.__name__}: {str(exc)[:160]}")
            return None
        finally:
            rec["latency_ms"] = int((time.time() - t0) * 1000)
            if rec not in self.calls:
                self.calls.append(rec)

    def filings(self, cik: str, days: int = 120, until: dt.date | None = None):
        until = until or dt.date.today()
        return self._run("sec_filings", "sec_edgar", providers.sec_filings, cik, until - dt.timedelta(days=days), until)

    def news(self, query: str, days: int = 14):
        return self._run("news_search", "gdelt", providers.gdelt_articles, query, days)

    def news_timeline(self, query: str, days: int = 90):
        return self._run("news_attention_timeline", "gdelt", providers.gdelt_timeline, query, days)

    def crypto_snapshot(self, coin_id: str):
        return self._run("crypto_snapshot", "coingecko", providers.coingecko_snapshot, coin_id)

    def crypto_trending(self):
        return self._run("crypto_trending", "coingecko", providers.coingecko_trending)

    def crypto_search(self, query: str):
        return self._run("crypto_search", "coingecko", providers.coingecko_search, query)

    def crypto_history(self, coin_id: str, days: int = 365):
        return self._run("crypto_history", "coingecko", providers.coingecko_history, coin_id, days)

    def latest_fx(self):
        return self._run("latest_fx", "bank_of_canada", providers.boc_latest_fx)
