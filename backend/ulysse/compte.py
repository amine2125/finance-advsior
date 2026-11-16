"""Accounts: who is calling, and which profiles they may see.

Two modes (ULYSSE_AUTH):
  aucune   local demo and tests: no sign-in, every profile is visible (unchanged behaviour).
  cognito  Amazon Cognito accounts. The browser talks to Cognito directly (passwords never reach this server) and sends
           its short-lived ACCESS token in the `x-ulysse-jeton` header (not `Authorization`: CloudFront signs the request
           to the Lambda function URL with it, OAC). The token is validated by Cognito itself (GetUser), so a forged,
           expired or revoked token is refused. Each account only sees the profiles it created.

Index of an account (store kind "comptes", key = "u-" + Cognito sub): {email, profils: [...], guide: {...}}.
Demo accounts for the jury (ULYSSE_COMPTES_DEMO=1): signing in with one of them creates its reference profile the first
time (or after « Effacer mes données »). Simulation only: no real client data (PDF p. 14).
"""
from __future__ import annotations

import contextvars
import hashlib
import os
import threading
import time
from dataclasses import dataclass

from ulysse.store import get_store, now_iso


@dataclass(frozen=True)
class Compte:
    id: str
    email: str | None


class NonConnecte(Exception):
    pass


_courant: contextvars.ContextVar[Compte | None] = contextvars.ContextVar("compte", default=None)
_cache: dict[str, tuple[float, Compte]] = {}
_lock = threading.Lock()
CACHE_S = 300
KINDS_PAR_PROFIL = ("profils", "contrats", "journal", "notifications", "surveillance", "positions", "visites", "vigie_plans")

DEMO_MOT_DE_PASSE_DEFAUT = "UlysseDemo2026!"


def _demo() -> dict:
    from ulysse.personas import COMPTES_DEMO   # persona names live only in the personas package (PDF p. 4)
    return COMPTES_DEMO


def mode() -> str:
    m = os.environ.get("ULYSSE_AUTH", "aucune")
    if m not in ("aucune", "cognito"):
        raise ValueError("ULYSSE_AUTH doit valoir « aucune » ou « cognito »")
    return m


def config_publique() -> dict:
    """What the sign-in page needs (no secret: a Cognito pool id and public app client id are meant to be public)."""
    if mode() != "cognito":
        return {"mode": "aucune"}
    demo = os.environ.get("ULYSSE_COMPTES_DEMO") == "1"
    mdp = os.environ.get("ULYSSE_DEMO_MOT_DE_PASSE", DEMO_MOT_DE_PASSE_DEFAUT)
    return {"mode": "cognito", "region": os.environ.get("ULYSSE_COGNITO_REGION") or os.environ.get("AWS_REGION", "ca-central-1"),
            "client_id": os.environ.get("ULYSSE_COGNITO_CLIENT_ID"),
            "comptes_demo": [{"email": e, "nom": n, "description": d, "mot_de_passe": mdp} for e, (_p, n, d) in _demo().items()] if demo else []}


def _valider(jeton: str) -> Compte:
    cle = hashlib.sha256(jeton.encode()).hexdigest()
    now = time.time()
    hit = _cache.get(cle)
    if hit and hit[0] > now:
        return hit[1]
    import boto3
    from botocore.exceptions import ClientError
    region = os.environ.get("ULYSSE_COGNITO_REGION") or os.environ.get("AWS_REGION", "ca-central-1")
    try:
        r = boto3.client("cognito-idp", region_name=region).get_user(AccessToken=jeton)
    except ClientError as e:
        raise NonConnecte("Session expirée : reconnecte-toi.") from e
    attrs = {a["Name"]: a["Value"] for a in r.get("UserAttributes", [])}
    c = Compte(id="u-" + attrs.get("sub", r["Username"]).lower(), email=(attrs.get("email") or "").lower() or None)
    with _lock:
        if len(_cache) > 5000:
            _cache.clear()
        _cache[cle] = (now + CACHE_S, c)
    return c


def identifier(headers: dict | None) -> Compte | None:
    if mode() != "cognito":
        return None
    jeton = {k.lower(): v for k, v in (headers or {}).items()}.get("x-ulysse-jeton", "").strip()
    if not jeton:
        raise NonConnecte("Connecte-toi pour continuer.")
    c = _valider(jeton)
    preparer(c)
    return c


def entrer(c: Compte | None):
    return _courant.set(c)


def sortir(tok) -> None:
    _courant.reset(tok)


def courant() -> Compte | None:
    return _courant.get()


# ------------------------------------------------------------------------------------------------ profiles of an account

def _index(c: Compte) -> dict:
    return get_store().get("comptes", c.id) or {"email": c.email, "profils": [], "guide": {}, "cree_le": now_iso()}


def profils_visibles() -> list[str] | None:
    """None = no restriction (local mode)."""
    c = courant()
    if mode() != "cognito" or c is None:
        return None
    return list(_index(c)["profils"])


def peut_voir(pid: str) -> bool:
    vis = profils_visibles()
    return vis is None or pid in vis


def ajouter_profil(pid: str) -> None:
    c = courant()
    if mode() != "cognito" or c is None:
        return
    idx = _index(c)
    if pid not in idx["profils"]:
        idx["profils"].append(pid)
    get_store().put("comptes", c.id, idx)


def preparer(c: Compte) -> None:
    """First request of an account: create its index; a demo account gets its reference profile."""
    st = get_store()
    idx = st.get("comptes", c.id)
    if idx is not None and idx.get("profils"):
        return
    idx = idx or {"email": c.email, "profils": [], "guide": {}, "cree_le": now_iso()}
    demo = _demo().get(c.email or "") if os.environ.get("ULYSSE_COMPTES_DEMO") == "1" else None
    if demo:
        from ulysse.personas import LISTES_SURVEILLANCE, REPONSES
        from ulysse.contract.defaults import construire
        persona = demo[0]
        pid = f"{persona}-{c.id[2:10]}"
        prof, con = construire(REPONSES[persona], pid)
        st.put("profils", pid, prof.model_dump())
        st.put("contrats", pid, con.model_dump())
        st.put("contrats_versions", f"{pid}-v{con.version}", con.model_dump())
        st.put("surveillance", pid, LISTES_SURVEILLANCE.get(persona, []))
        st.append("journal", pid, {"type": "contrat", "a": now_iso(), "version": con.version, "message": "Contrat créé (compte de démonstration)."})
        idx["profils"] = [pid]
    st.put("comptes", c.id, idx)


def guide() -> dict:
    c = courant()
    if c is None:
        return get_store().get("guide", "local", {}) or {}
    return _index(c).get("guide", {})


def maj_guide(g: dict) -> dict:
    c = courant()
    if c is None:
        get_store().put("guide", "local", g)
        return g
    idx = _index(c)
    idx["guide"] = g
    get_store().put("comptes", c.id, idx)
    return g


def effacer() -> int:
    """« Effacer mes données »: every record of the account's profiles, then the index. Returns the number of profiles erased."""
    c = courant()
    if c is None:
        raise NonConnecte("Connecte-toi pour continuer.")
    st = get_store()
    idx = _index(c)
    for pid in idx["profils"]:
        for kind in KINDS_PAR_PROFIL:
            st.delete(kind, pid)
        for key in st.list("contrats_versions"):
            if key.startswith(f"{pid}-v"):
                st.delete("contrats_versions", key)
        for key in st.list("signal_packs"):
            if key.startswith(f"{pid}@"):
                st.delete("signal_packs", key)
    st.delete("comptes", c.id)
    return len(idx["profils"])
