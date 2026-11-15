"""Lens 1 screens, applicability, point-in-time statements, and deterministic governance (fixtures are fictional)."""
from __future__ import annotations

import datetime as dt

import pytest

from app.analytics import fundamentals as F
from app.analytics.lenses import single_asset_status_rule, stop_flags
from app.analytics.lenses.fundamental_lens import applicability
from app.analytics.ledger import MetricLedger
from app.fundamentals_providers import edgar
from app.governance.validator import check_free_text, find_forbidden, verify_arguments
from app.models import AgentArgument, AgentClaim

T = {"revenue": 1000.0, "cost_of_revenue": 600.0, "gross_profit": 400.0, "operating_income": 150.0, "net_income": 100.0, "pretax_income": 130.0,
     "income_tax": 30.0, "ocf": 140.0, "capex": 40.0, "dep_amort": 50.0, "interest_expense": 10.0, "sga": 120.0, "total_assets": 2000.0,
     "current_assets": 800.0, "current_liabilities": 400.0, "total_liabilities": 900.0, "equity": 1100.0, "retained_earnings": 500.0,
     "cash": 200.0, "lt_debt": 300.0, "st_debt": 50.0, "receivables": 150.0, "ppe_net": 600.0, "shares_diluted": 100.0}
T1 = {**T, "revenue": 900.0, "gross_profit": 340.0, "net_income": 80.0, "ocf": 100.0, "total_assets": 1900.0, "receivables": 130.0,
      "sga": 110.0, "current_assets": 700.0, "lt_debt": 320.0, "shares_diluted": 101.0, "dep_amort": 45.0, "ppe_net": 580.0}
T2 = {**T1, "total_assets": 1800.0, "net_income": 70.0, "revenue": 850.0}


def test_altman_z_manufacturer_formula():
    z = F.altman_z(T, market_cap=3000.0, manufacturer=True)
    x1, x2, x3, x4, x5 = 400 / 2000, 500 / 2000, 150 / 2000, 3000 / 900, 1000 / 2000
    assert z["value"] == pytest.approx(1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5)
    assert z["zone"] == "safe"
    zpp = F.altman_z(T, market_cap=None, manufacturer=False)
    assert zpp["value"] == pytest.approx(6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * (1100 / 900))


def test_beneish_m_formula_and_flag_wording():
    m = F.beneish_m(T, T1)
    r = m["ratios"]
    exp = (-4.84 + 0.920 * r["DSRI"] + 0.528 * r["GMI"] + 0.404 * r["AQI"] + 0.892 * r["SGI"] + 0.115 * r["DEPI"]
           - 0.172 * r["SGAI"] + 4.679 * r["TATA"] - 0.327 * r["LVGI"])
    assert m["value"] == pytest.approx(exp)
    assert m["wording"] in ("signalé pour revue", "sous le seuil de signalement")
    assert "fraude" not in m["wording"]


def test_piotroski_nine_tests():
    f = F.piotroski_f(T, T1, T2)
    assert f["status"] == "COMPUTED" and 0 <= f["value"] <= 9 and len(f["tests"]) == 9
    assert f["tests"]["roa_positive"] and f["tests"]["cfo_above_net_income"] and f["tests"]["no_new_shares"]


def test_not_applicable_vs_unavailable(md):
    assert applicability(md, "ETF1")[0] == "NOT_APPLICABLE"
    assert applicability(md, "CRY-USD")[0] == "NOT_APPLICABLE"
    assert applicability(md, "BBB.TO")[0] == "UNAVAILABLE"  # Canadian issuer: data could exist but is not connected
    assert F.is_financial("6021") and not F.is_financial("3674") and F.is_manufacturer("3674")


def test_filing_invisible_before_filing_date(monkeypatch):
    facts = {"entityName": "Fictional Co", "facts": {"us-gaap": {"Revenues": {"units": {"USD": [
        {"start": "2023-01-01", "end": "2023-12-31", "val": 10, "form": "10-K", "fp": "FY", "filed": "2024-02-20", "accn": "a1"},
        {"start": "2024-01-01", "end": "2024-12-31", "val": 12, "form": "10-K", "fp": "FY", "filed": "2025-02-20", "accn": "a2"}]}},
        "Assets": {"units": {"USD": [{"end": "2023-12-31", "val": 100, "form": "10-K", "fp": "FY", "filed": "2024-02-20", "accn": "a1"},
                                     {"end": "2024-12-31", "val": 110, "form": "10-K", "fp": "FY", "filed": "2025-02-20", "accn": "a2"}]}}}}}
    monkeypatch.setattr(edgar, "company_facts", lambda cik: facts)
    st = edgar.annual_statements("0000000001", dt.date(2025, 1, 31))  # FY2024 ended but not yet filed
    assert [p["period_end"] for p in st["periods"]] == ["2023-12-31"]
    st2 = edgar.annual_statements("0000000001", dt.date(2025, 2, 21))
    assert [p["period_end"] for p in st2["periods"]] == ["2024-12-31", "2023-12-31"]


