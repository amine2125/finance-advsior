"""Assistant: a chatbot kept inside ULYSSE's rules (decision D-040).

The person types a question in plain French. The CODE does everything that matters:
  1. comprendre : deterministic parsing (amount, % of the portfolio, security, intent). No LLM.
  2. calculer   : the same tools as the rest of the app (the Mât policy for an order, a 5 % reference
                  position for a security, the current state for the portfolio). Every number is an
                  Evidence object.
  3. rédiger    : a code-written draft, sentence by sentence (label + evidence ids).
  4. reformuler : optional (Bedrock only). The LLM rephrases the draft; it never decides a level.
  5. vérifier   : the dossier verifier (V1–V4) on every sentence; the named defect is sent back
                  (2 attempts), then the code draft is kept (it passes by construction).
What it never does: recommend, predict, answer beyond the data, follow instructions found in the message.
Requests for advice or a forecast get a fixed framing sentence written in code, then the facts.
Stateless: each message is answered on its own (no conversation memory is sent to the LLM).
"""
from __future__ import annotations

import re
import time
import unicodedata

from ulysse import orchestrator, policy
from ulysse.analytics import portfolio as pfm, tools
from ulysse.contract.schema import Contrat, Profil, Signal
from ulysse.data.datapack import get_datapack
from ulysse.dossier import affichage, compact, ev_decision, ev_option, ev_statut
from ulysse.evidence import Evidence, evidence
from ulysse.llm import LLMError
from ulysse.store import now_iso
from ulysse.verifier import verifier_phrases
from ulysse.writer import NIVEAU_FR, STATUT_FR, P

MAX_MESSAGE = 500
MAX_ESSAIS = 2
REFERENCE_PCT = 5.0

# Common names people type, mapped to the 31 securities of the starter kit.
NOMS = {
    "nvidia": "NVDA", "tesla": "TSLA", "apple": "AAPL", "microsoft": "MSFT", "google": "GOOGL", "alphabet": "GOOGL",
    "amazon": "AMZN", "jpmorgan": "JPM", "jp morgan": "JPM", "johnson & johnson": "JNJ", "johnson and johnson": "JNJ",
    "procter": "PG", "exxon": "XOM", "exxonmobil": "XOM", "banque royale": "RY.TO", "rbc": "RY.TO", "royal bank": "RY.TO",
    "toronto-dominion": "TD.TO", "banque td": "TD.TO", "manuvie": "MFC.TO", "manulife": "MFC.TO", "enbridge": "ENB.TO",
    "canadian natural": "CNQ.TO", "canadien national": "CNR.TO", "cn rail": "CNR.TO", "fortis": "FTS.TO",
    "couche-tard": "ATD.TO", "couche tard": "ATD.TO", "shopify": "SHOP.TO", "constellation": "CSU.TO",
    "s&p 500": "SPY", "s&p500": "SPY", "sp500": "SPY", "nasdaq": "QQQ", "tsx": "XIU.TO", "bitcoin": "BTC-USD",
    "ether": "ETH-USD", "ethereum": "ETH-USD", "gold": "GLD", "obligations canadiennes": "XBB.TO",
}
CONSEIL = re.compile(r"\b(devrai[st]?|dois[- ]je|conseill|recommand|sugger|suggere|quoi acheter|quoi vendre|que faire|quoi faire|"
                     r"meilleur placement|bon placement|bonne idee|vaut[- ]il|vaut le coup|bon moment|"
                     r"dis[- ]moi (?:d'|de |s'il faut )?(?:acheter|vendre|investir)|faut[- ]il (?:acheter|vendre|investir))")
PREDICTION = re.compile(r"(va (?:monter|baisser|remonter|chuter|grimper)|prevision|predi|combien vaudra|dans (?:un|\d+) ans?\b.*\?|futur)")
PORTEFEUILLE = re.compile(r"(portefeuille|mes regles|mon contrat|\bcontrat\b|respecte|derive|mes placements)")
PCT = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")
MONTANT = re.compile(r"(?<![\w.])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?\s*(k\b|mille\b|m\$|\$|dollars?\b|cad\b)?", re.I)

CADRES = {
    "conseil": "Je ne fais pas de recommandation : je compare seulement une intention à tes propres règles. Voici ce qu'elles disent.",
    "prediction": "Je ne prédis pas les cours : les données passées décrivent des risques déjà observés, pas l'avenir.",
    "aide": ("Je peux vérifier une intention contre ton contrat (par exemple « 2 000 $ de NVIDIA »), décrire un titre selon tes "
             "règles (« et TSLA ? ») ou dire si ton portefeuille respecte tes règles (« mon portefeuille respecte-t-il mes règles ? »)."),
    "sans_titre": ("De quel titre parles-tu ? Je couvre les 31 actifs du jeu de départ (par exemple NVDA, RY.TO, XBB.TO ou BTC-USD) ; "
                   "un titre hors de cet univers n'est pas couvert."),
    "simulation": "C'est une simulation : rien n'est exécuté et tu gardes le dernier mot.",
}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c))


