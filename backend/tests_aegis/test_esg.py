"""ESG preference (énoncé p. 6, Mateo): a sector screen from a published index rule, never a hidden rating."""
from app.analytics.persona_rules import esg_conflict
from app.methodology import METHODOLOGY
from app.services.diagnosis import diagnose

from .fixtures import REFERENCE_PERSONAS

AMIRA, MATEO, _ = REFERENCE_PERSONAS
XOM = {"asset_id": "XOM", "name": "Exxon Mobil", "asset_class": "equity", "sector": "Energy"}
FTS = {"asset_id": "FTS.TO", "name": "Fortis", "asset_class": "equity", "sector": "Utilities"}
XIU = {"asset_id": "XIU.TO", "name": "iShares S&P/TSX 60", "asset_class": "etf_equity", "sector": "Broad market (Canada)"}


def test_screen_is_sourced():
    cfg = METHODOLOGY["esg_screen"]
    assert cfg["source_url"].startswith("https://www.sec.gov/") and cfg["limits"]


def test_fossil_fuel_stock_fails_only_when_esg_was_asked():
    why = esg_conflict(MATEO, XOM)
    assert why and "Exxon Mobil" in why and "pas une note ESG" in why
    assert esg_conflict(AMIRA, XOM) is None          # no ESG preference: the screen does not apply


def test_screen_leaves_other_sectors_and_funds_alone():
    assert esg_conflict(MATEO, FTS) is None
    assert esg_conflict(MATEO, XIU) is None          # funds are not screened by this single-stock rule


def test_diagnosis_reports_esg_conflict_with_its_limits():
    xr = {"positions": [XOM | {"weight": 0.05}, XIU | {"weight": 0.95}], "persona_assessment": {"budget_checks": []}}
    d = diagnose(xr, MATEO)
    esg = [p for p in d["problems"] if p["rule_id"] == "esg.screen"]
    assert len(esg) == 1 and "Exxon Mobil" in esg[0]["detail"] and "controverses" in esg[0]["detail"]
    assert d["fits"] and "point ESG" in d["headline"]   # a warning, not a breach of the risk profile
    assert not [p for p in diagnose(xr, AMIRA)["problems"] if p["rule_id"] == "esg.screen"]
