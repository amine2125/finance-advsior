"""Template writer (no LLM): the fallback when the LLM fails twice, the local/test writer, and the
reference the LLM output is checked against. It only copies display values of evidence objects,
so its output passes the verifier by construction (tested)."""
from __future__ import annotations

from ulysse.dossier import affichage
from ulysse.evidence import Evidence

STATUT_FR = {"respectee": "respectée", "approchee": "approchée", "depassee": "dépassée",
             "donnees_insuffisantes": "données insuffisantes", "non_applicable": "non applicable"}
NIVEAU_FR = {"pause": "pause de réflexion (⛔)", "attention": "à regarder (⚠)", "ok": "cohérent (✅)", "aucun": "aucun signal"}


def P(texte: str, etiquette: str, *preuves: Evidence | str) -> dict:
    ids = [p if isinstance(p, str) else p.id for p in preuves if p is not None]
    return {"texte": texte, "etiquette": etiquette, "preuves": ids}


def ecrire(f: dict) -> dict:
    """f: facts from orchestrator.assembler_faits (evidence objects grouped by role)."""
    ev: dict[str, Evidence] = f["preuves"]
    by = {}
    for e in ev.values():
        by.setdefault((e.mesure, e.sujet), e)
    t = f.get("ticker")
    avance = f.get("experience") == "avance"
    d, c, a, o, x = [], [], [], [], []

    prix = by.get(("prix_cloture", t))
    prof = f["profil_ev"]
    if prix is not None:
        d.append(P(f"Données publiques : cours de {t} jusqu'au {prix.date_de_calcul} (Yahoo Finance, jeu de départ du datathon), "
                   "convertis en dollars canadiens avec le taux de la Banque du Canada.", "DOCUMENTE", prix))
    pv = affichage(prof)
    d.append(P(f"Ton profil et ton portefeuille sont fictifs : capital de départ de {pv.get('capital_initial_cad', '?')}, "
               f"constitué le {prof.valeur.get('constitue_le')}.", "HYPOTHESE", prof))

    vol = by.get(("volatilite_annualisee", t))
    if vol is not None and vol.statut == "ok":
        c.append(P(f"Sur la dernière année, la volatilité annualisée de {t} est de {affichage(vol)['valeur']}.", "MESURE", vol))
    mdd = by.get(("pire_baisse", t))
    if mdd is not None and mdd.statut == "ok":
        dv = affichage(mdd)
        c.append(P(f"Sa pire baisse passée atteint {dv['baisse_pct']}, du {mdd.valeur['date_sommet']} au {mdd.valeur['date_creux']}.",
                   "MESURE", mdd))
    hype = by.get(("engouement", t))
    if hype is not None and hype.statut == "ok" and hype.valeur.get("engouement"):
        hv = affichage(hype)
        parts = []
        if "vues_vs_habituel" in hv:
            parts.append(f"pages vues à {hv['vues_vs_habituel']} fois leur niveau habituel")
        if "volume_vs_habituel" in hv:
            parts.append(f"volume à {hv['volume_vs_habituel']} fois son niveau habituel")
        c.append(P(f"L'attention publique pour {t} est inhabituelle : " + ", ".join(parts) + ".", "MESURE", hype))
    if avance:
        cv = by.get(("cvar_historique", t))
        if cv is not None and cv.statut == "ok":
            c.append(P(f"Indicateur détaillé : la perte moyenne des pires périodes (CVaR) est de {affichage(cv)['cvar_pct']}.", "MESURE", cv))

    for s in f["statuts_ev"][:5]:
        sv = s.valeur
        lab = "DOCUMENTE" if s.sujet.startswith("C-ESG") else ("INCERTAIN" if sv["statut"] == "donnees_insuffisantes" or sv["incertain"] else "MESURE")
        under = [ev[i] for i in sv.get("preuves", []) if i in ev]
        a.append(P(f"Ta règle « {s.libelle.replace('Ta règle : ', '')} » : {STATUT_FR[sv['statut']]}. {sv['explication']}", lab, s, *under))
    dec = f["decision_ev"]
    if dec is not None:
        a.append(P(f"Niveau retenu par la politique écrite : {NIVEAU_FR[dec.valeur['niveau']]} (règles {', '.join(dec.valeur['regles'])}).",
                   "MESURE", dec))

    for oe in f["options_ev"]:
        if oe.mesure == "option_position_plus_petite":
            o.append(P(oe.libelle, "MESURE", oe))
        elif oe.mesure == "option_meme_exposition_via_fnb":
            o.append(P(oe.libelle, "MESURE", oe))
    if not o and dec is not None:
        o.append(P("Aucune alternative chiffrée n'est nécessaire : tes règles ne sont pas dépassées par cette intention.", "MESURE", dec))

    sources = [e for e in (prix, vol, mdd) if e is not None]
    x.append(P("Quelles données ? Les cours ajustés et le change, les compositions de FNB publiées à la date, "
               f"et ton contrat (version {prof.valeur.get('contrat_version')}).", "DOCUMENTE", prof, *sources))
    if dec is not None:
        causes = [s for s in f["statuts_ev"] if s.valeur["statut"] == "depassee" and s.valeur["cause_par_intention"]]
        n = dec.valeur.get("n_regles_depassees_par_intention", len(causes))
        if causes and n:
            x.append(P(f"Pourquoi ce constat ? {n} de tes règles seraient dépassées à cause de cette intention, dont "
                       + "; ".join(f"« {s.libelle.replace('Ta règle : ', '')} »" for s in causes[:3]) + ".", "MESURE", dec, *causes[:3]))
        else:
            x.append(P("Pourquoi ce constat ? Aucune de tes règles n'est dépassée à cause de cette intention.", "MESURE", dec))
    lim_ev = mdd or vol or prof
    x.append(P("Quelles limites ? Ce sont des données passées : elles décrivent des risques déjà observés et ne prédisent pas "
               "les rendements futurs.", "INCERTAIN", lim_ev))
    by_clause = {e.sujet: e for e in f["statuts_ev"]}
    for m in f.get("manquantes", [])[:2]:
        se = by_clause.get(m.get("clause_id"))
        cites = [se, *[ev[i] for i in (se.valeur.get("preuves", []) if se else []) if i in ev]] if se else [prof]
        x.append(P(f"Limite : {m['message']}", "INCERTAIN", *cites))
    small = next((e for e in f["options_ev"] if e.mesure == "option_position_plus_petite"), None)
    if small is not None and small.valeur.get("montant_max_cad"):
        x.append(P(f"Qu'est-ce qui changerait la réponse ? Un montant d'au plus {affichage(small)['montant_max_cad']}, "
                   "ou une modification de ta règle, qui serait consignée avec son contexte.", "MESURE", small))
    else:
        x.append(P("Qu'est-ce qui changerait la réponse ? Une modification de ta règle (consignée avec son contexte) "
                   "ou une autre intention.", "HYPOTHESE", dec or prof))
    return {"sections": [{"etape": "donnees", "phrases": d}, {"etape": "constats", "phrases": c},
                         {"etape": "analyse", "phrases": a}, {"etape": "options", "phrases": o},
                         {"etape": "explication", "phrases": x}], "redige_par": "gabarit"}