def _alias(dp) -> dict[str, str]:
    out: dict[str, str] = {}
    for a in dp.assets:
        t = a["ticker"]
        out[_norm(t)] = t
        base = _norm(t.split(".")[0].split("-")[0])
        if len(base) >= 2:
            out.setdefault(base, t)
        out.setdefault(_norm(a["name"]), t)
    for k, t in NOMS.items():
        if t in dp.idx:
            out[_norm(k)] = t
    return out


def _titres(msg: str, dp) -> list[str]:
    """Securities mentioned, in order of appearance (longest alias wins at the same position)."""
    found: list[tuple[int, int, str]] = []
    for k, t in _alias(dp).items():
        for m in re.finditer(r"(?<![\w&])" + re.escape(k) + r"(?![\w&])", msg):
            found.append((m.start(), -len(k), t))
    out: list[str] = []
    for _, _, t in sorted(found):
        if t not in out:
            out.append(t)
    return out


def _montant(msg: str) -> float | None:
    sans_pct = PCT.sub(" ", msg)
    for m in MONTANT.finditer(sans_pct):
        entier = re.sub(r"[   ]", "", m.group(1))
        val = float(f"{entier}.{m.group(2)}" if m.group(2) else entier)
        unite = (m.group(3) or "").lower()
        if unite in ("k", "mille"):
            val *= 1000
        if unite or (val >= 100 and not 1990 <= val <= 2100):
            return val
    return None


def comprendre(message: str, dp, contexte: dict | None = None) -> dict:
    msg = _norm(message)
    titres = _titres(msg, dp)
    if not titres and (contexte or {}).get("ticker") in dp.idx:
        titres = [contexte["ticker"]]                       # « et si j'en mettais 2 000 $ ? » on a security page
    pct = PCT.search(msg)
    montant = _montant(message)
    motifs = [k for k, rx in (("conseil", CONSEIL), ("prediction", PREDICTION)) if rx.search(msg)]
    if titres and (montant or pct):
        typ = "ordre"
    elif titres:
        typ = "titre"
    elif PORTEFEUILLE.search(msg):
        typ = "portefeuille"
    elif montant or pct:
        typ = "sans_titre"
    else:
        typ = "aide"
    return {"type": typ, "ticker": titres[0] if titres else None, "autres_titres": titres[1:],
            "montant_cad": montant, "part_pct": float(pct.group(1).replace(",", ".")) if pct and not montant else None,
            "motifs": motifs}


# --------------------------------------------------------------------------------------- drafting

def _statuts(sig: Signal, con: Contrat, day: str, preuves: dict[str, Evidence]) -> list[Evidence]:
    for d in sig.preuves:
        e = Evidence(**d)
        preuves[e.id] = e
    params = {c.id: c.parametres for c in con.clauses}
    out = [ev_statut(s, day, params.get(s.clause_id)) for s in sig.clauses if s.statut not in ("respectee", "non_applicable")]
    out.sort(key=lambda e: {"depassee": 0, "approchee": 1, "donnees_insuffisantes": 2}.get(e.valeur["statut"], 3))
    for e in out:
        preuves[e.id] = e
    return out


def _phrases_regles(statuts: list[Evidence], preuves: dict[str, Evidence], n: int = 3) -> list[dict]:
    out = []
    for s in statuts[:n]:
        sv = s.valeur
        lab = "DOCUMENTE" if s.sujet.startswith("C-ESG") else ("INCERTAIN" if sv["statut"] == "donnees_insuffisantes" or sv["incertain"] else "MESURE")
        under = [preuves[i] for i in sv.get("preuves", []) if i in preuves]
        out.append(P(f"Ta règle « {s.libelle.replace('Ta règle : ', '')} » : {STATUT_FR[sv['statut']]}. {sv['explication']}", lab, s, *under))
    return out


def _phrase_niveau(sig: Signal, dec: Evidence) -> dict:
    regles = f" (règles {', '.join(sig.regles_declenchees)})" if sig.regles_declenchees else ""
    return P(f"Selon la politique écrite de l'app, le niveau est : {NIVEAU_FR[sig.niveau]}{regles}.", "MESURE", dec)


