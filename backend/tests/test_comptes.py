"""Accounts (cognito mode, Cognito stubbed): sign-in required, one account never sees another's profiles, demo accounts, erase."""
import pytest

from ulysse import compte
from ulysse.api.routes import handle

pytestmark = pytest.mark.datapack
AUJ = "2026-11-14"
JETONS = {"jeton-a": compte.Compte("u-aaaaaaaa-1", "a@example.com"), "jeton-b": compte.Compte("u-bbbbbbbb-2", "b@example.com"),
          "jeton-demo": compte.Compte("u-dddddddd-3", "robert@demo.example.com")}
PROFIL = {"nom": "Sam", "tolerance": "modere", "objectifs": [{"libelle": "Retraite", "horizon_annees": 20}], "capital_cad": 30000}


@pytest.fixture()
def cognito(tmp_path, monkeypatch):
    from ulysse.store import LocalStore, set_store
    set_store(LocalStore(tmp_path / "state"))
    monkeypatch.setenv("ULYSSE_AUTH", "cognito")
    monkeypatch.setenv("ULYSSE_COMPTES_DEMO", "1")
    monkeypatch.setenv("ULYSSE_COGNITO_CLIENT_ID", "client-public")

    def valider(j):
        if j not in JETONS:
            raise compte.NonConnecte("Session expirée : reconnecte-toi.")
        return JETONS[j]
    monkeypatch.setattr(compte, "_valider", valider)


def h(j):
    return {"x-ulysse-jeton": j}


def test_sign_in_required_except_public_market_data(cognito):
    assert handle("GET", "/api/profils")[0] == 401
    assert handle("GET", "/api/profils", {}, None, h("faux"))[0] == 401
    assert handle("GET", "/api/marche")[0] == 200
    s, cfg = handle("GET", "/api/config")
    assert s == 200 and cfg["auth"]["mode"] == "cognito" and cfg["auth"]["client_id"] == "client-public" and len(cfg["auth"]["comptes_demo"]) == 3


def test_an_account_never_sees_another_accounts_profile(cognito):
    s, d = handle("POST", "/api/profils", {}, PROFIL, h("jeton-a"))
    assert s == 200
    pid = d["profil"]["id"]
    assert [p["id"] for p in handle("GET", "/api/profils", {}, None, h("jeton-a"))[1]] == [pid]
    assert handle("GET", "/api/profils", {}, None, h("jeton-b"))[1] == []
    for method, path, body in [("GET", f"/api/profils/{pid}", None), ("GET", f"/api/profils/{pid}/positions", None),
                               ("POST", "/api/ordres/verifier", {"profil": pid, "ticker": "SPY", "montant_cad": 100}),
                               ("POST", f"/api/profils/{pid}/depot", {"montant_cad": 100})]:
        assert handle(method, path, {"as_of": AUJ}, body, h("jeton-b"))[0] == 404, path
    s, d = handle("POST", "/api/dossiers", {}, {"profil": pid, "intention": {"type": "portefeuille"}, "as_of": AUJ}, h("jeton-a"))
    assert s == 200
    assert handle("GET", f"/api/dossiers/{d['id']}", {}, None, h("jeton-b"))[0] == 404


def test_demo_account_gets_its_reference_profile_and_can_erase(cognito):
    s, lst = handle("GET", "/api/profils", {}, None, h("jeton-demo"))
    assert s == 200 and len(lst) == 1 and lst[0]["id"].startswith("robert-")
    assert handle("POST", "/api/compte/effacer", {}, {}, h("jeton-demo"))[1] == {"profils_effaces": 1}
    again = handle("GET", "/api/profils", {}, None, h("jeton-demo"))[1]      # re-created at the next request
    assert len(again) == 1 and again[0]["id"] == lst[0]["id"]


def test_global_demo_reset_is_refused_with_accounts(cognito):
    assert handle("POST", "/api/demo/reinitialiser", {}, {}, h("jeton-a"))[0] == 403


def test_guide_progress_follows_the_account(cognito):
    handle("POST", "/api/guide", {}, {"visite_faite": True, "lecon_lue": "risque"}, h("jeton-a"))
    assert handle("GET", "/api/compte", {}, None, h("jeton-a"))[1]["guide"] == {"visite_faite": True, "lecons": ["risque"]}
    assert handle("GET", "/api/compte", {}, None, h("jeton-b"))[1]["guide"] == {}


def test_local_mode_is_unchanged(tmp_path, monkeypatch):
    from ulysse import demo
    from ulysse.store import LocalStore, set_store
    st = LocalStore(tmp_path / "state")
    set_store(st)
    demo.reset(st)
    monkeypatch.delenv("ULYSSE_AUTH", raising=False)
    assert {p["id"] for p in handle("GET", "/api/profils")[1]} == {"amira", "mateo", "robert"}
    assert handle("GET", "/api/config")[1]["auth"] == {"mode": "aucune"}
