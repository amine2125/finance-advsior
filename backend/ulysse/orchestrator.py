"""Dossier orchestration, in plain Python (decision D-030: no Step Functions).

contexte -> planification (LLM) -> outils (code) -> gouvernance (code) -> signal (code)
-> redaction (LLM) -> verification (code; named defect sent back, 2 attempts) -> [gabarit] -> publication

Rules applied (method):
- the orchestrator checks that each step produced its proof before moving on (never trusts « done »);
- the state is written to storage after every step (resume, replay, progressive display);
- the named defect feeds the next attempt; every failure is logged in the trace.
"""
from __future__ import annotations

import time
import traceback
import uuid
from typing import Any

from ulysse import debat, policy, positions, verifier, writer
from ulysse.analytics import portfolio as pfm, tools
from ulysse.contract.schema import Contrat, Profil
from ulysse.data.datapack import get_datapack
from ulysse.dossier import ev_decision, ev_option, ev_profil, ev_statut
from ulysse.evidence import Evidence
from ulysse.governance import gouverner
from ulysse.llm import LLMError, MockLLM, get_llm
from ulysse.store import now_iso

ETAPES = ["contexte", "planification", "outils", "gouvernance", "signal", "debat", "redaction", "verification", "publication"]
LIBELLES_OUTILS = {
    "prix": "Cours", "volatilite": "Volatilité", "pire_baisse": "Pire baisse", "cvar": "Pertes extrêmes (CVaR)",
    "risque_recent": "Risque récent (EWMA)", "rendement_passe": "Rendement passé", "dividendes": "Dividendes",
    "engouement": "Attention inhabituelle", "regime": "Climat de marché", "valeur_portefeuille": "Valeur du portefeuille",
    "transparence": "Composition des FNB", "contribution_risque": "Contributions au risque", "paris_reels": "Paris réels",
    "rejeu_historique": "Rejeu historique", "choc_hypothetique": "Choc hypothétique", "scenarios_reechantillonnes": "Scénarios rééchantillonnés",
    "depots_officiels": "Dépôts SEC", "nouvelles": "Presse (GDELT)",
}
MAX_ESSAIS = 2


def base_tools(intention: dict) -> list[tuple[str, dict]]:
    """Mandatory modules, added by code whatever the planner says."""
    if intention.get("ticker"):
        return [("prix", {}), ("volatilite", {}), ("pire_baisse", {}), ("valeur_portefeuille", {}), ("transparence", {})]
    return [("valeur_portefeuille", {}), ("transparence", {}), ("contribution_risque", {})]


def creer(store, profil_id: str, intention: dict, as_of: str) -> str:
    did = "D-" + time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    store.put("dossiers", did, {"id": did, "profil_id": profil_id, "intention": intention, "as_of": as_of, "etat": "en_cours",
                                "cree_le": now_iso(), "etapes": [{"etape": e, "statut": "a_faire"} for e in ETAPES]})
    return did


def _budget_ok(store) -> bool:
    import os
    lim = float(os.environ.get("ULYSSE_LLM_LIMITE_JOUR_USD", "0") or 0)
    if lim <= 0:
        return True
    return float(store.get("llm_cout", time.strftime("%Y-%m-%d"), 0.0) or 0.0) < lim


