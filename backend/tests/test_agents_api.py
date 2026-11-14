"""Agent workflow, API integration and API-level end-to-end flows on SYNTHETIC data with a TEST-ONLY scripted LLM."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.agents import llm as llm_mod
from app.data import registry
from tests.stubs import ScriptedLLM

H = {"X-AEGIS-User": "u-tests0001"}
H2 = {"X-AEGIS-User": "u-tests0002"}


@pytest.fixture()
def env(md, fresh_store):
    registry.reset_market_data(md)
    stub = ScriptedLLM()
    llm_mod.set_llm(stub)
    from app.main import app
    yield TestClient(app), stub
    llm_mod.set_llm(None)
    registry.reset_market_data(None)


def _pf(client, headers=H, persona="robert"):
    r = client.post("/api/v1/portfolios", headers=headers, json={"name": "Test tech", "persona_id": persona, "holdings": [
        {"asset_id": "AAA", "amount_cad": 6000}, {"asset_id": "ETF1", "amount_cad": 3000}, {"asset_id": "BND.TO", "amount_cad": 1000}]})
    assert r.status_code == 200, r.text
    return r.json()["portfolio_id"]


def _debate(client, pid, **extra):
    import app.config as cfg
    cfg.get_settings.cache_clear()
    import os
    os.environ["AEGIS_LLM_ENABLED"] = "true"
    cfg.get_settings.cache_clear()
    try:
        r = client.post("/api/v1/agents/debate", headers=H, json={"portfolio_id": pid, "persona_id": "robert", **extra})
        assert r.status_code == 200, r.text
        job = client.get(f"/api/v1/jobs/{r.json()['job_id']}", headers=H).json()
        assert job["status"] == "done", job
        return client.get(f"/api/v1/agents/debate/{job['result_ref']}", headers=H).json(), job
    finally:
        os.environ["AEGIS_LLM_ENABLED"] = "false"
        cfg.get_settings.cache_clear()


def test_debate_independent_agents_audit_and_correction(env):
    client, stub = env
    pid = _pf(client)
    d, job = _debate(client, pid, inject_unsupported_claim=True)
    agents = [c["agent_id"] for c in stub.calls]
    assert "opportunity_agent.r1" in agents and "risk_agent.r1" in agents      # two independent calls
    opp = next(c for c in stub.calls if c["agent_id"] == "opportunity_agent.r1")
    risk = next(c for c in stub.calls if c["agent_id"] == "risk_agent.r1")
    assert opp["system"] != risk["system"] and opp["user"] == risk["user"]    # distinct instructions, same evidence packet
    assert sum(a.startswith("opportunity_agent.r") for a in agents) <= 2       # max two rounds enforced
    rejected = {r["claim_id"] for r in d["decision"]["rejected_or_unverified_claims"]}
    assert "OPP-R1-INJ" in rejected                                            # injected fabrication caught
    sup_calls = [a for a in agents if a.startswith("supervisor")]
    assert sup_calls == ["supervisor.synthesis", "supervisor.correction"]      # bounded correction pass ran once
    assert d["decision"]["final_assessment"]["status"] != "research-supported" or "research-supported" in d["allowed_statuses"]
    assert "va monter" not in d["decision"]["final_assessment"]["headline"]
    assert any(c["stage"] == "audit de la synthèse" for c in d["decision"]["corrections"])
    assert {s["step_id"] for s in job["steps"]} >= {"opportunity.r1", "risk.r1", "audit.final", "supervisor.synthesis"}


def test_debate_abstains_when_agents_fail(env):
    client, stub = env
    stub.fail_agents = {"opportunity_agent", "risk_agent"}
    pid = _pf(client)
    d, _ = _debate(client, pid)
    assert d["decision"]["abstained"] and d["decision"]["final_assessment"]["status"] == "insufficient-data"
    assert d["xray"]["findings"]  # deterministic findings remain available


def test_portfolio_analysis_alerts_dedup_and_isolation(env):
    client, _ = env
    pid = _pf(client)
    r = client.post("/api/v1/analysis/portfolio", headers=H, json={"portfolio_id": pid, "persona_id": "robert"})
    assert r.status_code == 200
    xr = r.json()
    assert xr["ledger"]["pf.weight.AAA"]["value"] == pytest.approx(0.6)
    assert any(f["kind"] == "direct_issuer" for f in xr["findings"])
    assert client.get(f"/api/v1/analysis/{xr['analysis_id']}", headers=H).status_code == 200
    s1 = client.post("/api/v1/alerts/scan", headers=H, json={"portfolio_id": pid, "persona_id": "robert"}).json()
    s2 = client.post("/api/v1/alerts/scan", headers=H, json={"portfolio_id": pid, "persona_id": "robert"}).json()
    assert s1["new_alerts"] and not s2["new_alerts"]                             # retries do not duplicate alerts
    assert client.get(f"/api/v1/portfolios/{pid}", headers=H2).status_code == 404  # other users cannot read it
    assert client.get("/api/v1/alerts", headers=H2).json()["alerts"] == []


def test_same_portfolio_amira_vs_robert(env):
    client, _ = env
    pid = _pf(client)
    a = client.post("/api/v1/analysis/portfolio", headers=H, json={"portfolio_id": pid, "persona_id": "amira"}).json()
    r = client.post("/api/v1/analysis/portfolio", headers=H, json={"portfolio_id": pid, "persona_id": "robert"}).json()
    assert a["ledger"]["pf.vol"]["value"] == pytest.approx(r["ledger"]["pf.vol"]["value"])  # identical facts
    sa = {c["rule_id"]: c["status"] for c in a["persona_assessment"]["budget_checks"]}
    sr = {c["rule_id"]: c["status"] for c in r["persona_assessment"]["budget_checks"]}
    assert sa != sr


def test_csv_import_validation_and_persona_update(env):
    client, _ = env
    ok = client.post("/api/v1/portfolios/import", headers=H, json={"name": "csv", "csv": "asset_id,quantity\nAAA,3\nETF1,2\n"})
    assert ok.status_code == 200 and len(ok.json()["holdings"]) == 2
    bad = client.post("/api/v1/portfolios/import", headers=H, json={"name": "csv", "csv": "asset_id,quantity\nZZZ,3\n"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "data_unavailable"
    p = client.get("/api/v1/personas/robert", headers=H).json()
    p["budget"]["max_single_issuer"] = 0.08
    up = client.put("/api/v1/personas/robert", headers=H, json=p)
    assert up.status_code == 200 and up.json()["budget"]["version"] >= 2


def test_hypotheses_register_evaluate_and_contamination(env):
    client, _ = env
    r = client.post("/api/v1/hypotheses/register", headers=H, json={"key": "H1", "cutoff": "2023-03-31", "assets": ["AAA", "ETF1"]}).json()
    assert r["status"] == "registered" and not r["holdout_contaminated"]
    e = client.post(f"/api/v1/hypotheses/{r['hypothesis_id']}/evaluate", headers=H).json()
    assert e["result"]["status"] == "evaluated"
    r2 = client.post("/api/v1/hypotheses/register", headers=H, json={"key": "H1", "cutoff": "2023-03-31", "assets": ["AAA", "ETF1"],
                                                                     "overrides": {"lambda": 0.9}}).json()
    assert r2["holdout_contaminated"]  # tuned after viewing the holdout


def test_hype_fixture_flow_and_unavailable_feeds(env):
    client, _ = env
    pid = _pf(client)
    r = client.post("/api/v1/hype/research", headers=H, json={"asset_id": "CRY-USD", "question": "C'est viral, ça va monter ?",
                                                             "persona_id": "robert", "portfolio_id": pid, "amount_cad": 5000, "use_fixture": True})
    assert r.status_code == 200, r.text
    job = client.get(f"/api/v1/jobs/{r.json()['job_id']}", headers=H).json()
    assert job["status"] == "done", job
    res = client.get(f"/api/v1/hype/research/{job['result_ref']}", headers=H).json()
    assert res["is_fixture"] and "FICTIFS" in res["fixture_label"]
    assert res["independence"]["independent_reports"] < res["independence"]["articles"]
    assert "research-supported" not in res["status_rule"]["allowed"]
    assert res["forecast_policy"]["parts"][0]["title"] == "Ce qui ne peut pas être connu"
    assert res["biases"] and res["portfolio_impact"]["new_breaches"]
    assert {c["family"]: c["status"] for c in res["coverage_meter"]}["Réseaux sociaux (Reddit, X)"] == "NOT_CONNECTED"
    lenses = res["lenses"]
    assert lenses["1"]["status"] == "NOT_APPLICABLE" and lenses["5"]["status"] == "PARTIAL"
    assert len({m["id"] for m in res["coverage_matrix"]}) == 13
    amb = client.post("/api/v1/hype/research", headers=H, json={"asset_id": "synthetic"})
    assert amb.status_code == 409  # ambiguous name never silently resolved


def test_replay_and_what_changed(env, md):
    client, _ = env
    pid = _pf(client)
    r = client.post("/api/v1/replay", headers=H, json={"portfolio_id": pid, "persona_id": "robert", "start": "2023-01-02", "end": "2023-06-30",
                                                      "step_days": 14}).json()
    job = client.get(f"/api/v1/jobs/{r['job_id']}", headers=H).json()
    assert job["status"] == "done", job
    rep = client.get(f"/api/v1/replay/{job['result_ref']}", headers=H).json()
    assert rep["label"] == "SIMULÉ / REJEU HISTORIQUE" and all(a["simulated_replay"] for a in rep["alerts"])
    assert rep["steps"][0]["date"] <= "2023-01-02"
    wc = rep["what_changed"]
    assert wc["total_change"] == pytest.approx(wc["market_effect"] + wc["composition_effect"])
