"""Versioned methodology configuration.

Every threshold used by analytics, persona rules, Guardian and governance lives here so it can be
inspected (GET /api/v1/methodology), versioned in snapshots, and changed without touching code.
Values marked `heuristic` are demonstration conventions, not regulatory rules or advice.
"""
from __future__ import annotations

import copy
import hashlib
import json

METHODOLOGY_VERSION = "1.0.0"
CALCULATION_VERSION = "aegis-calc-1.0.0"

METHODOLOGY: dict = {
    "version": METHODOLOGY_VERSION,
    "frozen_at": "2026-11-14",
    "reporting_currency": "CAD",
    "returns": {
        "price_field_for_returns": "adj_close",
        "price_field_for_valuation": "close",
        "note": "adj_close is split- and dividend-adjusted (total return). close is split-adjusted only. "
                "Split ratios in corporate_actions.csv are never re-applied (avoids double adjustment).",
        "annualization": {"business": 252, "crypto": 365},
        "max_forward_fill_days": 5,
        "fx_source": "Bank of Canada FXUSDCAD (CAD per USD); last published rate on or before each date",
        "costs": "Transaction costs, spreads, taxes and fees are omitted from every calculation and simulation.",
        "portfolio_risk_convention": "Current weights applied to historical daily CAD returns "
                                     "(implicitly rebalanced daily). Historical replay uses fixed quantities.",
    },
    "windows": {"default_lookback_days": 756, "min_obs_volatility": 60, "min_obs_correlation": 60,
                "min_obs_var": 250, "min_obs_tier": 250, "rolling_corr_window": 63, "stress_window": 63,
                "ewma_lambda": 0.94},
    "var": {"levels": [0.95, 0.99], "method": "historical simulation, 1-day horizon, no scaling",
            "caveat": "VaR says nothing about losses beyond its quantile; extreme moves are more frequent "
                      "than a normal distribution implies."},
    "risk_tiers": {
        "kind": "heuristic",
        "vol_low": 0.10, "vol_high": 0.30, "mdd_low": -0.15, "mdd_high": -0.50,
        "calibration_window": ["2021-11-12", "2024-06-28"],
        "calibration_note": "Thresholds set on the development window only and frozen before the holdout "
                            "(2024-07-02 onward) was examined. Tier = worse of the volatility tier and the "
                            "drawdown tier; single issuer, cryptoasset, leveraged or inverse => HIGH.",
    },
    "horizon_rule": {"low_below_years": 3, "medium_up_to_years": 10,
                     "tolerance_low_max": 0.15, "tolerance_medium_max": 0.35},
    "concentration": {"hhi_warning": 0.15, "hhi_critical": 0.25, "correlated_pair_threshold": 0.70,
                      "sector_warning_default": 0.35, "single_asset_warning_default": 0.20},
    "diversification": {"low_benefit_ratio": 1.15},
    "guardian": {"cooldown_days": 20, "corr_rise_threshold": 0.15, "market_vol_percentile": 0.90,
                 "stale_business_days": 5, "drift_tolerance": 0.05, "scan_step_days": 7},
    "hype": {
        "kind": "heuristic attention indicator - NOT a probability, NOT intrinsic value, NOT confidence",
        "news_baseline_days": 90, "news_recent_days": 7, "volume_baseline_days": 60,
        "dedup_jaccard": 0.55, "min_components": 2,
        "weights": {"news_volume": 0.35, "trading_volume": 0.25, "price_momentum": 0.20, "source_diversity": 0.20},
    },
    "forecast_policy": {"base_rate_window_days": 252, "base_rate_loss_threshold": -0.20},
    "valuation": {"equity_risk_premium": 0.0423, "erp_source": "Damodaran implied ERP, start of 2026 (see references)",
                  "terminal_growth": 0.025, "forecast_years": 5,
                  "kind": "explicit, configurable assumptions; never a fair-value conclusion"},
    "fundamentals": {"net_debt_ebitda_comfortable": 2.0, "net_debt_ebitda_stretched": 4.0,
                     "interest_coverage_fragile": 2.0, "altman_safe": 2.99, "altman_distress": 1.81,
                     "altman_zpp_safe": 2.6, "altman_zpp_distress": 1.1, "beneish_flag": -1.78,
                     "kind": "practitioner conventions, configurable"},
    "sharpe_overfit_flag": 1.5,
    "debate": {"max_rounds": 2, "permitted_followup_tests": [
        "stress_shock", "stressed_correlation", "rolling_correlation", "risk_contribution",
        "drawdown_episodes", "scenario_compare", "base_rates", "hypothetical_addition"]},
}


def methodology_snapshot() -> dict:
    return copy.deepcopy(METHODOLOGY)


def methodology_hash() -> str:
    return hashlib.sha256(json.dumps(METHODOLOGY, sort_keys=True).encode()).hexdigest()[:12]
