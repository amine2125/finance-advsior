"""Routes added for the interface: questionnaire update on the same profile, value history, decision linked to its dossier."""
import pytest

from ulysse.api.routes import handle

AUJ = "2026-11-14"
pytestmark = pytest.mark.datapack

REPONSES = {
    "nom": "Sarah", "age": 31, "tolerance": "modere", "capital_cad": 10000, "allocation": {"CASH": 1.0},
    "objectifs": [{"libelle": "Faire croître à long terme", "horizon_annees": 20, "part_pct": 100}],
    "kyc": {"baisse_max_pct": 30, "reaction_baisse": "attendre", "ressenti": "serein", "revenu_mensuel": 5000, "depenses_mensuelles": 3000,
            "epargne_cad": 20000, "connaissances_declarees": "bonnes", "quiz_diversification": "b", "quiz_obligations": "a",
            "quiz_inflation": "c", "produits_detenus": ["fnb", "actions", "epargne"]},
    "questionnaire": {"display_name": "Sarah", "objective": "growth"},
}


@pytest.fixture()
def store(tmp_path):
    from ulysse import demo
    from ulysse.store import LocalStore, set_store
    st = LocalStore(tmp_path / "state")
    set_store(st)
    demo.reset(st)
    return st


def _creer():
    s, d = handle("POST", "/api/profils", {"as_of": AUJ}, REPONSES)
    assert s == 200, d
    return d["profil"]["id"]


def test_new_profile_keeps_the_raw_answers_and_starts_with_cash_only(store):
    pid = _creer()
    s, p = handle("GET", f"/api/profils/{pid}", {"as_of": AUJ})
    assert s == 200 and p["profil"]["questionnaire"] == REPONSES["questionnaire"]
    s, pos = handle("GET", f"/api/profils/{pid}/positions", {"as_of": AUJ})
    assert s == 200 and pos["lignes"] == [] and pos["liquidites_cad"] == pytest.approx(10000)


def test_questionnaire_update_rebuilds_the_same_profile_and_keeps_holdings_and_hand_made_rules(store):
    pid = _creer()
    assert handle("POST", "/api/ordres/decision", {}, {"profil": pid, "ticker": "XBB.TO", "montant_cad": 2000, "as_of": AUJ,
                                                       "choix": "confirmer", "ordre_id": "o-1"})[0] == 200
    s, c = handle("POST", f"/api/profils/{pid}/regles/C-CONCENTRATION-TITRE", {"as_of": AUJ}, {"parametres": {"max_pct": 7}})
    assert s == 200
    prudent = {**REPONSES, "kyc": {**REPONSES["kyc"], "reaction_baisse": "vendre_tout"}, "questionnaire": {"objective": "preserve"}}
    s, d = handle("POST", f"/api/profils/{pid}/questionnaire", {"as_of": AUJ}, prudent)
    assert s == 200, d
    assert d["profil"]["id"] == pid and d["profil"]["tolerance"] == "faible"
    assert d["profil"]["questionnaire"] == {"objective": "preserve"}
    assert d["contrat"]["version"] == c["contrat"]["version"] + 1
    assert d["contrat"]["historique"][-1]["clause"] == "questionnaire"
    regle = next(x for x in d["contrat"]["clauses"] if x["id"] == "C-CONCENTRATION-TITRE")
    assert regle["parametres"]["max_pct"] == 7 and regle["origine"] == "dit"
    s, pos = handle("GET", f"/api/profils/{pid}/positions", {"as_of": AUJ})
    assert [x["ticker"] for x in pos["lignes"]] == ["XBB.TO"] and pos["liquidites_cad"] == pytest.approx(8000)
    assert handle("POST", "/api/profils/inconnu/questionnaire", {"as_of": AUJ}, prudent)[0] == 404


def test_history_values_the_portfolio_and_leaves_deposits_out_of_the_change(store, dp):
    s, h = handle("GET", "/api/profils/robert/historique", {"as_of": AUJ, "jours": "90"})
    assert s == 200, h
    s2, pos = handle("GET", "/api/profils/robert/positions", {"as_of": AUJ})
    assert h["serie"][-1]["valeur_cad"] == pytest.approx(pos["total_cad"], rel=1e-6)
    assert h["serie"][0]["date"] >= "2026-08-16" and h["serie"][-1]["date"] <= AUJ
    avant = h["variation_cad"]
    handle("POST", "/api/profils/robert/depot", {}, {"montant_cad": 5000, "as_of": AUJ})
    s, h2 = handle("GET", "/api/profils/robert/historique", {"as_of": AUJ, "jours": "90"})
    assert h2["serie"][-1]["valeur_cad"] == pytest.approx(pos["total_cad"] + 5000, rel=1e-6)
    assert h2["variation_cad"] == pytest.approx(avant, abs=0.05)
    assert handle("GET", "/api/profils/robert/historique", {"as_of": AUJ, "jours": "0"})[0] == 400


def test_decision_is_linked_to_its_dossier_in_the_journal(store):
    body = {"profil": "robert", "ticker": "XBB.TO", "montant_cad": 1000, "as_of": AUJ, "choix": "renoncer", "dossier": "D-123"}
    assert handle("POST", "/api/ordres/decision", {}, body)[0] == 200
    s, j = handle("GET", "/api/profils/robert/journal")
    d = next(e for e in j["entrees"] if e["type"] == "decision")
    assert d["dossier"] == "D-123" and d["execute"] is False
