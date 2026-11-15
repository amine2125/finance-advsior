"""Unit tests for deterministic analytics (synthetic fixtures)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from app.analytics import portfolio as P
from app.analytics import risk as R
from app.analytics import trend as T
from app.analytics.persona_rules import allowed_tier, budget_checks, horizon_tier, tolerance_tier
from app.analytics.scenarios import apply_shock, historical_replay, position_size_table
from app.analytics.tiers import classify_risk_tier, tier_from_stats
from app.analytics.valuation import dcf_value, implied_growth, sensitivity_grid
from app.data.loader import DataUnavailableError
from app.models import RiskTier
from tests_aegis.fixtures import REFERENCE_PERSONAS

AMIRA, MATEO, ROBERT = REFERENCE_PERSONAS


def test_valuation_weights_and_fx(md):
    as_of = md.end_date
    df = P.value_holdings(md, [{"asset_id": "AAA", "quantity": 10}, {"asset_id": "BBB.TO", "quantity": 20}], as_of)
    px_a, d_a = md.last_price("AAA", as_of)
    fx, _ = md.fx_rate(d_a)
    assert df.loc["AAA", "value_cad"] == pytest.approx(10 * px_a * fx)
    px_b, _ = md.last_price("BBB.TO", as_of)
    assert df.loc["BBB.TO", "value_cad"] == pytest.approx(20 * px_b)  # CAD asset: no FX
    assert df["weight"].sum() == pytest.approx(1.0)
    assert df.loc["AAA", "weight"] == pytest.approx(df.loc["AAA", "value_cad"] / df["value_cad"].sum())


def test_duplicate_lines_are_aggregated(md):
    df = P.value_holdings(md, [{"asset_id": "AAA", "quantity": 1}, {"asset_id": "AAA", "quantity": 2}], md.end_date)
    assert df.loc["AAA", "quantity"] == 3 and df.loc["AAA", "lines"] == 2


def test_quantities_from_amounts_round_trip(md):
    q = P.quantities_from_amounts(md, [{"asset_id": "AAA", "amount_cad": 3000}, {"asset_id": "BBB.TO", "amount_cad": 7000}], md.end_date)
    df = P.value_holdings(md, q, md.end_date)
    assert df["value_cad"].sum() == pytest.approx(10000)
    assert df.loc["AAA", "weight"] == pytest.approx(0.30)


def test_missing_price_raises_not_fabricated(md):
    with pytest.raises(DataUnavailableError):
        md.last_price("SHORT", pd.Timestamp("2022-01-10"))
    with pytest.raises(DataUnavailableError):
        md.asset("ZZZ")


def test_non_overlapping_calendars_crypto_and_holiday(md):
    panel, cal = md.cad_panel(["BBB.TO", "CRY-USD"])
    assert cal == "business"
    assert panel.index.dayofweek.max() <= 4  # crypto sampled on the business calendar
    assert panel["BBB.TO"].isna().sum() == 0  # Canadian holiday forward-filled (limit 5 days)
    crypto_only, cal2 = md.cad_panel(["CRY-USD"])
    assert cal2 == "crypto" and crypto_only.index.dayofweek.max() == 6


def test_annualization_252_vs_365(md):
    assert md.periods_per_year("AAA") == 252
    assert md.periods_per_year("CRY-USD") == 365
    r = pd.Series([0.01, -0.01] * 50)
    assert R.annualized_vol(r, 252) == pytest.approx(r.std(ddof=1) * math.sqrt(252))
    assert R.annualized_vol(r, 365) == pytest.approx(r.std(ddof=1) * math.sqrt(365))


def test_drawdown_and_recovery():
    v = pd.Series([100, 120, 90, 60, 130], index=pd.date_range("2024-01-01", periods=5))
    dd = R.max_drawdown(v)
    assert dd["max_drawdown"] == pytest.approx(60 / 120 - 1)
    assert dd["peak_date"] == "2024-01-02" and dd["trough_date"] == "2024-01-04" and dd["recovery_date"] == "2024-01-05"
    assert R.recovery_gain_needed(-0.2) == pytest.approx(0.25)
    assert R.recovery_gain_needed(-0.5) == pytest.approx(1.0)
    assert R.recovery_gain_needed(-0.8) == pytest.approx(4.0)


def test_var_cvar_and_min_sample():
    r = pd.Series(np.linspace(-0.05, 0.05, 300))
    v = R.historical_var_cvar(r, 0.95, 250)
    q = np.quantile(r, 0.05)
    assert v["var"] == pytest.approx(-q)
    assert v["cvar"] == pytest.approx(-r[r <= q].mean())
    assert R.historical_var_cvar(r.iloc[:100], 0.95, 250) is None  # suppressed, not approximated


def test_correlation_hhi_effective_n():
    assert P.hhi({"a": 0.5, "b": 0.5}) == pytest.approx(0.5)
    assert 1 / P.hhi({"a": 0.25, "b": 0.25, "c": 0.25, "d": 0.25}) == pytest.approx(4)
    rets = pd.DataFrame({"a": [0.01, 0.02, -0.01, 0.0] * 20, "b": [0.01, 0.02, -0.01, 0.0] * 20})
    c = P.correlation_matrix(rets, 60)
    assert c.loc["a", "b"] == pytest.approx(1.0)
    assert P.correlation_matrix(rets.iloc[:30], 60).isna().values[0, 1]  # insufficient overlap -> NaN, not a number


def test_diversification_ratio_and_risk_contributions():
    rng = np.random.default_rng(0)
    rets = pd.DataFrame(rng.normal(0, 0.01, (500, 3)), columns=list("abc"))
    w = {"a": 0.5, "b": 0.3, "c": 0.2}
    d = P.risk_decomposition(rets, w, 252)
    assert sum(d["contributions"].values()) == pytest.approx(1.0)
    assert d["diversification_ratio"] > 1.0
    same = pd.DataFrame({"a": rets["a"], "b": rets["a"]})
    assert P.risk_decomposition(same, {"a": 0.5, "b": 0.5}, 252)["diversification_ratio"] == pytest.approx(1.0)


def test_stressed_correlation_reports_window():
    rng = np.random.default_rng(1)
    rets = pd.DataFrame(rng.normal(0.0005, 0.01, (400, 2)), columns=["a", "b"], index=pd.bdate_range("2023-01-02", periods=400))
    common = rng.normal(-0.01, 0.01, 63)  # synthetic common shock: both assets fall together
    rets.iloc[200:263] = np.column_stack([common, common]) + rng.normal(0, 0.001, (63, 2))
    st = P.stressed_correlation(rets, {"a": 0.5, "b": 0.5}, 252, 63)
    assert st["window_start"] <= rets.index[262].date().isoformat()
    assert st["avg_corr_stressed"] > st["avg_corr_normal"]
    assert "pas une prévision" in st["label"]


def test_sector_weights_and_portfolio_metrics(md):
    df = P.value_holdings(md, [{"asset_id": "AAA", "quantity": 50}, {"asset_id": "ETF1", "quantity": 50}, {"asset_id": "BND.TO", "quantity": 50}],
                          md.end_date)
    ex = P.exposures(df)
    assert sum(ex["sector"].values()) == pytest.approx(1.0)
    assert ex["sector"]["Information Technology"] == pytest.approx(df.loc["AAA", "weight"])
    w = {a: float(df.loc[a, "weight"]) for a in df.index}
    m = P.portfolio_risk_metrics(md, w, md.end_date, 252, None)
    assert m["n_obs"] == 252 and m["volatility"] > 0 and m["drawdown"]["max_drawdown"] <= 0


def test_ewma_momentum_rsi_ma_volume():
    idx = pd.bdate_range("2022-01-03", periods=400)
    p = pd.Series(np.linspace(100, 200, 400), index=idx)
    assert T.momentum_12_1(p) == pytest.approx(p.iloc[-22] / p.iloc[-253] - 1)
    ma = T.moving_average_state(p)
    assert ma["above_ma200"] and not ma["falling_knife_caution"]
    assert T.rsi(p) == pytest.approx(100.0)
    down = pd.Series(np.linspace(200, 100, 400), index=idx)
    assert T.moving_average_state(down)["falling_knife_caution"]
    vol = pd.Series([100.0] * 60 + [0.0] * 3 + [100.0, 110, 90, 105, 95] + [300.0] * 5, index=pd.bdate_range("2024-01-01", periods=73))
    z = T.volume_zscore(vol)
    assert z["zero_volume_excluded"] == 3 and z["zscore"] > 2
    r = pd.Series(np.r_[np.full(100, 0.001), np.full(50, 0.03) * np.resize([1, -1], 50)])
    assert R.ewma_vol(r, 252) > R.annualized_vol(r.iloc[:100], 252)


def test_risk_tiers_rules(md):
    assert tier_from_stats(0.05, -0.05, 400, single_issuer=True, crypto=False)["tier"] == RiskTier.HIGH  # single stock never LOW
    assert tier_from_stats(0.05, -0.05, 400, single_issuer=False, crypto=False)["tier"] == RiskTier.LOW
    assert tier_from_stats(0.05, -0.17, 400, single_issuer=False, crypto=False)["tier"] == RiskTier.MEDIUM  # bonds: data sets the tier
    assert tier_from_stats(0.05, -0.05, 400, single_issuer=False, crypto=False, leveraged=True)["tier"] == RiskTier.HIGH
    assert classify_risk_tier(md, "SHORT")["tier"] == "UNKNOWN"  # short history -> UNKNOWN, never LOW
    assert classify_risk_tier(md, "CRY-USD")["tier"] == "HIGH"
    t = classify_risk_tier(md, "ETF1", "2022-06-30")
    assert t["window_end"] <= "2022-06-30"  # point in time


def test_horizon_rule_min_and_binding():
    assert horizon_tier(2) == RiskTier.LOW and horizon_tier(5) == RiskTier.MEDIUM and horizon_tier(15) == RiskTier.HIGH
    assert tolerance_tier(0.10) == RiskTier.LOW and tolerance_tier(0.25) == RiskTier.MEDIUM and tolerance_tier(0.40) == RiskTier.HIGH
    a = allowed_tier(AMIRA)
    assert a["allowed_tier"] == RiskTier.HIGH
    short_goal = AMIRA.model_copy(update={"horizon_years_min": 2})
    s = allowed_tier(short_goal)
    assert s["allowed_tier"] == RiskTier.LOW and s["binding_inputs"] == ["horizon"]  # 26-year-old, 2-year goal => LOW
    r = allowed_tier(ROBERT)
    assert r["allowed_tier"] == RiskTier.MEDIUM and "horizon" in r["binding_inputs"]
    missing = ROBERT.model_copy(update={"stable_income": None, "emergency_reserve": None, "liquidity_needs": None})
    assert any("capacité" in u for u in allowed_tier(missing)["uncertainties"])


def test_same_portfolio_different_budget_breaches():
    weights = {"NVDA": 0.30, "MSFT": 0.25, "QQQ": 0.25, "SPY": 0.20}
    meta = {"NVDA": {"asset_class": "equity", "sub_class": "common_stock", "sector": "Information Technology", "is_single_issuer": True},
            "MSFT": {"asset_class": "equity", "sub_class": "common_stock", "sector": "Information Technology", "is_single_issuer": True},
            "QQQ": {"asset_class": "etf", "sub_class": "equity_etf", "sector": "Diversified", "is_single_issuer": False},
            "SPY": {"asset_class": "etf", "sub_class": "equity_etf", "sector": "Diversified", "is_single_issuer": False}}
    a = {c.rule_id: c.status for c in budget_checks(AMIRA, weights, meta, -0.255)}
    r = {c.rule_id: c.status for c in budget_checks(ROBERT, weights, meta, -0.255)}
    assert a["budget.drawdown_review"] == "OK" and r["budget.drawdown_review"] == "BREACH"
    assert a != r


def test_shock_and_position_size(md):
    df = P.value_holdings(md, [{"asset_id": "AAA", "quantity": 10}, {"asset_id": "BND.TO", "quantity": 10}], md.end_date)
    res = apply_shock(md, df, {"sector:Information Technology": -0.30, "sub_class:bond_etf": 0.02})
    exp = df.loc["AAA", "value_cad"] * 0.7 + df.loc["BND.TO", "value_cad"] * 1.02
    assert res["value_after"] == pytest.approx(exp)
    fx = apply_shock(md, df, {"fx:USDCAD": -0.10})
    assert fx["value_after"] == pytest.approx(df.loc["AAA", "value_cad"] * 0.9 + df.loc["BND.TO", "value_cad"])
    rows = position_size_table(20000, 0.01, [0.15, 0.30])
    assert rows[0]["position_cad"] == pytest.approx(1333.33, abs=0.01)
    assert rows[1]["position_cad"] == pytest.approx(rows[0]["position_cad"] / 2)  # doubling volatility halves the size


def test_historical_replay_uses_start_prices(md):
    res = historical_replay(md, {"AAA": 0.5, "BBB.TO": 0.5}, "2022-06-01", "2022-12-30", 10000)
    assert res["initial_value"] == 10000 and res["start"] >= "2022-06-01"


def test_dcf_fixture_8a3():
    v = dcf_value(100, 0.10, 5, 0.09, 0.025, 200, 40)
    assert v["pv_explicit"] == pytest.approx(513.9, abs=0.1)
    assert v["pv_terminal"] == pytest.approx(1650.6, abs=0.1)
    assert v["enterprise_value"] == pytest.approx(2164.5, abs=0.1)
    assert v["terminal_share"] == pytest.approx(0.763, abs=0.001)
    assert v["value_per_share"] == pytest.approx(49.11, abs=0.01)
    grid = sensitivity_grid(100, 0.10, 5, [0.08, 0.09, 0.10], [0.02, 0.025, 0.03], 200, 40)
    expected = [[54.8, 59.3, 64.7], [46.0, 49.1, 52.8], [39.4, 41.7, 44.3]]
    for row, exp in zip(grid, expected):
        vals = [row["g=0.02"], row["g=0.025"], row["g=0.03"]]
        for a, b in zip(vals, exp):
            assert a == pytest.approx(b, abs=0.1)
    for price, g in ((40, 0.056), (60, 0.145), (80, 0.214)):
        assert implied_growth(price, 100, 5, 0.09, 0.025, 200, 40) == pytest.approx(g, abs=0.001)
