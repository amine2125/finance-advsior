"""Phase 2: analysis tools. Synthetic cases checked by hand + regression guards on real data."""
import math

import numpy as np
import pytest

from tests import synthetic
from ulysse.analytics import core, portfolio as pfm, tools
from ulysse.data.datapack import Datapack


@pytest.fixture(scope="module")
def sdp(tmp_path_factory):
    return Datapack(synthetic.build(tmp_path_factory.mktemp("dp")))


def test_volatility_matches_hand_computation(sdp):
    v = sdp.asof(None)
    e = core.volatilite(v, "AAA", window=252)
    lvl = v.series("AAA")[-253:]
    r = lvl[1:] / lvl[:-1] - 1
    assert e.valeur == pytest.approx(np.std(r, ddof=1) * math.sqrt(252) * 100, abs=1e-6)  # evidence rounded to 6 dp
    assert 15.8 < e.valeur < 16.0     # ±1 % alternating moves ≈ 1 % daily ≈ 15.9 % annualised


def test_max_drawdown_on_constructed_path(sdp):
    v = sdp.asof(None)
    e = core.pire_baisse(v, "DDD")
    assert e.valeur["baisse_pct"] == pytest.approx(-40.0, abs=1e-9)
    assert e.valeur["date_sommet"] == str(sdp.calendar[199]) and e.valeur["date_creux"] == str(sdp.calendar[299])
    assert e.valeur["date_retour_au_sommet"] is not None


def test_cvar_matches_definition(sdp):
    v = sdp.asof(None)
    e = core.cvar(v, "BBB", alpha=0.95, horizon=1, years=10, currency="local")
    lvl = v.series("BBB", currency="local")
    losses = -(lvl[1:] / lvl[:-1] - 1)
    var = np.quantile(losses, 0.95)
    assert e.valeur["cvar_pct"] == pytest.approx(-losses[losses >= var].mean() * 100, abs=1e-6)


def test_insufficient_history_is_said(sdp):
    v = sdp.asof(str(sdp.calendar[40]))
    e = core.volatilite(v, "AAA", window=252)
    assert e.statut == "donnees_insuffisantes" and e.valeur is None and "requises" in e.note


def test_look_through_opens_the_fund(sdp):
    v = sdp.asof(None)
    pf = pfm.Portfolio([pfm.Holding("ETF1", 10), pfm.Holding("AAA", 1)], cash_cad=0.0)
    val = pfm.valuation(v, pf)
    w_etf = next(x["poids"] for x in val["lignes"] if x["ticker"] == "ETF1")
    w_aaa = next(x["poids"] for x in val["lignes"] if x["ticker"] == "AAA")
    lt = pfm.look_through(v, pf)
    assert lt["titres"]["AAA"] == pytest.approx(w_aaa + 0.6 * w_etf)
    assert lt["titres"]["BBB"] == pytest.approx(0.4 * w_etf)
    assert sum(lt["classes"].values()) == pytest.approx(1.0)
    assert lt["couverture"] == pytest.approx(1.0) and lt["fonds_opaques"] == []


def test_risk_contributions_add_up(sdp):
    v = sdp.asof(None)
    pf = pfm.Portfolio([pfm.Holding("AAA", 10), pfm.Holding("BBB", 20), pfm.Holding("CRY", 0.5)], cash_cad=500)
    vol, contrib, enb = pfm.ev_contribution_risque(v, pf, years=2)
    assert sum(contrib.valeur.values()) == pytest.approx(100.0, abs=1e-6)
    assert vol.valeur > 0 and 1.0 <= enb.valeur <= 3.0
    assert max(contrib.valeur, key=contrib.valeur.get) == "CRY"   # 5 % daily moves dominate the risk


def test_identical_twins_are_one_bet(sdp):
    v = sdp.asof(None)
    pf = pfm.Portfolio([pfm.Holding("BBB", 10), pfm.Holding("BBB2", 10), pfm.Holding("DDD", 3)])
    e = pfm.ev_paris_reels(v, pf, years=2)
    groups = [set(g["titres"]) for g in e.valeur["groupes"]]
    assert {"BBB", "BBB2"} in groups and e.valeur["n_lignes"] == 3


def test_replay_refuses_future_information(sdp):
    v = sdp.asof("2021-06-01")
    pf = pfm.Portfolio([pfm.Holding("AAA", 10)])
    assert pfm.ev_rejeu(v, pf, "2022").statut == "non_applicable"
    covid = pfm.ev_rejeu(v, pf, "covid_2020")
    assert covid.statut == "ok" and covid.valeur["pire_baisse_pct"] <= 0