def _intention_ev(t: str, m: float, total: float, day: str, message: str, reference: bool) -> Evidence:
    return evidence(mesure="intention_assistant", libelle="Ton intention, comprise par le code" if not reference
                    else "Position de référence (5 % du portefeuille)", sujet=t,
                    valeur={"montant_cad": round(m, 2), "part_du_portefeuille_pct": m / total * 100 if total else None},
                    unite="$", as_of=day, date_de_calcul=day, donnees_source=["message de l'utilisateur", "valeur du portefeuille"],
                    methode="analyse_deterministe_du_message" if not reference else "position_de_reference_5_pct",
                    parametres={"message": message[:200]} if not reference else {"part_pct": REFERENCE_PCT},
                    reference="Montant et titre extraits du message par des règles écrites (ulysse/assistant.py), sans LLM.")


def _faits_titre(v, t: str, pf, preuves: dict[str, Evidence]) -> list[dict]:
    out = []
    by: dict[str, Evidence] = {}
    for name in ("volatilite", "pire_baisse", "engouement"):
        try:
            for e in tools.run_tool(name, v, {"ticker": t, "portefeuille": pf}):
                preuves[e.id] = e
                by.setdefault(e.mesure, e)
        except Exception:   # noqa: BLE001 - a missing fact is simply not written
            continue
    vol, mdd, hype = by.get("volatilite_annualisee"), by.get("pire_baisse"), by.get("engouement")
    if vol is not None and vol.statut == "ok":
        out.append(P(f"Sur la dernière année, la volatilité annualisée de {t} est de {affichage(vol)['valeur']}.", "MESURE", vol))
    if mdd is not None and mdd.statut == "ok":
        out.append(P(f"Sa pire baisse passée atteint {affichage(mdd)['baisse_pct']}, du {mdd.valeur['date_sommet']} au "
                     f"{mdd.valeur['date_creux']}.", "MESURE", mdd))
    if hype is not None and hype.statut == "ok" and hype.valeur.get("engouement"):
        out.append(P(f"L'attention publique pour {t} est inhabituelle à cette date (pages vues et volume comparés à son niveau habituel).",
                     "MESURE", hype))
    return out


