"""Dossier facts: everything the writer (LLM or template) may use, and nothing else.

Every element is an Evidence object, including clause statuses, the policy decision, the options
and the profile hypotheses, so that EVERY number of the final text can be traced to one of them.
Each evidence carries display strings (`affichage`) in fr-CA so that numbers are copied, not recomputed.
"""
from __future__ import annotations

from typing import Any

from ulysse import fmt
from ulysse.contract.schema import Contrat, Profil, Signal, StatutClause
from ulysse.evidence import Evidence, evidence

LABELS = ("MESURE", "DOCUMENTE", "HYPOTHESE", "INCERTAIN")


def affichage(e: Evidence) -> dict[str, str]:
    """Display strings for every numeric leaf of an evidence value."""
    out: dict[str, str] = {}

    def walk(prefix: str, x: Any):
        if isinstance(x, bool) or x is None:
            return
        if isinstance(x, (int, float)):
            out[prefix or "valeur"] = _display(prefix, x, e.unite)
        elif isinstance(x, dict):
            for k, val in x.items():
                walk(f"{prefix}.{k}" if prefix else k, val)
        elif isinstance(x, str) and len(x) <= 10 and x[:4].isdigit():
            out[prefix or "valeur"] = x            # ISO dates are copied verbatim

    walk("", e.valeur)
    return out


def _display(key: str, x: float, unite: str) -> str:
    k = key.lower()
    if k.endswith("cad") or unite == "$" and not k.endswith("pct"):
        return fmt.cad(abs(x) if "baisse" in k else x)
    if k.endswith("pct") or unite == "%":
        return fmt.pct(x)
    if unite == "années" or k.endswith("annees"):
        return fmt.nombre(x, 1) + " an(s)"
    if unite == "ratio" or "ratio" in k or k.endswith("habituel"):
        return fmt.nombre(x, 2)
    if isinstance(x, int) or float(x).is_integer():
        return fmt.nombre(x, 0)
    return fmt.nombre(x, 2)


def ev_statut(s: StatutClause, as_of: str, parametres_clause: dict | None = None) -> Evidence:
    return evidence(mesure="statut_clause", libelle=f"Ta règle : {s.libelle}", sujet=s.clause_id,
                    parametres={"clause": parametres_clause or {}},
                    valeur={"statut": s.statut, "valeur_avant": s.valeur_avant, "valeur_apres": s.valeur_apres,
                            "limite": s.limite, "importante": s.importante, "origine": s.origine,
                            "cause_par_intention": s.cause_par_intention, "incertain": s.incertain,
                            "explication": s.explication, "preuves": s.preuves},
                    unite=s.unite, as_of=as_of, date_de_calcul=as_of, donnees_source=["contrat"] + s.preuves,
                    methode="evaluation_deterministe_de_la_clause",
                    reference="Règle évaluée en code (ulysse/contract/evaluate.py), testée.")


def ev_decision(sig: Signal) -> Evidence:
    n_dep = sum(1 for c in sig.clauses if c.statut == "depassee" and c.cause_par_intention)
    return evidence(mesure="decision_politique", libelle="Niveau décidé par la politique de signal", sujet="signal",
                    valeur={"niveau": sig.niveau, "regles": sig.regles_declenchees, "gravite": sig.gravite, "mode": sig.mode,
                            "n_regles_depassees_par_intention": n_dep},
                    unite="texte", as_of=sig.as_of, date_de_calcul=sig.as_of, donnees_source=["statuts des clauses"],
                    methode="politique_de_signal_deterministe",
                    reference="Règles nommées P1, P2, A1–A3, O1, N1 (ulysse/policy.py) ; jamais décidé par le LLM.")


def ev_option(o, as_of: str) -> Evidence:
    return evidence(mesure=f"option_{o.code}", libelle=o.libelle, sujet="options", valeur=o.details or {"code": o.code},
                    unite="$" if "montant_max_cad" in (o.details or {}) else "texte", as_of=as_of, date_de_calcul=as_of,
                    donnees_source=["politique de signal", "contrat"], methode="alternative_calculee_par_bissection"
                    if o.code == "position_plus_petite" else "alternative_par_transparence_fnb",
                    reference="Alternatives calculées en code avec les mêmes règles ; jamais une recommandation.")


def ev_profil(p: Profil, contrat: Contrat, as_of: str, pf_meta: dict) -> Evidence:
    return evidence(mesure="hypotheses_profil", libelle="Profil et portefeuille fictifs (hypothèses)", sujet=p.id,
                    valeur={"capital_initial_cad": pf_meta.get("capital_initial") or p.allocation.capital_cad, "constitue_le": pf_meta.get("constitue_le"),
                            "tolerance": p.tolerance, "experience": p.experience,
                            "horizon_le_plus_proche_annees": min(o.horizon_annees for o in p.objectifs),
                            "contrat_version": contrat.version, "fictif": True},
                    unite="texte", as_of=as_of, date_de_calcul=as_of, donnees_source=["profil (fictif)", "docs/hypotheses.md"],
                    methode="valeurs_declarees_ou_par_defaut", reference="Profils et portefeuilles fictifs (PDF p. 14).")


def compact(e: Evidence) -> dict:
    """What the writer sees for one evidence (no code, no raw arrays)."""
    return {"id": e.id, "libelle": e.libelle, "sujet": e.sujet, "statut": e.statut, "valeurs_affichees": affichage(e),
            "periode": e.periode.model_dump() if e.periode else None, "note": e.note,
            "source": e.donnees_source[:3], "methode": e.methode,
            **({"texte_source": e.valeur} if e.mesure.startswith("esg_") else {})}


def faits_pour_llm(f: dict) -> dict:
    """The only material sent to the LLM writer: compact evidence + context. No code, no raw data."""
    return {
        "date_simulation": f["as_of"], "intention": f.get("intention"), "titre": f.get("ticker"),
        "experience": f.get("experience"), "niveau_signal": f["decision_ev"].valeur if f.get("decision_ev") else None,
        "preuves": [compact(e) for e in f["preuves"].values()],
        "statuts_des_regles": [e.id for e in f["statuts_ev"]], "options": [e.id for e in f["options_ev"]],
        "informations_manquantes": f.get("manquantes", []), "conflits": f.get("conflits", []),
        "profil": f["profil_ev"].id,
    }