def executer(store, did: str, llm=None) -> dict:
    llm = llm or get_llm()
    if not isinstance(llm, MockLLM) and not _budget_ok(store):
        llm = _Plafond()        # daily LLM budget reached: template only, and the trace says so
    d = store.get("dossiers", did)
    trace: list[dict] = []
    t_all = time.perf_counter()

    def step(name: str, statut: str, details: dict | None = None, preuves: list[str] | None = None, t0: float | None = None):
        rec = {"etape": name, "statut": statut, "a": now_iso(), "details": details or {}, "preuves": preuves or []}
        if t0 is not None:
            rec["duree_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        for i, e in enumerate(d["etapes"]):
            if e["etape"] == name:
                d["etapes"][i] = rec
        trace.append(rec)
        store.put("dossiers", did, d)

    try:
        # 1. contexte -------------------------------------------------------------------------
        t0 = time.perf_counter()
        step("contexte", "en_cours")
        prof = Profil(**store.get("profils", d["profil_id"]))
        con = Contrat(**store.get("contrats", d["profil_id"]))
        dp = get_datapack()
        v = dp.asof(d["as_of"])
        pf = positions.portefeuille(prof, d["as_of"])
        it = d["intention"]
        ticker = it.get("ticker")
        if ticker and ticker not in dp.idx:
            raise ValueError(f"{ticker} n'est pas couvert par l'univers de données (31 actifs du jeu de départ).")
        prof_ev = ev_profil(prof, con, str(v.day), pf.meta)
        ctx_llm = {"type": it.get("type"), "ticker": ticker, "classe_actif": dp.asset[ticker]["asset_class"] if ticker else None,
                   "profil": {"tolerance": prof.tolerance, "experience": prof.experience,
                              "horizon_le_plus_proche_annees": min(o.horizon_annees for o in prof.objectifs),
                              "esg_important": prof.preferences.esg_important, "interet_crypto": prof.preferences.interet_crypto},
                   "date_simulation": str(v.day)}
        step("contexte", "termine", {"donnees_jusqu_au": v.date, "contrat_version": con.version, "profil": prof.nom,
                                     "intention": it}, [prof_ev.id], t0)

        # 2. planification (LLM: plan only) ---------------------------------------------------------
        t0 = time.perf_counter()
        step("planification", "en_cours")
        cat = tools.catalog()
        rejets, usage_total = [], []
        try:
            plan, u = llm.planifier(ctx_llm, cat)
            usage_total.append(u)
            choisis = []
            for a in plan.appels:
                if a.outil not in tools.TOOLS:
                    rejets.append(f"outil inconnu « {a.outil} » rejeté")
                    continue
                params = _coerce(a.outil, {p.nom: p.valeur for p in a.parametres}, rejets)
                if params is not None:
                    choisis.append((a.outil, params))
            planifie_par = llm.name
        except LLMError as e:
            choisis, planifie_par = [], "repli_code"
            rejets.append(f"planificateur indisponible ({e}) : modules de base seulement")
        appels = base_tools(it) + [c for c in choisis if c[0] not in {b[0] for b in base_tools(it)}]
        step("planification", "termine", {"planifie_par": planifie_par, "modules_de_base": [b[0] for b in base_tools(it)],
                                          "modules_ajoutes": [c[0] for c in choisis], "rejets": rejets,
                                          "contexte_transmis": ctx_llm}, [], t0)

        # 3. outils (code) -----------------------------------------------------------------------------
        t0 = time.perf_counter()
        step("outils", "en_cours")
        preuves: dict[str, Evidence] = {prof_ev.id: prof_ev}
        journal_outils = []
        for name, params in appels:
            t1 = time.perf_counter()
            try:
                out = tools.run_tool(name, v, {"ticker": ticker, "portefeuille": pf}, **params)
            except Exception as e:  # noqa: BLE001 - a failing tool is logged, never hidden
                journal_outils.append({"outil": name, "libelle": LIBELLES_OUTILS.get(name, name), "statut": "echec", "erreur": str(e)[:200]})
                continue
            if not out:   # the orchestrator never trusts a « done » without proof
                journal_outils.append({"outil": name, "libelle": LIBELLES_OUTILS.get(name, name), "statut": "echec",
                                       "erreur": "aucune preuve produite"})
                continue
            for e in out:
                preuves[e.id] = e
            journal_outils.append({"outil": name, "libelle": LIBELLES_OUTILS.get(name, name), "parametres": params,
                                   "statut": "ok" if all(e.statut == "ok" for e in out) else "partiel",
                                   "preuves": [e.id for e in out], "duree_ms": round((time.perf_counter() - t1) * 1000, 1)})
            store.put("dossiers", did, {**d, "progression_outils": journal_outils})
        step("outils", "termine", {"appels": journal_outils}, [i for j in journal_outils for i in j.get("preuves", [])], t0)

        # 4. gouvernance (code) --------------------------------------------------------------------------
        t0 = time.perf_counter()
        step("gouvernance", "en_cours")
        g = gouverner(v, prof, con, pf, it if it.get("type") == "ordre" else ({"ticker": ticker} if ticker else None))
        for e in g["preuves"]:
            preuves[e.id] = e
        from ulysse.contract.schema import StatutClause
        statuts = [StatutClause(**s) for s in g["statuts"]]
        params = {c.id: c.parametres for c in con.clauses}
        statuts_ev = [ev_statut(s, str(v.day), params.get(s.clause_id)) for s in statuts if s.statut != "non_applicable"]
        for e in statuts_ev:
            preuves[e.id] = e
        step("gouvernance", "termine", {"conflits": g["conflits"], "informations_manquantes": g["informations_manquantes"],
                                        "controles": g["controles"],
                                        "statuts": [{"clause": s.clause_id, "statut": s.statut} for s in statuts]},
             [e.id for e in statuts_ev], t0)

        # 5. signal (code) -------------------------------------------------------------------------------------
        t0 = time.perf_counter()
        step("signal", "en_cours")
        sig = None
        options_ev = []
        if it.get("type") == "ordre":
            sig = policy.signal_ordre(v, con, pf, ticker, float(it["montant_cad"]))
        else:
            sig = policy.signal_etat(v, con, pf, cible=ticker)
        dec = ev_decision(sig)
        preuves[dec.id] = dec
        for o in sig.options:
            if o.code in ("position_plus_petite", "meme_exposition_via_fnb"):
                oe = ev_option(o, str(v.day))
                preuves[oe.id] = oe
                options_ev.append(oe)
        step("signal", "termine", {"niveau": sig.niveau, "mode": sig.mode, "regles": sig.regles_declenchees,
                                   "gravite": sig.gravite}, [dec.id] + [o.id for o in options_ev], t0)

        faits = {"as_of": str(v.day), "intention": it, "ticker": ticker, "experience": prof.experience, "preuves": preuves,
                 "profil_ev": prof_ev, "statuts_ev": _ordonner(statuts_ev), "decision_ev": dec, "options_ev": options_ev,
                 "manquantes": g["informations_manquantes"], "conflits": g["conflits"]}

        # 5b. debat (two opposing agents on the same evidence, every sentence verified) -----------------------
        t0 = time.perf_counter()
        step("debat", "en_cours")
        deb = debat.debattre(faits, preuves, llm)
        usage_total += deb.pop("usage")
        step("debat", "termine", {c: {"agent": deb[c]["agent"], "redige_par": deb[c]["redige_par"], "phrases": len(deb[c]["phrases"]),
                                      "essais": deb[c]["essais"]} for c in debat.COTES},
             sorted({i for c in debat.COTES for ph in deb[c]["phrases"] for i in ph["preuves"]}), t0)

        # 6-7. redaction (LLM) + verification (code), named defect fed back, 2 attempts ---------------------------
        essais, defauts, redaction = [], None, None
        for k in range(1, MAX_ESSAIS + 1):
            t0 = time.perf_counter()
            step("redaction", "en_cours", {"essai": k})
            try:
                brouillon, u = llm.rediger(faits, defauts)
                usage_total.append(u)
            except LLMError as e:
                essais.append({"essai": k, "resultat": "echec_llm", "erreur": str(e)})
                step("redaction", "echec", {"essais": essais}, [], t0)
                break
            step("redaction", "termine", {"essai": k, "redige_par": brouillon.get("redige_par")}, [], t0)
            t0 = time.perf_counter()
            step("verification", "en_cours", {"essai": k})
            defauts = verifier.verifier(brouillon, preuves)
            essais.append({"essai": k, "redige_par": brouillon.get("redige_par"), "resultat": "accepte" if not defauts else "rejete",
                           "defauts_nommes": defauts, "texte": brouillon})
            step("verification", "termine" if not defauts else "rejet", {"essais": [{x: e[x] for x in e if x != "texte"} for e in essais]},
                 [], t0)
            if not defauts:
                redaction = brouillon
                break
        if redaction is None:   # template fallback, no LLM; it must pass the verifier too
            t0 = time.perf_counter()
            redaction = writer.ecrire(faits)
            defauts_gabarit = verifier.verifier(redaction, preuves)
            essais.append({"essai": "gabarit", "redige_par": "gabarit", "resultat": "accepte" if not defauts_gabarit else "rejete",
                           "defauts_nommes": defauts_gabarit})
            step("verification", "termine", {"essais": [{x: e[x] for x in e if x != "texte"} for e in essais], "repli": "gabarit"}, [], t0)

        # 8. publication ---------------------------------------------------------------------------------------
        t0 = time.perf_counter()
        cout = _cout(usage_total)
        if cout:
            store.incr("llm_cout", time.strftime("%Y-%m-%d"), cout)
        d.update({"etat": "termine", "termine_le": now_iso(), "duree_totale_ms": round((time.perf_counter() - t_all) * 1000, 1),
                  "redaction": redaction, "debat": deb, "signal": sig.model_dump(), "essais_verification": essais,
                  "preuves": {k: e.model_dump() for k, e in preuves.items()}, "usage_llm": usage_total, "cout_estime_usd": cout,
                  "gouvernance": {k: g[k] for k in ("conflits", "informations_manquantes", "controles")}})
        step("publication", "termine", {"phrases": sum(len(s["phrases"]) for s in redaction["sections"]),
                                        "preuves": len(preuves), "cout_estime_usd": cout}, [], t0)
        store.put("dossiers", did, d)
        store.append("journal", d["profil_id"], {"type": "dossier", "id": did, "a": now_iso(), "as_of": d["as_of"],
                                                  "intention": it, "niveau": sig.niveau})
        return d
    except Exception as e:  # noqa: BLE001
        d.update({"etat": "echec", "erreur": str(e), "pile": traceback.format_exc()[-2000:]})
        store.put("dossiers", did, d)
        return d


def _ordonner(statuts_ev: list[Evidence]) -> list[Evidence]:
    order = {"depassee": 0, "donnees_insuffisantes": 1, "approchee": 2, "respectee": 3}
    return sorted(statuts_ev, key=lambda e: (order.get(e.valeur["statut"], 9), not e.valeur["cause_par_intention"]))


def _coerce(name: str, raw: dict[str, str], rejets: list[str]) -> dict | None:
    spec = tools.TOOLS[name].params
    out: dict[str, Any] = {}
    for k, val in raw.items():
        if k not in spec:
            rejets.append(f"{name} : paramètre « {k} » rejeté")
            continue
        allowed = spec[k].get("enum")
        cand = None
        for a in allowed or []:
            if str(a) == val or (a is None and val.lower() in ("none", "null", "")):
                cand = a
        if allowed is not None and cand is None and not any(str(a) == val for a in allowed):
            try:
                num = float(val)
                cand = next((a for a in allowed if isinstance(a, (int, float)) and float(a) == num), None)
            except ValueError:
                cand = None
            if cand is None:
                rejets.append(f"{name} : {k}={val} hors des valeurs autorisées")
                return None
        out[k] = cand
    return out


PRIX_USD_PAR_MTOK = {"anthropic.claude-opus-5-5": (4.0, 20.0)}   # estimate (Anthropic API list price); Bedrock price confirmed in phase 7


def _cout(usages: list[dict]) -> float:
    tot = 0.0
    for u in usages:
        pin, pout = PRIX_USD_PAR_MTOK.get(u.get("modele"), (0.0, 0.0))
        tot += u.get("jetons_entree", 0) / 1e6 * pin + u.get("jetons_sortie", 0) / 1e6 * pout
    return round(tot, 5)


class _Plafond(MockLLM):
    name = "plafond_quotidien_atteint"

    def planifier(self, *a, **k):
        raise LLMError("plafond quotidien de dépense LLM atteint")

    def rediger(self, *a, **k):
        raise LLMError("plafond quotidien de dépense LLM atteint")

    def debattre(self, *a, **k):
        raise LLMError("plafond quotidien de dépense LLM atteint")
