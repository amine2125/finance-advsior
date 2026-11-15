"""Agent workflow, API integration and API-level end-to-end flows on SYNTHETIC data with a TEST-ONLY scripted LLM."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.agents import llm as llm_mod
from app.data import registry
from tests_aegis.stubs import ScriptedLLM

H = {"X-AEGIS-User": "u-tests0001"}
H2 = {"X-AEGIS-User": "u-tests0002"}


@pytest.fixture()
def env(md, fresh_store):
    registry.reset_market_data(md)
    stub = ScriptedLLM()
    llm_mod.set_llm(stub)
    from app.main import app
    client = TestClient(app)
    from app.services import portfolio_service as ps
    from tests_aegis.fixtures import REFERENCE_PERSONAS
    for hdr in (H, H2):  # the app is empty by default: tests create their profiles explicitly
        for p in REFERENCE_PERSONAS:
            ps.save_persona(hdr["X-AEGIS-User"], p)
    yield client, stub
    llm_mod.set_llm(None)
    registry.reset_market_data(None)


def _pf(client, headers=H, persona="robert"):
    r = client.post("/api/v1/portfolios", headers=headers, json={"name": "Test tech", "persona_id": persona, "holdings": [
        {"asset_id": "AAA", "amount_cad": 6000}, {"asset_id": "ETF1", "amount_cad": 3000}, {"asset_id": "BND.TO", "amount_cad": 1000}]})
    assert r.status_code == 200, r.text
    return r.json()["portfolio_id"]


def test_portfolio_analysis_and_isolation(env):
    client, _ = env
    pid = _pf(client)
    r = client.post("/api/v1/analysis/portfolio", headers=H, json={"portfolio_id": pid, "persona_id": "robert"})
    assert r.status_code == 200
    xr = r.json()
    assert xr["ledger"]["pf.weight.AAA"]["value"] == pytest.approx(0.6)
    assert any(f["kind"] == "direct_issuer" for f in xr["findings"])
    assert client.get(f"/api/v1/analysis/{xr['analysis_id']}", headers=H).status_code == 200
    assert client.get(f"/api/v1/portfolios/{pid}", headers=H2).status_code == 404  # other users cannot read it
    assert client.get("/api/v1/me", headers=H2).json()["portfolios"] == []         # nor see it in their account


def test_same_portfolio_amira_vs_robert(env):
    client, _ = env
    pid = _pf(client)
    a = client.post("/api/v1/analysis/portfolio", headers=H, json={"portfolio_id": pid, "persona_id": "amira"}).json()
    r = client.post("/api/v1/analysis/portfolio", headers=H, json={"portfolio_id": pid, "persona_id": "robert"}).json()
    assert a["ledger"]["pf.vol"]["value"] == pytest.approx(r["ledger"]["pf.vol"]["value"])  # identical facts
    sa = {c["rule_id"]: c["status"] for c in a["persona_assessment"]["budget_checks"]}
    sr = {c["rule_id"]: c["status"] for c in r["persona_assessment"]["budget_checks"]}
    assert sa != sr


def test_csv_import_validation(env):
    client, _ = env
    ok = client.post("/api/v1/portfolios/import", headers=H, json={"name": "csv", "csv": "asset_id,quantity\nAAA,3\nETF1,2\n"})
    assert ok.status_code == 200 and len(ok.json()["holdings"]) == 2
    bad = client.post("/api/v1/portfolios/import", headers=H, json={"name": "csv", "csv": "asset_id,quantity\nZZZ,3\n"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "data_unavailable"


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