def repondre(store, pid: str, prof: Profil, con: Contrat, message: str, as_of: str, contexte: dict | None, llm) -> dict:
    t0 = time.perf_counter()
    message = (message or "").strip()[:MAX_MESSAGE]
    if not message:
        raise ValueError("message vide")
    dp = get_datapack()
    v = dp.asof(as_of)
    day = str(v.day)
    pf = pfm.from_allocation(dp, prof.allocation.capital_cad, prof.allocation.poids, prof.allocation.constitue_le, as_of=as_of)
    comp = comprendre(message, dp, contexte)
    preuves: dict[str, Evidence] = {}
    val_ev = tools.run_tool("valeur_portefeuille", v, {"portefeuille": pf})[0]
    preuves[val_ev.id] = val_ev
    total = float(val_ev.valeur["total_cad"])
    cadre = [CADRES[m] for m in comp["motifs"]]
    phrases: list[dict] = []
    actions: list[dict] = []
    sig: Signal | None = None
    t = comp["ticker"]

    if comp["type"] == "ordre":
        m = comp["montant_cad"] or (comp["part_pct"] or 0) / 100 * total
        it = _intention_ev(t, m, total, day, message, reference=False)
        preuves[it.id] = it
        a = affichage(it)
        phrases.append(P(f"Tu envisages un ordre simulé de {a['montant_cad']} sur {t}, soit {a['part_du_portefeuille_pct']} "
                         "de ton portefeuille.", "MESURE", it, val_ev))
        sig = policy.signal_ordre(v, con, pf, t, m, options=True)
        dec = ev_decision(sig)
        preuves[dec.id] = dec
        phrases.append(_phrase_niveau(sig, dec))
        statuts = _statuts(sig, con, day, preuves)
        phrases += _phrases_regles(statuts, preuves)
        if sig.niveau == "ok":
            phrases.append(P("Toutes les règles évaluées pour cette intention sont respectées.", "MESURE", dec))
        for o in sig.options:
            if o.code in ("position_plus_petite", "meme_exposition_via_fnb"):
                oe = ev_option(o, day)
                preuves[oe.id] = oe
                phrases.append(P(oe.libelle, "MESURE", oe))
        cadre.append(CADRES["simulation"])
        actions = [{"code": "fiche", "libelle": f"Ouvrir {t} avec ce montant", "lien": f"/titre/{t}", "params": {"montant": str(round(m))}},
                   {"code": "dossier", "libelle": "Ouvrir le dossier complet", "intention": {"type": "ordre", "ticker": t, "montant_cad": round(m, 2)}},
                   {"code": "contrat", "libelle": "Voir mes règles", "lien": "/contrat"}]
    elif comp["type"] == "titre":
        phrases += _faits_titre(v, t, pf, preuves)
        m = REFERENCE_PCT / 100 * total
        it = _intention_ev(t, m, total, day, message, reference=True)
        preuves[it.id] = it
        sig = policy.signal_ordre(v, con, pf, t, m, options=False)
        dec = ev_decision(sig)
        preuves[dec.id] = dec
        a = affichage(it)
        phrases.append(P(f"Pour une position de référence de {a['part_du_portefeuille_pct']} de ton portefeuille ({a['montant_cad']}), "
                         f"le niveau selon tes règles serait : {NIVEAU_FR[sig.niveau]}.", "MESURE", it, dec))
        phrases += _phrases_regles(_statuts(sig, con, day, preuves), preuves, n=2)
        actions = [{"code": "fiche", "libelle": f"Ouvrir la fiche de {t}", "lien": f"/titre/{t}"},
                   {"code": "dossier", "libelle": "Ouvrir le dossier complet", "intention": {"type": "titre", "ticker": t}}]
    elif comp["type"] == "portefeuille":
        sig = policy.signal_etat(v, con, pf)
        dec = ev_decision(sig)
        preuves[dec.id] = dec
        phrases.append(P(f"Ton portefeuille fictif vaut {affichage(val_ev)['total_cad']} au {day}.", "MESURE", val_ev))
        phrases.append(_phrase_niveau(sig, dec))
        statuts = _statuts(sig, con, day, preuves)
        phrases += _phrases_regles(statuts, preuves)
        if not statuts:
            phrases.append(P("Toutes les règles évaluées sont respectées.", "MESURE", dec))
        actions = [{"code": "page", "libelle": "Voir la radiographie du portefeuille", "lien": "/portefeuille"},
                   {"code": "dossier", "libelle": "Ouvrir le dossier complet", "intention": {"type": "portefeuille"}}]
    else:
        cadre.append(CADRES[comp["type"]])
        actions = [{"code": "page", "libelle": "Chercher un titre", "lien": "/marche"}]

    # optional rephrasing by the LLM, always verified; the code draft is the fallback
    brouillon, final, redige_par, essais, usages = phrases, phrases, "code", [], []
    if phrases and getattr(llm, "name", "simule") != "simule" and orchestrator._budget_ok(store):   # the mock keeps the code draft
        faits = {"date_simulation": day, "niveau_signal": sig.niveau if sig else None,
                 "preuves": [compact(preuves[i]) for i in {i for ph in brouillon for i in ph["preuves"]} if i in preuves]}
        defauts: list[str] | None = None
        for k in range(1, MAX_ESSAIS + 1):
            try:
                out, u = llm.repondre(message, faits, brouillon, defauts)
                usages.append(u)
            except LLMError as e:
                essais.append({"essai": k, "resultat": "echec_llm", "erreur": str(e)})
                break
            defauts = verifier_phrases(out, preuves) + ([] if out else ["V5 REPONSE_VIDE : aucune phrase."])
            essais.append({"essai": k, "resultat": "accepte" if not defauts else "rejete", "defauts_nommes": defauts})
            if not defauts:
                final, redige_par = out, f"llm:{getattr(llm, 'model', llm.name)}"
                break
        cout = orchestrator._cout(usages)
        if cout:
            store.incr("llm_cout", time.strftime("%Y-%m-%d"), cout)
    defauts_final = verifier_phrases(final, preuves)

    cites = {i for ph in final for i in ph["preuves"]}
    store.append("journal", pid, {"type": "assistant", "a": now_iso(), "as_of": day, "question": message,
                                  "intention": {k: comp[k] for k in ("type", "ticker", "montant_cad", "part_pct")},
                                  "niveau": sig.niveau if sig else None})
    return {"question": message, "comprehension": comp, "cadre": cadre, "phrases": final, "redige_par": redige_par,
            "verification": {"accepte": not defauts_final, "defauts": defauts_final, "essais": essais},
            "signal": {"niveau": sig.niveau, "titre": sig.titre, "regles_declenchees": sig.regles_declenchees} if sig else None,
            "preuves": {i: {**preuves[i].model_dump(), "affichage": affichage(preuves[i])} for i in cites if i in preuves},
            "actions": actions, "as_of": day, "latence_ms": round((time.perf_counter() - t0) * 1000, 1)}
