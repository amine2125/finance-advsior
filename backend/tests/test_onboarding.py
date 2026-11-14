"""Onboarding: the app starts empty, the profile comes only from the user's answers, and every rule is explained."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.analytics.profile_builder import OnboardingAnswers, build_profile
from app.data import registry

H = {"X-AEGIS-User": "u-onboard001"}
BASE = dict(display_name="Sam", age=30, objective="growth", horizon_years=20, max_decline=0.40, drop_reaction="hold",
            stable_income=True, emergency_reserve=True, liquidity_needs="low", crypto_interest="maybe")


@pytest.fixture()
def client(md, fresh_store):
    registry.reset_market_data(md)
    from app.main import app
    yield TestClient(app)
    registry.reset_market_data(None)


def test_app_starts_empty_no_default_persona_or_portfolio(client):
    me = client.get("/api/v1/me", headers=H).json()
    assert me["onboarded"] is False and me["profile"] is None and me["portfolios"] == []
    assert client.get("/api/v1/personas", headers=H).json()["personas"] == []
    r = client.post("/api/v1/agents/chat", headers=H, json={"message": "Mon portefeuille est-il diversifié ?"})
    job = client.get(f"/api/v1/jobs/{r.json()['job_id']}", headers=H).json()
    assert job["status"] == "failed"  # no hidden fallback persona / portfolio


def test_onboarding_builds_explained_profile(client):
    prev = client.post("/api/v1/onboarding/preview", json=BASE).json()
    assert prev["risk_profile_label"] == "Élevé" and prev["derivation"]
    assert client.get("/api/v1/me", headers=H).json()["onboarded"] is False  # preview never saves
    saved = client.post("/api/v1/onboarding", headers=H, json=BASE).json()
    me = client.get("/api/v1/me", headers=H).json()
    assert me["onboarded"] and me["profile"]["persona_id"] == saved["persona_id"] and me["answers"]["display_name"] == "Sam"
    again = client.post("/api/v1/onboarding", headers=H, json=BASE | {"max_decline": 0.1}).json()
    assert again["persona_id"] == saved["persona_id"] and again["budget"]["version"] == 2  # updated, not duplicated


def test_horizon_objective_and_capacity_cap_the_level():
    p, d = build_profile(OnboardingAnswers(**(BASE | {"horizon_years": 2})))
    assert p.risk_profile_label == "Prudent" and any("Horizon" in x for x in d)
    p, _ = build_profile(OnboardingAnswers(**(BASE | {"objective": "preserve"})))
    assert p.risk_profile_label == "Prudent"
    p, d = build_profile(OnboardingAnswers(**(BASE | {"emergency_reserve": False})))
    assert p.risk_profile_label == "Modéré" and any("réserve" in x for x in d)
    p, _ = build_profile(OnboardingAnswers(**(BASE | {"crypto_interest": "no"})))
    assert p.budget.max_speculative == 0


def test_age_never_changes_the_level():
    young, _ = build_profile(OnboardingAnswers(**(BASE | {"age": 22})))
    old, _ = build_profile(OnboardingAnswers(**(BASE | {"age": 70})))
    assert young.budget == old.budget and young.risk_profile_label == old.risk_profile_label


def test_reference_case_only_on_explicit_request(client, real_md):
    registry.reset_market_data(real_md)
    cases = client.get("/api/v1/reference-cases").json()["cases"]
    assert {c["persona_id"] for c in cases} == {"amira", "mateo", "robert"}
    assert client.get("/api/v1/me", headers=H).json()["onboarded"] is False
    r = client.post("/api/v1/reference-cases/robert/load", headers=H).json()
    assert r["portfolio"]["persona_id"] == "robert"
    xr = client.post("/api/v1/analysis/portfolio", headers=H, json={"portfolio_id": r["portfolio"]["portfolio_id"]})
    assert xr.status_code == 200, xr.text


def test_invest_verdict_differs_by_profile_on_identical_data(client, real_md):
    """Same portfolio, same asset, same amount: a cautious and an aggressive profile get different, explained verdicts."""
    registry.reset_market_data(real_md)
    out = {}
    for name, extra in (("prudent", dict(objective="income", horizon_years=4, max_decline=0.15, crypto_interest="no")),
                        ("audacieux", dict(objective="growth", horizon_years=20, max_decline=0.45, crypto_interest="yes"))):
        h = {"X-AEGIS-User": f"u-verdict-{name}"}
        p = client.post("/api/v1/onboarding", headers=h, json=BASE | extra).json()
        client.post("/api/v1/portfolios", headers=h, json={"name": "pf", "persona_id": p["persona_id"], "holdings": [
            {"asset_id": "XIU.TO", "amount_cad": 4000}, {"asset_id": "XBB.TO", "amount_cad": 4000}, {"asset_id": "SPY", "amount_cad": 2000}]})
        out[name] = {a: client.post("/api/v1/invest/check", headers=h, json={"asset_id": a, "amount_cad": amt}).json()
                     for a, amt in (("BTC-USD", 1000), ("TSLA", 300))}
    assert out["prudent"]["BTC-USD"]["verdict"] == "not_suitable"  # no speculative sleeve: hard stop
    assert out["audacieux"]["BTC-USD"]["verdict"] == "suitable"
    assert out["prudent"]["TSLA"]["verdict"] == "not_suitable" and out["audacieux"]["TSLA"]["verdict"] == "suitable"
    for r in out["prudent"].values():
        assert any(x["tone"] == "bad" for x in r["reasons"])  # every refusal says why


def test_short_horizon_blocks_high_risk_asset(client, real_md):
    registry.reset_market_data(real_md)
    h = {"X-AEGIS-User": "u-verdict-house"}
    client.post("/api/v1/onboarding", headers=h, json=BASE | {"horizon_years": 2})
    r = client.post("/api/v1/invest/check", headers=h, json={"asset_id": "NVDA", "amount_cad": 1000}).json()
    assert r["verdict"] == "not_suitable" and "an(s)" in r["reasons"][-1]["text"]
