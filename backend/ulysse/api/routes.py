"""HTTP API, framework-agnostic: the SAME router serves the local server (FastAPI) and the Lambda
function URL. Every route takes `as_of` (time machine); default = DEFAULT_ASOF."""
from __future__ import annotations

import json
import re
import threading
import time
from typing import Any, Callable

import numpy as np

from ulysse import demo, orchestrator, policy, vigie
from ulysse.adaptation import adaptation
from ulysse.analytics import core, hype, portfolio as pfm, regime, tools
from ulysse.config import DEFAULT_ASOF
from ulysse.contract import contradictions, esg
from ulysse.contract.defaults import Reponses, construire
from ulysse.contract.evaluate import asset_facts, duree_sous_l_eau, pire_sur_horizon
from ulysse.contract.schema import Contrat, Profil
from ulysse.data.datapack import get_datapack
from ulysse.glossaire import glossaire
from ulysse.llm import get_llm
from ulysse.store import get_store, now_iso


class HttpError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


ROUTES: list[tuple[str, re.Pattern, Callable]] = []


def route(method: str, pattern: str):
    rx = re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", pattern) + "$")

    def deco(fn):
        ROUTES.append((method, rx, fn))
        return fn
    return deco


def handle(method: str, path: str, query: dict | None = None, body: Any = None) -> tuple[int, Any]:
    query = query or {}
    for m, rx, fn in ROUTES:
        mm = rx.match(path)
        if m == method and mm:
            try:
                return 200, fn(query=query, body=body or {}, **mm.groupdict())
            except HttpError as e:
                return e.status, {"erreur": e.message}
            except (KeyError, ValueError) as e:
                return 400, {"erreur": str(e)}
    return 404, {"erreur": f"route inconnue : {method} {path}"}


# ----------------------------------------------------------------------------------------- helpers

def _asof(q) -> str:
    a = q.get("as_of") or DEFAULT_ASOF
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", a):
        raise HttpError(400, "as_of doit être au format AAAA-MM-JJ")
    return a


def _profil(pid: str) -> tuple[Profil, Contrat]:
    st = get_store()
    p, c = st.get("profils", pid), st.get("contrats", pid)
    if not p or not c:
        raise HttpError(404, f"profil inconnu : {pid}")
    return Profil(**p), Contrat(**c)


def _pf(prof: Profil, as_of: str) -> pfm.Portfolio:
    return pfm.from_allocation(get_datapack(), prof.allocation.capital_cad, prof.allocation.poids, prof.allocation.constitue_le, as_of=as_of)


def _ev(e) -> dict:
    from ulysse.dossier import affichage
    d = e.model_dump()
    d["affichage"] = affichage(e)
    return d


def _ticker(t: str) -> str:
    dp = get_datapack()
    if t not in dp.idx:
        raise HttpError(404, f"{t} n'est pas couvert : l'univers du jeu de départ compte 31 actifs.")
    return t


def _pack(pid: str | None, as_of: str) -> dict:
    if not pid:
        return {}
    p = get_store().get("signal_packs", f"{pid}@{as_of}")
    if p is None:      # not pre-computed for this date (e.g. time machine): compute on demand, then cache
        vigie.executer(as_of, [pid])
        p = get_store().get("signal_packs", f"{pid}@{as_of}") or {}
    return p.get("titres", {})


# ----------------------------------------------------------------------------------------- routes

@route("GET", "/api/sante")
def sante(query, body):
    dp = get_datapack()
    return {"ok": True, "donnees_jusqu_au": str(dp.last_day), "as_of_defaut": DEFAULT_ASOF}


@route("GET", "/api/config")
def config(query, body):
    dp = get_datapack()
    return {"as_of_defaut": DEFAULT_ASOF, "donnees_debut": str(dp.calendar[0]), "donnees_jusqu_au": str(dp.last_day),
            "llm": get_llm().name, "univers": dp.assets, "mention": "Simulation, pas un conseil financier.",
            "episodes": {k: {"debut": s, "fin": e, "libelle": l} for k, (s, e, l) in pfm.EPISODES.items()}}


@route("POST", "/api/demo/reinitialiser")
def demo_reset(query, body):
    r = demo.reset(get_store())
    r["vigie"] = vigie.executer(DEFAULT_ASOF)
    return r


@route("GET", "/api/glossaire")
def glossary(query, body):
    return glossaire(query.get("niveau", "standard"))


@route("GET", "/api/profils")
def profils(query, body):
    st = get_store()
    out = []
    for pid in st.list("profils"):
        p = st.get("profils", pid)
        out.append({k: p.get(k) for k in ("id", "nom", "age", "tolerance", "experience", "description", "fictif")})
    return out


