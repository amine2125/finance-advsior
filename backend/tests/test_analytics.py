"""Phase 2: analysis tools. Synthetic cases checked by hand + regression guards on real data."""
import math

import numpy as np
import pytest

from tests import synthetic
from ulysse.analytics import core
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


def test_evidence_is_deterministic(sdp):
    v = sdp.asof(None)
    assert core.volatilite(v, "BBB").model_dump() == core.volatilite(v, "BBB").model_dump()
    assert core.volatilite(v, "BBB").id != core.volatilite(v, "AAA").id


@pytest.mark.datapack
def test_tsla_drawdown_regression(dp):
    e = core.pire_baisse(dp.asof("2026-11-12"), "TSLA")
    assert -75 < e.valeur["baisse_pct"] < -65 and e.valeur["date_sommet"] == "2021-11-04"


@pytest.mark.datapack
def test_hype_and_regime_regressions(dp):
    from ulysse.analytics import hype, regime
    assert hype.ev_engouement(dp.asof("2024-06-20"), "NVDA").valeur["engouement"] is True
    assert hype.ev_engouement(dp.asof("2023-06-15"), "PG").valeur["engouement"] is False
    assert regime.ev_regime(dp.asof("2020-03-20")).valeur["regime"] == "tendu"


@pytest.mark.datapack
def test_signals_bridge_on_real_data(dp):
    """The three ULYSSE signals shown in AEGIS: market climate, unusual attention, extra risk facts."""
    from ulysse import signaux
    c = signaux.climat("2020-03-20")
    assert c["regime"] == "tendu" and c["semaines"] >= 1
    att = {r["asset_id"]: r for r in signaux.attention("2024-06-20")}
    assert att["NVDA"]["inhabituel"] is True and att["PG"]["inhabituel"] is False
    f = signaux.fiche("TSLA", "2026-11-14")
    assert f["cvar_20j_pct"] < f["var_20j_pct"] < 0 and f["sous_l_eau_annees"] > 1
    assert signaux.fiche("XBB.TO")["attention"] is None  # funds: no attention signal
