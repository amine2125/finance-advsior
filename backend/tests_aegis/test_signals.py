"""ULYSSE market signals exposed by the AEGIS API: present when the engine is there, never a crash when it is not."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.data import registry

H = {"X-AEGIS-User": "u-signals01"}


def test_market_and_asset_signals_routes(real_md, fresh_store):
    registry.reset_market_data(real_md)
    from app.main import app
    c = TestClient(app)
    r = c.get("/api/v1/market/signals", headers=H)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"climate", "attention"}
    if body["climate"] is not None:  # engine and datapack available
        assert body["climate"]["label"] in {"Calme", "Agité", "Tendu"} and "pas une prévision" in body["climate"]["source"]
        assert body["attention"] == []  # an empty account holds nothing to watch
    assert c.get("/api/v1/assets/TSLA/signals").status_code == 200
    assert c.get("/api/v1/assets/ZZZ/signals").status_code == 404
    registry.reset_market_data(None)


def test_signals_degrade_without_engine(monkeypatch):
    from app.services import market_signals as sig
    monkeypatch.setattr(sig, "_engine", lambda: None)
    assert sig.climate() is None and sig.attention(["NVDA"]) is None and sig.asset_facts("NVDA", "NVIDIA") is None


def test_precomputed_signals_serve_the_same_answers(monkeypatch, tmp_path):
    """On AWS the engine is replaced by the JSON written at build time: same sentences, no statistical engine needed."""
    from app.services import market_signals as sig
    data = {"as_of": "2026-11-14",
            "climat": {"as_of": "2026-11-14", "regime": "tendu", "semaines": 3, "probabilites_pct": {}, "methode": "m", "statut": "ok"},
            "attention": [{"asset_id": "NVDA", "inhabituel": True, "plus_inhabituel_que_pct": 99.9, "vues_x": 10.0, "volume_x": 4.0,
                           "rendement_20j_pct": -20.0}],
            "fiches": {"NVDA": {"asset_id": "NVDA", "cvar_20j_pct": -23.0, "var_20j_pct": -17.0, "vol_recente_pct": 50.0,
                                "ratio_risque_recent": 1.4, "sous_l_eau_annees": 1.5, "sous_l_eau_debut": "2021-11-29",
                                "sous_l_eau_fin": "2023-05-18", "sous_l_eau_termine": True, "attention": None}}}
    monkeypatch.setattr(sig, "_engine", lambda: sig._Precomputed(data))
    assert sig.climate()["label"] == "Tendu" and sig.climate()["since"] == "depuis 3 semaines"
    assert "attention inhabituelle" in sig.attention(["NVDA"])[0]["text"] and sig.attention(["TSLA"]) == []
    assert sig.asset_facts("NVDA", "NVIDIA")["underwater_years"] == 1.5