@route("POST", "/api/profils")
def creer_profil(query, body):
    rep = Reponses(**body)
    pid = "p-" + re.sub(r"[^a-z0-9]+", "-", rep.nom.lower()).strip("-")[:20] + "-" + str(int(time.time()))[-5:]
    prof, con = construire(rep, pid)
    st = get_store()
    st.put("profils", pid, prof.model_dump())
    st.put("contrats", pid, con.model_dump())
    st.put("contrats_versions", f"{pid}-v{con.version}", con.model_dump())
    st.append("journal", pid, {"type": "contrat", "a": now_iso(), "version": 1, "message": "Contrat créé en direct."})
    v = get_datapack().asof(_asof(query))
    return {"profil": prof.model_dump(), "contrat": con.model_dump(), "contradictions": _k(v, prof, con),
            "adaptation": adaptation(prof)}


def _k(v, prof, con):
    return [{k: x for k, x in c.items() if k != "preuves"} | {"preuves": [_ev(p) for p in c.get("preuves", [])]}
            for c in contradictions.detecter(v, prof, con)]


@route("GET", "/api/profils/{pid}")
def profil(query, body, pid):
    prof, con = _profil(pid)
    v = get_datapack().asof(_asof(query))
    return {"profil": prof.model_dump(), "contrat": con.model_dump(), "contradictions": _k(v, prof, con),
            "adaptation": adaptation(prof)}


@route("POST", "/api/profils/{pid}/regles/{cid}/apercu")
def apercu_regle(query, body, pid, cid):
    """Effect of a rule change BEFORE validating it."""
    prof, con = _profil(pid)
    as_of = _asof(query)
    v = get_datapack().asof(as_of)
    new = con.amend(cid, body.get("parametres", {}), body.get("contexte", "aperçu"))
    pf = _pf(prof, as_of)
    a, b = policy.signal_etat(v, con, pf), policy.signal_etat(v, new, pf)
    return {"avant": a.model_dump(), "apres": b.model_dump(), "contradictions_apres": _k(v, prof, new)}


@route("POST", "/api/profils/{pid}/regles/{cid}")
def modifier_regle(query, body, pid, cid):
    prof, con = _profil(pid)
    contexte = body.get("contexte") or "modification par l'utilisateur"
    new = con.amend(cid, body.get("parametres", {}), contexte)
    st = get_store()
    st.put("contrats", pid, new.model_dump())
    st.put("contrats_versions", f"{pid}-v{new.version}", new.model_dump())
    st.append("journal", pid, {"type": "regle_modifiee", "a": now_iso(), "as_of": _asof(query), "clause": cid,
                               "version": new.version, "contexte": contexte, "detail": new.historique[-1]})
    return {"contrat": new.model_dump()}


@route("GET", "/api/profils/{pid}/accueil")
def accueil(query, body, pid):
    prof, con = _profil(pid)
    as_of = _asof(query)
    dp = get_datapack()
    v = dp.asof(as_of)
    pf = _pf(prof, as_of)
    st = get_store()
    sig = policy.signal_etat(v, con, pf)
    val = pfm.ev_valeur(v, pf)
    last = st.get("visites", pid)
    changes = []
    if last and last.get("as_of") and last["as_of"] != as_of:
        try:
            v0 = dp.asof(last["as_of"])
            val0 = pfm.valuation(v0, pfm.from_allocation(dp, prof.allocation.capital_cad, prof.allocation.poids,
                                                          prof.allocation.constitue_le, as_of=as_of))
            changes.append({"type": "valeur", "depuis": last["as_of"], "avant_cad": val0["total_cad"], "apres_cad": val.valeur["total_cad"]})
        except ValueError:
            pass
    notes = [n for n in st.get("notifications", pid, []) if np.datetime64(n["as_of"]) <= np.datetime64(as_of)]
    st.put("visites", pid, {"as_of": as_of, "le": now_iso()})
    reg = regime.ev_regime(v)
    return {"as_of": as_of, "donnees_jusqu_au": v.date, "valeur": _ev(val), "statut_contrat": sig.model_dump(),
            "changements": changes, "notifications": notes[-10:][::-1], "regime": _ev(reg), "adaptation": adaptation(prof)}


