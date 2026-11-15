"""Onboarding: the app starts empty, the profile comes only from the user's answers, and every rule is explained."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.analytics.profile_builder import OnboardingAnswers, build_profile
from app.data import registry

H = {"X-AEGIS-User": "u-onboard001"}
BASE = dict(display_name="Sam", age=30, objective="growth", horizon_years=20, max_decline=0.40, drop_reaction="hold",
            stable_income=True, emergency_reserve=True, liquidity_needs="low", crypto_interest="maybe")


def _check(h: dict, asset_id: str, amount: float) -> dict:
    """« Puis-je investir X $ dans Y ? » for this user's own profile and portfolio (the verdict the mandate relies on)."""
    from app.data.registry import get_market_data
    from app.services import portfolio_service as ps
    from app.services.invest_service import check_investment
    owner = h["X-AEGIS-User"]
    pfs = ps.list_portfolios(owner)
    pf = pfs[0] if pfs else None
    return check_investment(get_market_data(), ps.resolve_persona(owner, None, pf), pf, asset_id, amount)


@pytest.fixture()
def client(md, fresh_store):
    registry.reset_market_data(md)
    from app.main import app
    yield TestClient(app)
    registry.reset_market_data(None)


def test_app_starts_empty_no_default_persona_or_portfolio(client):
    me = client.get("/api/v1/me", headers=H).json()
    assert me["onboarded"] is False and me["profile"] is None and me["portfolios"] == []
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
    assert p.risk_profile_label == "Modéré" and any("urgence" in x for x in d)
    p, _ = build_profile(OnboardingAnswers(**(BASE | {"crypto_interest": "no"})))
    assert p.budget.max_speculative == 0


