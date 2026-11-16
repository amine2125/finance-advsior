"""Signal policy (code, no LLM): decides none / ✅ / ⚠ / ⛔ from clause statuses.

Only excesses CAUSED or materially WORSENED by the intention count (evaluate.qualifier);
pre-existing ones are shown as context (the Vigie reports drifts separately).
Gravity of a quantitative excess = (value - limit) / limit (for a minimum: (limit - value) / limit),
weighted x2 when the clause is important. Named rules, each with its case and its limit:
  P1  ⛔ an important quantitative clause exceeded by 50 % of its limit or more.
  P2  ⛔ total weighted gravity >= 1.0 (several excesses that add up).
  A1  ⚠  at least one excess caused by the intention (P1/P2 not met). Qualitative (ESG) clauses never
        trigger ⛔: their classification depends on a definition the investor may not share.
  A2  ⚠  a clause approached (>= 80 % of its limit) and moved closer by the intention.
  A3  ⚠  an important clause cannot be checked (insufficient data).
  O1  ✅ every evaluated clause respected.        N1  — nothing to evaluate.
Display: ⛔ interrupts only for an order; ⚠ with an excess = a box, ⚠ approached/unknown = a discreet
note; ✅ = discreet chip; an identical signal already seen becomes discreet. Never a definitive block.
"""
from __future__ import annotations

import math
import time

from ulysse.contract.evaluate import Etat, apres_ordre, etat, evaluer
from ulysse.contract.schema import Contrat, Option, Signal, StatutClause
from ulysse.analytics import portfolio as pfm
from ulysse import fmt
from ulysse.data.datapack import AsOf

QUALITATIVE = {"esg_controverses", "esg_exclusion_secteurs"}
SEUIL_P1_RELATIF = 0.5   # P1: important clause exceeded by >= 50 % of its limit
SEUIL_P2 = 1.0           # P2: total weighted gravity
SEUIL_ENCADRE = 0.25     # ⚠ shown as a box from this gravity on


def ratio(s: StatutClause) -> float:
    if s.valeur_apres is None or s.limite is None:
        return float("nan")
    if s.type == "liquidites_min":
        return s.limite / s.valeur_apres if s.valeur_apres > 0 else math.inf
    if s.limite == 0:
        return math.inf if s.valeur_apres > 0 else 0.0
    return s.valeur_apres / s.limite


def gravite(s: StatutClause) -> float:
    if s.statut != "depassee" or not s.cause_par_intention or s.type in QUALITATIVE or s.limite is None or s.valeur_apres is None:
        return 0.0
    if s.type == "liquidites_min":
        g = (s.limite - s.valeur_apres) / s.limite if s.limite > 0 else 0.0
    elif s.limite == 0:
        g = 1.0 if s.valeur_apres > 0 else 0.0           # "none at all" clauses (e.g. crypto 0 %)
    else:
        g = (s.valeur_apres - s.limite) / s.limite
    return max(g, 0.0) * (2.0 if s.importante else 1.0)


def niveau(statuts: list[StatutClause], approche_par_intention: set[str] | None = None) -> tuple[str, list[str], float]:
    caused = [s for s in statuts if s.statut == "depassee" and s.cause_par_intention]
    total = sum(gravite(s) for s in caused)
    regles = []
    if any(s.importante and gravite(s) >= 2 * SEUIL_P1_RELATIF for s in caused):
        regles.append("P1")
    if total >= SEUIL_P2:
        regles.append("P2")
    if regles:
        return "pause", regles, total
    if caused:
        regles.append("A1")
    appr = [s for s in statuts if s.statut == "approchee" and (approche_par_intention is None or s.clause_id in approche_par_intention)]
    if appr:
        regles.append("A2")
    if any(s.importante and s.statut == "donnees_insuffisantes" for s in statuts):
        regles.append("A3")
    if regles:
        return "attention", regles, total
    if any(s.statut in ("respectee", "approchee") for s in statuts):
        return "ok", ["O1"], total
    return "aucun", ["N1"], total


def mode(lvl: str, regles: list[str], pour_ordre: bool, deja_vu: bool, statuts: list[StatutClause] | None = None,
         grav: float = 0.0) -> str:
    """How loud: ⛔ interrupts only an order; ⚠ is a box when it matters (gravity >= 0.25, an exceeded
    ESG clause, or an important clause that cannot be checked), otherwise a discreet note."""
    if lvl == "pause":
        return "interruption" if pour_ordre else "encadre"
    if lvl == "attention":
        st = statuts or []
        loud = (grav >= SEUIL_ENCADRE
                or any(s.type in QUALITATIVE and s.statut == "depassee" for s in st)
                or any(s.importante and s.statut == "donnees_insuffisantes" for s in st))
        return "encadre" if (loud and not deja_vu) else "discret"
    return "discret" if lvl == "ok" else "aucun"


TITRES = {
    "pause": "Pause de réflexion : cette intention s'écarte nettement de tes règles",
    "attention": "À regarder : une de tes règles est en jeu",
    "ok": "Cohérent avec tes règles",
    "aucun": "",
}