@route("GET", "/api/profils/{pid}/portefeuille")
def portefeuille(query, body, pid):
    prof, con = _profil(pid)
    as_of = _asof(query)
    v = get_datapack().asof(as_of)
    pf = _pf(prof, as_of)
    out = {"as_of": as_of, "valeur": _ev(pfm.ev_valeur(v, pf)), "transparence": [_ev(e) for e in pfm.ev_transparence(v, pf)],
           "risque": [_ev(e) for e in pfm.ev_contribution_risque(v, pf)], "paris_reels": _ev(pfm.ev_paris_reels(v, pf)),
           "rejeux": [_ev(pfm.ev_rejeu(v, pf, k)) for k in pfm.EPISODES], "signal": policy.signal_etat(v, con, pf).model_dump()}
    return out


@route("GET", "/api/marche")
def marche(query, body):
    as_of = _asof(query)
    dp = get_datapack()
    v = dp.asof(as_of)
    pack = _pack(query.get("profil"), as_of)
    out = []
    for a in dp.assets:
        t = a["ticker"]
        s = v.series(t, "close", "local")
        ok = np.flatnonzero(v.traded(t) & ~np.isnan(s))
        if len(ok) < 2:
            continue
        out.append({**a, "prix_local": float(s[ok[-1]]), "date_prix": str(v.dates[ok[-1]]),
                    "variation_1j_pct": float((s[ok[-1]] / s[ok[-2]] - 1) * 100), "signal": pack.get(t)})
    return {"as_of": as_of, "actifs": out}


@route("GET", "/api/marche/{t}")
def fiche(query, body, t):
    t = _ticker(t)
    as_of = _asof(query)
    dp = get_datapack()
    v = dp.asof(as_of)
    if v.first_valid(t) is None:
        raise HttpError(404, f"{t} n'existait pas encore à cette date.")
    evs = [core.prix(v, t), core.volatilite(v, t), core.pire_baisse(v, t), core.cvar(v, t, horizon=20), *core.ewma(v, t),
           core.rendement_total(v, t, 1), core.rendement_total(v, t, 5), core.rendement_dividende(v, t), duree_sous_l_eau(v, t)]
    if dp.asset[t]["asset_class"] in ("equity", "crypto"):
        evs.append(hype.ev_engouement(v, t))
    pour_toi = None
    pid = query.get("profil")
    if pid:
        prof, con = _profil(pid)
        pack = _pack(pid, as_of).get(t)
        hz = min(o.horizon_annees for o in prof.objectifs)
        hz_ev = pire_sur_horizon(v, t, min(hz, 5.0))
        evs.append(hz_ev)
        esg_res = esg.evaluer_controverses(v, t) if prof.preferences.esg_important else None
        if esg_res:
            evs.extend(esg_res["preuves"])
        pf_prof = _pf(prof, as_of)
        lt = pfm.look_through(v, pf_prof)
        detenus = {h.ticker for h in pf_prof.holdings}
        via = []
        for fund in ("SPY", "XIU.TO"):
            snap = v.etf_snapshot(fund)
            if fund in detenus and snap and any(h.get("universe_ticker") == t for h in snap["holdings"]):
                via.append({"fonds": fund, "poids_dans_fonds_pct": sum(h["weight"] for h in snap["holdings"]
                                                                       if h.get("universe_ticker") == t) * 100,
                            "composition_au": snap["as_of"]})
        pour_toi = {"signal_reference": pack, "deja_detenu_pct": lt["titres"].get(t, 0.0) * 100, "via_fnb": via,
                    "total_portefeuille_cad": lt["total_cad"], "adaptation": adaptation(prof),
                    "esg": {k: x for k, x in (esg_res or {}).items() if k != "preuves"} | ({"preuves": [p.id for p in esg_res["preuves"]]} if esg_res else {})
                    if esg_res else None, "horizon_annees": hz, "pire_sur_horizon": hz_ev.id}
    return {"as_of": as_of, "actif": dp.asset[t], "preuves": [_ev(e) for e in evs], "pour_toi": pour_toi,
            "serie": _serie(v, t)}