def test_age_never_changes_the_level():
    young, _ = build_profile(OnboardingAnswers(**(BASE | {"age": 22})))
    old, _ = build_profile(OnboardingAnswers(**(BASE | {"age": 70})))
    assert young.budget == old.budget and young.risk_profile_label == old.risk_profile_label


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
        out[name] = {a: _check(h, a, amt)
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
    r = _check(h, "NVDA", 1000)
    assert r["verdict"] == "not_suitable" and "an(s)" in r["reasons"][-1]["text"]


def test_existing_breach_never_hides_a_new_one(client, real_md):
    """A portfolio already 100 % in one asset must not make every other risky line look acceptable."""
    registry.reset_market_data(real_md)
    for name, extra, asset in (("prudent", dict(objective="income", horizon_years=5, max_decline=0.10), "TSLA"),
                               ("modere", dict(objective="balanced", horizon_years=10, max_decline=0.20), "AAPL")):
        h = {"X-AEGIS-User": f"u-masked-{name}"}
        p = client.post("/api/v1/onboarding", headers=h, json=BASE | extra).json()
        client.post("/api/v1/portfolios", headers=h, json={"name": "pf", "persona_id": p["persona_id"],
                                                           "holdings": [{"asset_id": "BTC-USD", "amount_cad": 1000}]})
        r = _check(h, asset, 1000)
        if name == "prudent":  # HIGH-risk asset, LOW-risk profile: refused whatever the portfolio
            assert r["verdict"] == "not_suitable"
        else:  # a single company above the per-company cap is a new breach even if BTC already breaches it
            assert r["verdict"] != "suitable" and r["max_amount_cad"] < 1000
            assert any("par entreprise" in x["text"] for x in r["reasons"])


def test_recommended_plan_fits_every_profile(client, real_md):
    registry.reset_market_data(real_md)
    for i, extra in enumerate((dict(objective="preserve", horizon_years=2, max_decline=0.10), dict(objective="balanced", horizon_years=10, max_decline=0.20),
                               dict(objective="growth", horizon_years=20, max_decline=0.45, esg_preference=True))):
        h = {"X-AEGIS-User": f"u-plan-{i}"}
        client.post("/api/v1/onboarding", headers=h, json=BASE | extra)
        from app.data.registry import get_market_data
        from app.services import portfolio_service as ps
        from app.services.plan_service import recommended_plan
        plan = recommended_plan(get_market_data(), ps.resolve_persona(h["X-AEGIS-User"], None), 10000)
        assert plan["fits_profile"], plan["checks"]
        amounts = [x["amount_cad"] for s in plan["sleeves"] for x in s["holdings"]]
        assert abs(sum(amounts) - 10000) < 1 and all(x["asset_id"] not in ("BTC-USD", "ETH-USD") for s in plan["sleeves"] for x in s["holdings"])
        assert plan["history"]["series"] and plan["history"]["value_end"] > 0


def test_crypto_only_portfolio_analysis_is_valid_json(client, real_md):
    """Crypto trades on weekends, the comparison index does not: the chart series must never contain NaN (invalid JSON)."""
    registry.reset_market_data(real_md)
    h = {"X-AEGIS-User": "u-crypto-only"}
    p = client.post("/api/v1/onboarding", headers=h, json=BASE).json()
    pf = client.post("/api/v1/portfolios", headers=h, json={"name": "pf", "persona_id": p["persona_id"],
                                                            "holdings": [{"asset_id": "BTC-USD", "amount_cad": 1000}]}).json()
    r = client.post("/api/v1/analysis/portfolio", headers=h, json={"portfolio_id": pf["portfolio_id"]})
    assert r.status_code == 200
    assert all(s["benchmark"] is None or s["benchmark"] > 0 for s in r.json()["risk"]["series"])


FULL = BASE | dict(objective="growth", horizon_years=20, max_decline=0.45, portfolio_choice="D", gamble="big_risk", drop_reaction="buy_more",
                   volatility_feeling="excited", past_behavior="bought", household="single", dependants_count=0, employment="permanent",
                   income_outlook="up", income_net_monthly=4500, expenses_monthly=3000, savings_cad=12000, investments_cad=20000,
                   credit_card_debt_cad=0, other_debt_cad=0, knowledge_self="good", quiz_diversification="b", quiz_bonds="a",
                   quiz_inflation="c", products_held=["etf", "stocks", "crypto"], crypto_interest="yes")


def test_kyc_high_tolerance_full_capacity_is_high():
    p, _ = build_profile(OnboardingAnswers(**FULL))
    assert p.risk_profile_label == "Élevé" and p.kyc["capacity"]["index"] == 3 and p.kyc["knowledge"]["level"] == "Avancé"
    assert p.kyc["snapshot"]["emergency_months"] == 4.0 and p.kyc["snapshot"]["monthly_margin"] == 1500 and not p.kyc["before_investing"]


def test_kyc_capacity_overrides_a_bold_tolerance():
    """Says « risque élevé », but no cushion and a credit card balance: the situation sets the limit, and says what to do first."""
    p, d = build_profile(OnboardingAnswers(**(FULL | {"savings_cad": 500, "credit_card_debt_cad": 3000, "employment": "contract"})))
    assert p.kyc["tolerance"]["level"] == "Élevé" and p.risk_profile_label == "Prudent" and p.kyc["binding"] == "capacité"
    assert p.kyc["gap_note"] and [s["kind"] for s in p.kyc["before_investing"]][:2] == ["credit_card", "emergency"]


def test_kyc_behaviour_beats_words_and_flags_contradiction():
    p, _ = build_profile(OnboardingAnswers(**(FULL | {"drop_reaction": "sell_all"})))
    assert p.risk_profile_label == "Prudent" and p.kyc["tolerance"]["inconsistent"] and "contredisent" in p.kyc["tolerance"]["note"]


def test_kyc_novice_capped_and_no_crypto():
    p, d = build_profile(OnboardingAnswers(**(FULL | {"knowledge_self": "none", "quiz_diversification": "a", "quiz_bonds": "b",
                                                      "quiz_inflation": "a", "products_held": []})))
    assert p.risk_profile_label == "Modéré" and p.budget.max_speculative == 0 and p.kyc["knowledge"]["level"] == "Débutant"


def _run_mandate(client, h, text):
    j = client.post("/api/v1/mandates", headers=h, json={"request": text}).json()
    job = client.get(f"/api/v1/jobs/{j['job_id']}", headers=h).json()
    assert job["status"] == "done", job.get("error")
    return client.get(f"/api/v1/mandates/{job['result_ref']}", headers=h).json(), job


def test_mandate_agentic_workflow_on_users_own_portfolio(client, real_md, monkeypatch):
    """The user's OWN profile and portfolio drive the agents: no persona is hard-coded. Works without the LLM (deterministic parts)."""
    registry.reset_market_data(real_md)
    monkeypatch.setenv("AEGIS_JOB_RUNNER", "inline")
    from app.config import get_settings
    get_settings.cache_clear()
    h = {"X-AEGIS-User": "u-mandate-own"}
    p = client.post("/api/v1/onboarding", headers=h, json=BASE | dict(objective="income", horizon_years=4, max_decline=0.15, crypto_interest="no")).json()
    client.post("/api/v1/portfolios", headers=h, json={"name": "pf", "persona_id": p["persona_id"], "holdings": [
        {"asset_id": "XIU.TO", "amount_cad": 40000}, {"asset_id": "XBB.TO", "amount_cad": 40000}, {"asset_id": "RY.TO", "amount_cad": 10000}]})
    # a hyped single stock, too risky for this profile: refused, money redirected, every step traced
    m, job = _run_mandate(client, h, "Je veux mettre 20 000 $ dans NVIDIA")
    assert m["requested"]["verdict"] == "not_suitable" and all(o["asset_id"] != "NVDA" for o in m["orders"])
    assert abs(sum(o["amount_cad"] for o in m["orders"]) - 20000) < 1 and any(g["status"] == "blocked" for g in m["governance"])
    assert [s["step_id"] for s in job["steps"]][:3] == ["profile.read", "supervisor.understand", "data.collect"]
    assert any(r["key"] == "replay_2022" and "before" in r for r in m["stress"])
    # new money first fills what is missing (here: stability), never adds to an over-weight sleeve
    m2, _ = _run_mandate(client, h, "J'ai 10 000 $ à investir")
    assert m2["orders"] and all(o["asset_id"] in ("ZST.TO", "XBB.TO", "AGG") for o in m2["orders"])
    # a full review brings everything back within the limits, then approval updates the simulated portfolio
    m3, _ = _run_mandate(client, h, "Analyse et rééquilibre mon portefeuille")
    assert any(o["side"] == "sell" for o in m3["orders"]) and not [g for g in m3["governance"] if g["status"] == "breach"]
    ok = client.post(f"/api/v1/mandates/{m3['mandate_id']}/approve", headers=h).json()
    assert ok["status"] == "approved"
    get_settings.cache_clear()


def test_kyc_big_cushion_offsets_unstable_income_and_reasons_are_shown():
    rich = FULL | {"employment": "student", "savings_cad": 400000, "expenses_monthly": 2000, "horizon_years": 5}
    p, _ = build_profile(OnboardingAnswers(**rich))
    k = p.kyc
    assert k["capacity"]["level"] == "Faible à modéré"  # only the 5-year horizon limits it, not the student status
    assert any("Horizon" in r for r in k["capacity"]["reasons"]) and any("compensé" in r for r in k["capacity"]["reasons"])
    assert "horizon" in k["gap_note"].lower()


def test_tech_index_concentration_is_seen_by_the_diagnosis(client, real_md):
    """100 % in a tech index (QQQ) is not « diversified » for a prudent investor: the agents must say so in plain words."""
    registry.reset_market_data(real_md)
    h = {"X-AEGIS-User": "u-tech-index"}
    p = client.post("/api/v1/onboarding", headers=h, json=BASE | dict(objective="income", horizon_years=5, max_decline=0.10, crypto_interest="no")).json()
    client.post("/api/v1/portfolios", headers=h, json={"name": "pf", "persona_id": p["persona_id"], "holdings": [{"asset_id": "QQQ", "amount_cad": 10000}]})
    d = client.get("/api/v1/diagnosis", headers=h).json()
    assert d["fits"] is False and {"budget.growth_band", "budget.theme_exposure"} <= {x["rule_id"] for x in d["problems"]}
    assert "technologie" in next(x["detail"] for x in d["problems"] if x["rule_id"] == "budget.theme_exposure")


def test_connected_account_is_realistic_and_minimal_correction_keeps_good_funds(client, real_md, monkeypatch):
    """Simulated brokerage connection: real past prices give real gains; the agents' fix trims what breaks a limit and keeps the rest."""
    registry.reset_market_data(real_md)
    monkeypatch.setenv("AEGIS_JOB_RUNNER", "inline")
    from app.config import get_settings
    get_settings.cache_clear()
    h = {"X-AEGIS-User": "u-connect-min"}
    client.post("/api/v1/onboarding", headers=h, json=BASE | dict(objective="balanced", horizon_years=10, max_decline=0.20, crypto_interest="no"))
    pv = client.get("/api/v1/connections/bnc/preview", headers=h).json()
    assert pv["mode"] == "simulation" and {"celi", "reer"} <= {a["id"] for a in pv["accounts"]}
    client.post("/api/v1/connections", headers=h, json={"institution_id": "bnc", "accounts": [a["id"] for a in pv["accounts"]]})
    hold = client.get("/api/v1/holdings", headers=h).json()
    assert hold["cost_cad"] > 0 and hold["gain_cad"] is not None and all(x["accounts"] for x in hold["holdings"])
    m, _ = _run_mandate(client, h, "Analyse et rééquilibre mon portefeuille")
    assert m["diagnosis"]["fits"] is False and not [g for g in m["governance"] if g["status"] == "breach"]
    get_settings.cache_clear()