def signal_ordre(v: AsOf, contrat: Contrat, pf: pfm.Portfolio, ticker: str, montant_cad: float,
                 deja_vu: bool = False, options: bool = True, horizon_override: float | None = None) -> Signal:
    """horizon_override: sensitivity slider (« et si mon horizon était de N ans ? »), never saved."""
    t0 = time.perf_counter()
    avant = etat(v, pf)
    base, _ = evaluer(v, contrat, avant, None, cible=ticker, horizon_override=horizon_override)
    apres = apres_ordre(v, avant, ticker, montant_cad)
    statuts, preuves = evaluer(v, contrat, avant, apres, cible=ticker, avant_statuts=base, horizon_override=horizon_override)
    before = {s.clause_id: s for s in base}
    closer = {s.clause_id for s in statuts if s.statut == "approchee" and _closer(s, before.get(s.clause_id))}
    lvl, regles, grav = niveau(statuts, closer)
    opts = _options(v, contrat, avant, base, ticker, montant_cad, statuts) if options and lvl in ("pause", "attention") else []
    opts += [Option(code="continuer", libelle="Continuer quand même (simulation)"),
             Option(code="modifier_regle", libelle="Modifier ma règle (la modification sera consignée avec son contexte)")]
    pertinentes = [s for s in statuts if s.statut == "depassee" or s.clause_id in closer
                   or (s.statut == "donnees_insuffisantes" and s.importante)] or statuts
    return Signal(niveau=lvl, afficher=lvl != "aucun", mode=mode(lvl, regles, True, deja_vu, statuts, grav), gravite=round(grav, 4),
                  titre=TITRES[lvl], regles_declenchees=regles, clauses=pertinentes, options=opts,
                  preuves=[e.model_dump() for e in preuves], as_of=str(v.day), latence_ms=round((time.perf_counter() - t0) * 1000, 1))


def _closer(s: StatutClause, b: StatutClause | None) -> bool:
    if b is None or b.valeur_apres is None or s.valeur_apres is None:
        return b is None or b.statut != "approchee"
    return (s.valeur_apres < b.valeur_apres) if s.type == "liquidites_min" else (s.valeur_apres > b.valeur_apres + 1e-9)


def signal_etat(v: AsOf, contrat: Contrat, pf: pfm.Portfolio, cible: str | None = None, deja_vu: bool = False) -> Signal:
    """Signal on the current state (portfolio screen, « Pour toi » band, Vigie): drifts beyond a rule."""
    t0 = time.perf_counter()
    avant = etat(v, pf)
    statuts, preuves = evaluer(v, contrat, avant, None, cible=cible)
    lvl, regles, grav = niveau(statuts)
    if lvl == "pause":            # no order in progress: browsing is never interrupted
        lvl, regles = "attention", regles + ["D1"]
    pertinentes = [s for s in statuts if s.statut in ("depassee", "approchee", "donnees_insuffisantes")] or statuts
    return Signal(niveau=lvl, afficher=lvl != "aucun", mode=mode(lvl, regles, False, deja_vu, statuts, grav), gravite=round(grav, 4),
                  titre=TITRES[lvl], regles_declenchees=regles, clauses=pertinentes,
                  preuves=[e.model_dump() for e in preuves], as_of=str(v.day), latence_ms=round((time.perf_counter() - t0) * 1000, 1))


def _depasse(statuts):
    return [s for s in statuts if s.statut == "depassee" and s.cause_par_intention and s.type not in QUALITATIVE]


def _options(v: AsOf, contrat: Contrat, avant: Etat, base, ticker: str, montant: float, statuts) -> list[Option]:
    out = []
    if _depasse(statuts):
        lo, hi = 0.0, montant
        for _ in range(18):                       # bisection on the amount (deterministic)
            mid = (lo + hi) / 2
            st, _p = evaluer(v, contrat, avant, apres_ordre(v, avant, ticker, mid), cible=ticker, avant_statuts=base)
            if _depasse(st):
                hi = mid
            else:
                lo = mid
        lo = math.floor(lo / 100) * 100
        if lo >= 100:
            out.append(Option(code="position_plus_petite",
                              libelle=f"Selon tes règles, une position d'au plus {fmt.cad(lo)} ({fmt.pct(lo / avant.total_cad * 100)} "
                                      "du portefeuille) ne créerait aucun dépassement chiffré.",
                              details={"montant_max_cad": lo, "pct_du_portefeuille": lo / avant.total_cad * 100}))
        else:
            out.append(Option(code="position_plus_petite", libelle="Selon tes règles, même une petite position créerait un dépassement chiffré.",
                              details={"montant_max_cad": 0}))
    a = v.dp.asset[ticker]
    single_stock_issue = any(s.type in ("concentration_titre", "speculatif_max") and s.statut in ("depassee", "approchee")
                             for s in statuts)
    if a["asset_class"] == "equity" and single_stock_issue:
        for fund in ("SPY", "XIU.TO"):
            snap = v.etf_snapshot(fund)
            if not snap:
                continue
            w = sum(h["weight"] for h in snap["holdings"] if h.get("universe_ticker") == ticker)
            if w <= 0:
                continue
            st, _p = evaluer(v, contrat, avant, apres_ordre(v, avant, fund, montant), cible=fund)
            lvl, _r, _g = niveau(st)
            out.append(Option(code="meme_exposition_via_fnb",
                              libelle=f"Le même montant dans {fund} exposerait environ {fmt.cad(w * montant)} à {ticker} "
                                      f"({fmt.pct(w * 100)} du fonds) ; le reste serait réparti sur les autres titres du fonds.",
                              details={"fonds": fund, "poids_titre_dans_fonds_pct": w * 100, "composition_au": snap["as_of"],
                                       "exposition_cad": w * montant, "montant_cad": montant, "niveau_selon_tes_regles": lvl}))
    return out