def test_hypothetical_shock_opens_etf_and_matches_hand_computation(sdp):
    v = sdp.asof(None)
    # ETF1 holds 60 % AAA (Financials, CAD) and 40 % BBB (Information Technology, USD)
    pf = pfm.Portfolio([pfm.Holding("ETF1", 10), pfm.Holding("CRY", 1)], cash_cad=0.0)
    val = pfm.valuation(v, pf)
    w_etf = next(x["poids"] for x in val["lignes"] if x["ticker"] == "ETF1")
    w_cry = next(x["poids"] for x in val["lignes"] if x["ticker"] == "CRY")
    e = pfm.ev_choc(v, pf, "krach_techno_30")
    # krach_techno_30: tech -30 %, other equities -10 %, crypto -40 % -> ETF1 = 0.6*(-10 %) + 0.4*(-30 %) = -18 %
    expected_pct = (w_etf * (-0.18) + w_cry * (-0.40)) * 100
    assert e.statut == "ok"
    assert e.valeur["variation_pct"] == pytest.approx(expected_pct, abs=1e-6)
    assert e.valeur["lignes"]["ETF1"]["choc_pct"] == pytest.approx(-18.0, abs=1e-2)
    assert "pas une prévision" in e.note


def test_bootstrap_is_reproducible_and_ordered(sdp):
    v = sdp.asof(None)
    pf = pfm.Portfolio([pfm.Holding("AAA", 10), pfm.Holding("BBB", 20)])
    a = pfm.ev_scenarios_bootstrap(v, pf, horizon_annees=1, n=500)
    b = pfm.ev_scenarios_bootstrap(v, pf, horizon_annees=1, n=500)
    assert a.model_dump() == b.model_dump()
    q = a.valeur
    assert q["p05_pct"] <= q["p25_pct"] <= q["p75_pct"] <= q["p95_pct"]
    assert "pas une prévision" in a.note


def test_evidence_is_deterministic(sdp):
    v = sdp.asof(None)
    assert core.volatilite(v, "BBB").model_dump() == core.volatilite(v, "BBB").model_dump()
    assert core.volatilite(v, "BBB").id != core.volatilite(v, "AAA").id


def test_tool_registry_validates_calls(sdp):
    v = sdp.asof(None)
    out = tools.run_tool("volatilite", v, {"ticker": "AAA"}, window=252)
    assert out[0].mesure == "volatilite_annualisee"
    with pytest.raises(ValueError):
        tools.run_tool("volatilite", v, {"ticker": "AAA"}, window=17)
    with pytest.raises(ValueError):
        tools.run_tool("volatilite", v, {"ticker": "AAA"}, fenetre=252)
    with pytest.raises(KeyError):
        tools.run_tool("predire_prix", v, {"ticker": "AAA"})
    assert not any("predi" in t["nom"] for t in tools.catalog())


# ------------------------------------------------------------- real data (regression guards)

@pytest.mark.datapack
def test_tsla_drawdown_regression(dp):
    e = core.pire_baisse(dp.asof("2026-11-12"), "TSLA")
    assert -75 < e.valeur["baisse_pct"] < -65 and e.valeur["date_sommet"] == "2021-11-04"


@pytest.mark.datapack
def test_time_machine_evidence_never_postdates_simulation(dp):
    v = dp.asof("2021-12-15")
    pf = pfm.from_allocation(dp, 100_000, {"XIU.TO": 0.5, "TSLA": 0.2, "XBB.TO": 0.3}, "2025-01-02", as_of="2021-12-15")
    evs = []
    for name, t in tools.TOOLS.items():
        ctx = {"ticker": "TSLA", "portefeuille": pf}
        evs += tools.run_tool(name, v, ctx)
    assert evs and all(np.datetime64(e.date_de_calcul) <= np.datetime64("2021-12-15") for e in evs)
    assert all(e.periode is None or np.datetime64(e.periode.fin) <= np.datetime64("2021-12-15") for e in evs if e.statut == "ok")


@pytest.mark.datapack
def test_hype_and_regime_regressions(dp):
    from ulysse.analytics import hype, regime
    assert hype.ev_engouement(dp.asof("2024-06-20"), "NVDA").valeur["engouement"] is True
    assert hype.ev_engouement(dp.asof("2023-06-15"), "PG").valeur["engouement"] is False
    assert regime.ev_regime(dp.asof("2020-03-20")).valeur["regime"] == "tendu"
