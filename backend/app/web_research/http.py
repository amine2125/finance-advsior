"""Outbound HTTPS for research tools: domain allow-list, per-provider throttling, caching and status tracking."""
from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import asdict, dataclass, field
from urllib.parse import urlparse

import httpx

from ..models import utcnow

ALLOWED_DOMAINS = {
    "api.gdeltproject.org", "data.sec.gov", "www.sec.gov", "efts.sec.gov", "api.coingecko.com", "www.bankofcanada.ca",
    "fred.stlouisfed.org",
}


class ResearchError(RuntimeError):
    def __init__(self, provider: str, message: str, kind: str = "error"):
        super().__init__(message)
        self.provider, self.kind = provider, kind


@dataclass
class ProviderStatus:
    provider: str
    description: str
    configured: bool = True
    last_success: str | None = None
    last_error: str | None = None
    last_error_at: str | None = None
    calls: int = 0
    errors: int = 0
    rate_limited: int = 0
    min_interval_s: float = 1.0
    features: list[str] = field(default_factory=list)
    license: str = ""


STATUS: dict[str, ProviderStatus] = {
    "sec_edgar": ProviderStatus("sec_edgar", "SEC EDGAR submissions + XBRL companyfacts (sources primaires US)", min_interval_s=0.15,
                                features=["filings", "fundamentals"], license="Données publiques du gouvernement US; politique d'accès équitable SEC"),
    "gdelt": ProviderStatus("gdelt", "GDELT DOC 2.0 (découverte d'actualités et volume médiatique)", min_interval_s=5.5,
                            features=["news_discovery", "attention_timeline"],
                            license="GDELT: usage libre avec citation; la présence d'un article ne prouve pas son contenu"),
    "coingecko": ProviderStatus("coingecko", "CoinGecko API publique (marché crypto, tendances)", min_interval_s=2.5,
                                features=["crypto_market", "trending", "crypto_history_365d"],
                                license="CoinGecko API publique: attribution requise, limites de débit du plan gratuit"),
    "bank_of_canada": ProviderStatus("bank_of_canada", "Banque du Canada Valet (taux de change, taux)", min_interval_s=0.5,
                                     features=["fx", "rates"], license="https://www.bankofcanada.ca/terms/"),
}
_locks = {k: threading.Lock() for k in STATUS}
_last = {k: 0.0 for k in STATUS}
_cache: dict[str, tuple[float, object]] = {}


def provider_status() -> list[dict]:
    return [asdict(s) for s in STATUS.values()]


def fetch_json(provider: str, url: str, params: dict | None = None, headers: dict | None = None, ttl_s: int = 900,
               timeout: float = 20.0, retries: int = 2) -> object:
    host = urlparse(url).hostname or ""
    if urlparse(url).scheme != "https" or host not in ALLOWED_DOMAINS:
        raise ResearchError(provider, f"domaine non autorisé: {host}", "blocked_domain")
    key = hashlib.sha256((url + json.dumps(params or {}, sort_keys=True)).encode()).hexdigest()
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl_s:
        return hit[1]
    st = STATUS[provider]
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        with _locks[provider]:
            wait = st.min_interval_s - (time.time() - _last[provider])
            if wait > 0:
                time.sleep(wait)
            _last[provider] = time.time()
            st.calls += 1
            try:
                r = httpx.get(url, params=params, headers=headers or {"User-Agent": "AEGIS-datathon-research/1.0"},
                              timeout=timeout, follow_redirects=False)
            except httpx.HTTPError as exc:
                last_exc = exc
                st.errors += 1
                st.last_error, st.last_error_at = f"réseau: {exc.__class__.__name__}", utcnow()
                continue
        if r.status_code == 429:
            st.rate_limited += 1
            st.last_error, st.last_error_at = "HTTP 429 (limite de débit)", utcnow()
            last_exc = ResearchError(provider, "limite de débit atteinte (HTTP 429)", "rate_limited")
            time.sleep(st.min_interval_s * (attempt + 1))
            continue
        if r.status_code != 200:
            st.errors += 1
            st.last_error, st.last_error_at = f"HTTP {r.status_code}", utcnow()
            raise ResearchError(provider, f"HTTP {r.status_code}", "http_error")
        try:
            data = r.json()
        except ValueError:
            st.errors += 1
            txt = r.text[:200].replace("\n", " ")
            st.last_error, st.last_error_at = f"réponse non JSON: {txt}", utcnow()
            raise ResearchError(provider, f"réponse non JSON: {txt}", "bad_response")
        st.last_success = utcnow()
        _cache[key] = (time.time(), data)
        return data
    if isinstance(last_exc, ResearchError):
        raise last_exc
    raise ResearchError(provider, f"inaccessible: {last_exc}", "network")
