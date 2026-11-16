"""Two opposing agents on the SAME evidence: Opportunités (what plays in favour of the intention, according to the person's
rules) and Risques (what plays against it). Neither decides anything: the signal level is already set by the written policy.

Each side writes 1 to 4 sentences, each labelled and citing evidence ids, checked by the same verifier as the dossier
(V1 label, V2 evidence, V3 numbers, V4 forbidden wording). A rejected draft is sent back once with its named defects;
then the template (code only, verified by construction) takes over. Both sides run in parallel, with a time budget.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from ulysse.dossier import affichage
from ulysse.evidence import Evidence
from ulysse.llm import LLMError
from ulysse.verifier import verifier_phrases
from ulysse.writer import P

COTES = {"pour": "Agent Opportunités", "contre": "Agent Risques"}
MAX_ESSAIS = 2
BUDGET_S = 90


def _by(f: dict) -> dict:
    by = {}
    for e in f["preuves"].values():
        by.setdefault((e.mesure, e.sujet), e)
    return by


def _nom(s: Evidence) -> str:
    return s.libelle.replace("Ta règle : ", "")


def gabarit(f: dict, cote: str) -> list[dict]:
    """Code-written arguments, copied from evidence display values only."""
    ev: dict[str, Evidence] = f["preuves"]
    by = _by(f)
    t = f.get("ticker")
    dec = f.get("decision_ev")
    statuts = f["statuts_ev"]
    out: list[dict] = []
    if cote == "pour":
        for s in [s for s in statuts if s.valeur["statut"] == "respectee"][:3]:
            out.append(P(f"Ta règle « {_nom(s)} » reste respectée avec cette intention.", "MESURE", s))
        div = by.get(("rendement_dividende_12m", t))
        if div is not None and div.statut == "ok" and div.valeur:
            out.append(P(f"Sur la dernière année, {t} a versé des dividendes équivalant à {affichage(div)['valeur']} de son cours.", "MESURE", div))
        pr = next((e for e in ev.values() if e.mesure == "paris_reels" and e.statut == "ok"), None)
        if pr is not None and affichage(pr).get("n_paris"):
            out.append(P(f"Ton portefeuille compte {affichage(pr)['n_paris']} paris réels distincts, ce qui limite l'effet d'une seule mauvaise surprise.", "MESURE", pr))
        small = next((e for e in f["options_ev"] if e.mesure == "option_position_plus_petite"), None)
        if small is not None and small.valeur.get("montant_max_cad"):
            out.append(P(f"Une version plus petite de l'intention, d'au plus {affichage(small)['montant_max_cad']}, respecterait tes règles.", "MESURE", small))
        if not out:
            out.append(P("Aucun élément chiffré ne joue en faveur de cette intention selon tes règles.", "MESURE", dec or f["profil_ev"]))
    else:
        for s in [s for s in statuts if s.valeur["statut"] == "depassee"][:3]:
            under = [ev[i] for i in s.valeur.get("preuves", []) if i in ev]
            out.append(P(f"Ta règle « {_nom(s)} » serait dépassée. {s.valeur['explication']}", "MESURE", s, *under))
        for s in [s for s in statuts if s.valeur["statut"] == "approchee"][:1]:
            out.append(P(f"Ta règle « {_nom(s)} » serait approchée.", "MESURE", s))
        mdd = by.get(("pire_baisse", t))
        if mdd is not None and mdd.statut == "ok":
            out.append(P(f"La pire baisse passée de {t} atteint {affichage(mdd)['baisse_pct']}, du {mdd.valeur['date_sommet']} au {mdd.valeur['date_creux']}.", "MESURE", mdd))
        hype = by.get(("engouement", t))
        if hype is not None and hype.statut == "ok" and hype.valeur.get("engouement"):
            out.append(P(f"L'attention publique pour {t} est inhabituelle : une décision prise dans l'engouement mérite d'être revue à froid.", "MESURE", hype))
        cv = by.get(("cvar_historique", t))
        if cv is not None and cv.statut == "ok":
            out.append(P(f"Lors de ses pires périodes passées, la perte moyenne (CVaR) a atteint {affichage(cv)['cvar_pct']}.", "MESURE", cv))
        lim = mdd or by.get(("volatilite_annualisee", t)) or f["profil_ev"]
        out.append(P("Ces chiffres décrivent le passé : ils ne prédisent pas les rendements futurs.", "INCERTAIN", lim))
    return out[:4]


def _cote(f: dict, preuves: dict[str, Evidence], llm, cote: str) -> dict:
    brouillon = gabarit(f, cote)
    essais, defauts, usages = [], None, []
    for k in range(1, MAX_ESSAIS + 1):
        try:
            phrases, u = llm.debattre(f, cote, brouillon, defauts)
            usages.append(u)
        except LLMError as e:
            essais.append({"essai": k, "resultat": "echec_llm", "erreur": str(e)[:200]})
            break
        defauts = verifier_phrases(phrases, preuves) + ([] if 1 <= len(phrases) <= 4 else ["V5 NOMBRE_DE_PHRASES : 1 à 4 phrases attendues."])
        essais.append({"essai": k, "resultat": "accepte" if not defauts else "rejete", "defauts_nommes": defauts})
        if not defauts:
            return {"agent": COTES[cote], "phrases": phrases, "redige_par": getattr(llm, "name", "llm"), "essais": essais, "usage": usages}
    defauts_g = verifier_phrases(brouillon, preuves)
    essais.append({"essai": "gabarit", "resultat": "accepte" if not defauts_g else "rejete", "defauts_nommes": defauts_g})
    return {"agent": COTES[cote], "phrases": brouillon, "redige_par": "gabarit", "essais": essais, "usage": usages}


def debattre(f: dict, preuves: dict[str, Evidence], llm) -> dict:
    """Both sides in parallel; a side over budget falls back to its template (and the trace says so)."""
    out: dict = {}
    ex = ThreadPoolExecutor(max_workers=2)
    futs = {c: ex.submit(_cote, f, preuves, llm, c) for c in COTES}
    ex.shutdown(wait=False)
    for c, fut in futs.items():
        try:
            out[c] = fut.result(timeout=BUDGET_S)
        except FuturesTimeout:
            out[c] = {"agent": COTES[c], "phrases": gabarit(f, c), "redige_par": "gabarit",
                      "essais": [{"essai": 1, "resultat": "delai_depasse", "erreur": f"plus de {BUDGET_S} s"}], "usage": []}
    out["usage"] = [u for c in COTES for u in out[c].pop("usage")]
    return out