def _serie(v, t, n: int = 600) -> dict:
    lv = v.series(t, "close", "local")
    cad = v.series(t, "close", "CAD")
    idx = np.flatnonzero(v.traded(t) & ~np.isnan(lv))
    step = max(1, len(idx) // n)
    keep = idx[::step]
    if keep[-1] != idx[-1]:
        keep = np.r_[keep, idx[-1]]
    return {"dates": [str(d) for d in v.dates[keep]], "local": [round(float(x), 4) for x in lv[keep]],
            "cad": [round(float(x), 4) for x in cad[keep]], "devise": v.dp.asset[t]["currency"],
            "source": "Yahoo Finance (jeu de départ + prolongation), clôtures ajustées des fractionnements ; CAD via Banque du Canada"}


@route("GET", "/api/marche/{t}/impact")
def impact(query, body, t):
    """Chart hover on a fall: what it would have meant for this profile, in $ and vs. the goal."""
    t = _ticker(t)
    as_of = _asof(query)
    prof, con = _profil(query["profil"])
    v = get_datapack().asof(as_of)
    d0, d1 = np.datetime64(query["debut"]), np.datetime64(query["fin"])
    if d1 > v.day:
        raise HttpError(400, "période postérieure à la date de simulation")
    s = v.series(t, "adj", "CAD")
    i0, i1 = int(np.searchsorted(v.dates, d0)), int(np.searchsorted(v.dates, d1, side="right")) - 1
    seg = s[i0:i1 + 1]
    if np.isnan(seg[0]):
        raise HttpError(400, "pas de cours au début de la période")
    peak_i = int(np.nanargmax(seg[: int(np.nanargmin(seg)) + 1]))
    drop = float(np.nanmin(seg[peak_i:]) / seg[peak_i] - 1)
    pf = _pf(prof, as_of)
    lt = pfm.look_through(v, pf)
    expo = lt["titres"].get(t, 0.0)
    ref = 0.05
    base_w = expo if expo > 0 else ref
    total = lt["total_cad"]
    goal = next((o for o in sorted(prof.objectifs, key=lambda o: o.horizon_annees) if o.montant_cible_cad), None)
    from ulysse.evidence import evidence
    e = evidence(mesure="impact_baisse_historique", libelle=f"Ce qu'aurait représenté la baisse de {t}", sujet=t,
                 valeur={"baisse_pct": drop * 100, "exposition_pct": base_w * 100, "position_hypothetique": expo == 0,
                         "impact_cad": drop * base_w * total, "impact_pct_portefeuille": drop * base_w * 100,
                         "objectif": goal.libelle if goal else None,
                         "impact_pct_objectif": (drop * base_w * total / goal.montant_cible_cad * 100) if goal else None},
                 unite="%", devise="CAD", as_of=as_of, date_de_calcul=v.date, periode=(str(v.dates[i0]), str(v.dates[i1])),
                 donnees_source=core.src(v, t) + ["profil:positions (fictives)"], methode="baisse_sommet_creux_x_exposition",
                 parametres={"position_reference_pct": ref * 100}, reference="Fait passé appliqué à l'exposition actuelle ; aucune prévision.")
    return _ev(e)


@route("GET", "/api/tendances")
def tendances(query, body):
    as_of = _asof(query)
    dp = get_datapack()
    v = dp.asof(as_of)
    rows = []
    for a in dp.assets:
        if a["asset_class"] not in ("equity", "crypto") or v.first_valid(a["ticker"]) is None:
            continue
        e = hype.ev_engouement(v, a["ticker"])
        rows.append({"ticker": a["ticker"], "nom": a["name"], "preuve": _ev(e)})
    rows.sort(key=lambda r: (not (r["preuve"]["valeur"] or {}).get("engouement", False),
                             -((r["preuve"]["valeur"] or {}).get("plus_inhabituel_que_pct_des_jours") or 0)))
    return {"as_of": as_of, "regime": _ev(regime.ev_regime(v)), "titres": rows}


@route("GET", "/api/recherche")
def recherche(query, body):
    q = (query.get("q") or "").strip().lower()
    as_of = _asof(query)
    dp = get_datapack()
    pack = _pack(query.get("profil"), as_of)
    lt = None
    if query.get("profil"):
        prof, _c = _profil(query["profil"])
        lt = pfm.look_through(dp.asof(as_of), _pf(prof, as_of))
    out = []
    for a in dp.assets:
        if q and q not in a["ticker"].lower() and q not in a["name"].lower() and q not in a["sector"].lower():
            continue
        out.append({**a, "signal": pack.get(a["ticker"]), "deja_detenu_pct": (lt["titres"].get(a["ticker"], 0.0) * 100) if lt else None})
    return {"as_of": as_of, "resultats": out}


@route("GET", "/api/comparer")
def comparer(query, body):
    as_of = _asof(query)
    a, b = _ticker(query["a"]), _ticker(query["b"])
    v = get_datapack().asof(as_of)
    pack = _pack(query.get("profil"), as_of)
    res = {}
    for t in (a, b):
        res[t] = {"preuves": [_ev(e) for e in (core.volatilite(v, t), core.pire_baisse(v, t), core.cvar(v, t, horizon=20),
                                               core.rendement_dividende(v, t))],
                  "signal": pack.get(t), "facts": {"speculatif": asset_facts(v, t).speculatif}}
    return {"as_of": as_of, "profil": query.get("profil"), "titres": res,
            "note": "Comparaison au regard de TES règles, pas un classement universel."}


@route("POST", "/api/ordres/verifier")
def verifier_ordre(query, body):
    pid, t = body["profil"], _ticker(body["ticker"])
    as_of = body.get("as_of") or _asof(query)
    prof, con = _profil(pid)
    v = get_datapack().asof(as_of)
    hz = body.get("horizon_annees")
    sig = policy.signal_ordre(v, con, _pf(prof, as_of), t, float(body["montant_cad"]), options=bool(body.get("options", True)),
                              horizon_override=float(hz) if hz else None)
    if body.get("journaliser") and sig.niveau in ("attention", "pause"):
        get_store().append("journal", pid, {"type": "signal", "a": now_iso(), "as_of": as_of, "ticker": t,
                                            "montant_cad": body["montant_cad"], "niveau": sig.niveau, "regles": sig.regles_declenchees})
    d = sig.model_dump()
    return d


@route("POST", "/api/ordres/decision")
def decision_ordre(query, body):
    """The user keeps the last word: « continuer quand même », « choisir une alternative » — logged."""
    pid = body["profil"]
    get_store().append("journal", pid, {"type": "decision", "a": now_iso(), "as_of": body.get("as_of") or DEFAULT_ASOF,
                                        "ticker": body.get("ticker"), "choix": body.get("choix"), "montant_cad": body.get("montant_cad"),
                                        "niveau": body.get("niveau"), "simulation": True})
    return {"ok": True, "message": "Décision consignée (simulation : aucune transaction réelle)."}


_RUNNER_LOCK = threading.Lock()


@route("POST", "/api/dossiers")
def creer_dossier(query, body):
    pid = body["profil"]
    _profil(pid)
    it = body.get("intention") or {"type": "portefeuille"}
    if it.get("ticker"):
        _ticker(it["ticker"])
    as_of = body.get("as_of") or _asof(query)
    st = get_store()
    did = orchestrator.creer(st, pid, it, as_of)
    from ulysse.runner import lancer
    lancer(did, body.get("llm"))
    return {"id": did}


@route("GET", "/api/dossiers/{did}")
def dossier(query, body, did):
    d = get_store().get("dossiers", did)
    if not d:
        raise HttpError(404, "dossier inconnu")
    return d


@route("GET", "/api/profils/{pid}/journal")
def journal(query, body, pid):
    _profil(pid)
    st = get_store()
    items = st.get("journal", pid, [])
    return {"entrees": items[::-1]}


@route("GET", "/api/profils/{pid}/notifications")
def notifications(query, body, pid):
    _profil(pid)
    return {"notifications": get_store().get("notifications", pid, [])[::-1]}


@route("GET", "/api/profils/{pid}/surveillance")
def surveillance(query, body, pid):
    _profil(pid)
    as_of = _asof(query)
    lst = get_store().get("surveillance", pid, [])
    pack = _pack(pid, as_of)
    v = get_datapack().asof(as_of)
    out = []
    for t in lst:
        e = hype.ev_engouement(v, t) if get_datapack().asset[t]["asset_class"] in ("equity", "crypto") else None
        out.append({"ticker": t, "signal": pack.get(t), "engouement": _ev(e) if e else None})
    return {"as_of": as_of, "titres": out}


@route("POST", "/api/profils/{pid}/surveillance")
def maj_surveillance(query, body, pid):
    _profil(pid)
    st = get_store()
    lst = st.get("surveillance", pid, [])
    t = _ticker(body["ticker"])
    if body.get("retirer"):
        lst = [x for x in lst if x != t]
    elif t not in lst:
        lst.append(t)
        st.append("journal", pid, {"type": "surveillance", "a": now_iso(), "ticker": t})
    st.put("surveillance", pid, lst)
    return {"titres": lst}


@route("POST", "/api/vigie/executer")
def vigie_run(query, body):
    return vigie.executer(body.get("as_of") or _asof(query), body.get("profils"))


@route("GET", "/api/vigie/historique")
def vigie_hist(query, body):
    return {"executions": get_store().get("vigie_executions", "historique", [])[-20:][::-1]}


@route("GET", "/api/fiabilite")
def fiabilite(query, body):
    from ulysse.config import ROOT
    p = ROOT / "bench" / "resultats" / "fiabilite.json"
    if not p.exists():
        return {"disponible": False, "message": "Banc d'essai pas encore exécuté."}
    return json.loads(p.read_text())


@route("GET", "/api/outils")
def outils(query, body):
    return {"catalogue": tools.catalog(), "modules": tools.MODULES}