def test_supervisor_rule_lenses_3_4_only_cannot_be_supported():
    lenses = {3: {"status": "COMPUTED"}, 4: {"status": "COMPUTED"}, 1: {"status": "NOT_APPLICABLE"}, 2: {"status": "NOT_APPLICABLE"},
              5: {"status": "UNAVAILABLE"}, 6: {"status": "NOT_APPLICABLE"}}
    rule = single_asset_status_rule(lenses, [], False)
    assert "research-supported" not in rule["allowed"]
    with_fund = {**lenses, 1: {"status": "COMPUTED", "altman": {"zone": "safe"}, "beneish": {"flagged_for_review": False}}}
    assert "research-supported" in single_asset_status_rule(with_fund, [], False)["allowed"]


@pytest.mark.parametrize("flag_kind", ["distress", "manipulation", "unverifiable", "budget", "stale"])
def test_each_stop_flag_blocks_supported(flag_kind):
    l1 = {"status": "COMPUTED", "altman": {"zone": "distress" if flag_kind == "distress" else "safe", "variant": "Z", "value": 1.0},
          "beneish": {"flagged_for_review": flag_kind == "manipulation"}}
    lenses = {1: l1, 3: {"status": "COMPUTED"}, 4: {"status": "COMPUTED"}}
    flags = stop_flags(lenses, ["x"] if flag_kind == "budget" else [], flag_kind == "unverifiable", flag_kind == "stale")
    assert flags
    assert "research-supported" not in single_asset_status_rule(lenses, flags, flag_kind == "budget")["allowed"]


def _led():
    led = MetricLedger()
    led.add("pf.weight.NVDA", "Poids NVDA", 0.30, "pct", "w")
    led.add("pf.vol", "Vol", 0.248, "pct", "std")
    led.add("pf.total_value", "Valeur", 10000, "cad", "sum")
    return led


def test_forecast_blocker_and_negation():
    assert find_forbidden("Objectif de cours : 250 $")
    assert find_forbidden("NVIDIA va monter l'an prochain")
    assert find_forbidden("probabilité de gain de 70 %")
    assert find_forbidden("Achetez maintenant")
    assert find_forbidden("un rendement attendu de 12 % par an")
    assert not find_forbidden("AEGIS ne donne aucun objectif de cours.")
    assert not find_forbidden("Le portefeuille ne va pas forcément baisser.")


def test_numbers_must_match_ledger():
    led = _led()
    ok = check_free_text("NVDA pèse 30,0 % et la volatilité est de 24,8 % pour 10 000 $.", led)
    assert ok["passed"]
    bad = check_free_text("NVDA pèse 42 % du portefeuille.", led)
    assert not bad["passed"] and bad["numeric_mismatches"]
    ratio = check_free_text("soit 6× le plafond", led)
    assert not ratio["passed"]


def test_verify_arguments_rejects_fabrications():
    led = _led()
    arg = AgentArgument(agent_id="opportunity_agent", round=1, question="q", position="p", claims=[
        AgentClaim(claim_id="C1", text="NVDA représente 30,0 % du portefeuille.", claim_type="fact", metric_ids=["pf.weight.NVDA"]),
        AgentClaim(claim_id="C2", text="NVDA a gagné 900 % sur la période.", claim_type="fact", metric_ids=["pf.return.fake"]),
        AgentClaim(claim_id="C3", text="Le titre a chuté à cause de la rumeur.", claim_type="fact", metric_ids=["pf.vol"]),
        AgentClaim(claim_id="C4", text="Le risque est élevé.", claim_type="fact"),
        AgentClaim(claim_id="C5", text="La position pourrait offrir une exposition à la croissance.", claim_type="interpretation"),
        AgentClaim(claim_id="C6", text="NVDA représente 30,0 %.", claim_type="fact", source_ids=["src.invented"])])
    v = verify_arguments([arg], led, {"dataset_prices"}, set())
    st = {c.claim_id: c.accepted for c in v.checked_claims}
    assert st == {"C1": True, "C2": False, "C3": False, "C4": False, "C5": True, "C6": False}
    assert not v.passed
