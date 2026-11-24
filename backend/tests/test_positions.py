"""Editable portfolio and simulated cash: applied orders, sales, deposits, manual entry, CSV, simulated connection, time machine."""
import pytest

from ulysse.api.routes import handle

AUJ = "2026-11-14"
pytestmark = pytest.mark.datapack


@pytest.fixture()
def store(tmp_path):
    from ulysse import demo
    from ulysse.store import LocalStore, set_store
    st = LocalStore(tmp_path / "state")
    set_store(st)
    demo.reset(st)
    return st


def _pos(pid="robert", as_of=AUJ):
    s, d = handle("GET", f"/api/profils/{pid}/positions", {"as_of": as_of})
    assert s == 200, d
    return d


def test_untouched_portfolio_equals_the_fictitious_allocation(store, dp):
    from ulysse.analytics import portfolio as pfm
    from ulysse.contract.schema import Profil
    prof = Profil(**store.get("profils", "robert"))
    a = prof.allocation
    ref = pfm.valuation(dp.asof(AUJ), pfm.from_allocation(dp, a.capital_cad, a.poids, a.constitue_le, as_of=AUJ))
    assert _pos()["total_cad"] == pytest.approx(ref["total_cad"])


def test_confirmed_order_is_applied_once_and_paid_with_cash(store):
    avant = _pos()
    cash0 = avant["liquidites_cad"]
    body = {"profil": "robert", "ticker": "XBB.TO", "montant_cad": 1000, "as_of": AUJ, "choix": "confirmer", "niveau": "ok", "ordre_id": "o-1"}
    s, d = handle("POST", "/api/ordres/decision", {}, body)
    assert s == 200 and d["execute"] and d["liquidites_cad"] == pytest.approx(cash0 - 1000)
    s, d = handle("POST", "/api/ordres/decision", {}, body)          # double click: not applied twice
    assert s == 200 and d["liquidites_cad"] == pytest.approx(cash0 - 1000)
    apres = _pos()
    assert apres["total_cad"] == pytest.approx(avant["total_cad"], rel=1e-6)   # cash became XBB at today's close
    journal = handle("GET", "/api/profils/robert/journal")[1]["entrees"]
    assert sum(1 for e in journal if e["type"] == "decision" and e.get("execute")) == 1


def test_other_choices_are_only_logged(store):
    cash0 = _pos()["liquidites_cad"]
    s, d = handle("POST", "/api/ordres/decision", {}, {"profil": "robert", "ticker": "NVDA", "montant_cad": 5000, "as_of": AUJ,
                                                      "choix": "revenir", "niveau": "pause"})
    assert s == 200 and not d["execute"] and _pos()["liquidites_cad"] == pytest.approx(cash0)


def test_purchase_beyond_cash_is_refused(store):
    cash0 = _pos()["liquidites_cad"]
    s, d = handle("POST", "/api/ordres/decision", {}, {"profil": "robert", "ticker": "SPY", "montant_cad": cash0 + 10_000, "as_of": AUJ,
                                                      "choix": "continuer", "niveau": "pause"})
    assert s == 409 and "insuffisantes" in d["erreur"]
    assert _pos()["liquidites_cad"] == pytest.approx(cash0)


def test_deposit_then_sale_moves_cash(store):
    cash0 = _pos()["liquidites_cad"]
    assert handle("POST", "/api/profils/robert/depot", {}, {"montant_cad": 2500, "as_of": AUJ})[0] == 200
    ligne = _pos()["lignes"][0]
    s, d = handle("POST", "/api/profils/robert/vente", {}, {"ticker": ligne["ticker"], "tout": True, "as_of": AUJ})
    assert s == 200
    p = _pos()
    assert ligne["ticker"] not in {x["ticker"] for x in p["lignes"]}
    assert p["liquidites_cad"] == pytest.approx(cash0 + 2500 + ligne["valeur_cad"], rel=1e-6)
    s, d = handle("POST", "/api/profils/robert/vente", {}, {"ticker": ligne["ticker"], "montant_cad": 10, "as_of": AUJ})
    assert s == 409                                                    # nothing left to sell


def test_no_operation_dated_before_a_later_one(store):
    handle("POST", "/api/profils/robert/depot", {}, {"montant_cad": 100, "as_of": AUJ})
    s, d = handle("POST", "/api/profils/robert/depot", {}, {"montant_cad": 100, "as_of": "2024-01-02"})
    assert s == 400 and "avant" in d["erreur"]


def test_time_machine_ignores_later_operations(store):
    past = _pos(as_of="2025-06-02")
    handle("POST", "/api/profils/robert/depot", {}, {"montant_cad": 5000, "as_of": AUJ})
    assert _pos(as_of="2025-06-02")["total_cad"] == pytest.approx(past["total_cad"])


def test_manual_entry_and_csv(store):
    s, d = handle("POST", "/api/profils/robert/positions", {}, {"lignes": [{"ticker": "XBB.TO", "montant_cad": 6000}, {"ticker": "spy", "quantite": 3}],
                                                               "liquidites_cad": 1000, "as_of": AUJ})
    assert s == 200 and {x["ticker"] for x in d["lignes"]} == {"XBB.TO", "SPY"} and d["liquidites_cad"] == pytest.approx(1000)
    s, d = handle("POST", "/api/profils/robert/positions", {}, {"csv": "ticker,montant_cad\nXIU.TO,4000\nGLD,1000\n", "as_of": AUJ})
    assert s == 200 and {x["ticker"] for x in d["lignes"]} == {"XIU.TO", "GLD"}
    s, d = handle("POST", "/api/profils/robert/positions", {}, {"lignes": [{"ticker": "ZZZZ", "quantite": 1}], "as_of": AUJ})
    assert s == 400 and "couvert" in d["erreur"]


def test_simulated_connection_is_deterministic_and_dated(store):
    a1 = handle("GET", "/api/profils/robert/connexions/bnc", {"as_of": AUJ})[1]
    a2 = handle("GET", "/api/profils/robert/connexions/bnc", {"as_of": AUJ})[1]
    assert a1 == a2 and a1["comptes"] and a1["mode"] == "simulation"
    ids = [c["id"] for c in a1["comptes"]]
    s, d = handle("POST", "/api/profils/robert/connexions/bnc", {}, {"comptes": ids[:1], "as_of": AUJ})
    assert s == 200 and d["origine"] == "connexion:bnc" and all(x["cout_cad"] for x in d["lignes"])
    early = _pos(as_of="2022-03-01")                                   # purchases after that date are not shown
    assert early["total_cad"] < d["total_cad"]


def test_dossier_and_signal_use_the_changed_portfolio(store):
    from ulysse.contract.schema import Profil
    from ulysse.positions import portefeuille
    handle("POST", "/api/profils/robert/positions", {}, {"lignes": [{"ticker": "XBB.TO", "montant_cad": 9000}], "liquidites_cad": 1000, "as_of": AUJ})
    pf = portefeuille(Profil(**store.get("profils", "robert")), AUJ)
    assert [h.ticker for h in pf.holdings] == ["XBB.TO"] and pf.cash_cad == pytest.approx(1000)
