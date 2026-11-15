"""Evaluate every clause of a contract on the portfolio as it is, and as it would be after an
intended action (simulated order). Pure code, deterministic, testable.

Fast path for signals (< 300 ms): an order only adds `amount x exposure vector of the asset` to
the current exposures, so no heavy computation is needed once asset facts are known (the Vigie
pre-computes them; here they are cached per (datapack, date, ticker)).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np

from ulysse.analytics import core, portfolio as pfm
from ulysse.contract import esg
from ulysse.contract.schema import Clause, Contrat, StatutClause
from ulysse.data.datapack import AsOf
from ulysse.evidence import Evidence, evidence

APPROCHE = 0.8            # a "max" clause is approached at 80 % of its limit
SPECULATIF_VOL = 60.0     # annualised volatility (%) above which an asset counts as highly speculative
DIMENSIONS = ("classes", "secteurs", "pays", "devises", "titres")
NON_SECTEURS = ("Non classé",)


# ---------------------------------------------------------------- asset facts

@dataclass
class AssetFacts:
    ticker: str
    vecteur: dict                 # dimension -> {key: fraction} for 1 CAD invested
    transparent: bool
    vol_1a: float | None
    pire_baisse_pct: float | None
    sous_l_eau_max_annees: float | None
    speculatif: bool
    preuves: list[Evidence] = field(default_factory=list)


@lru_cache(maxsize=512)
def _facts_cached(dp_path: str, day: str, ticker: str) -> AssetFacts:
    from ulysse.data.datapack import Datapack
    dp = _DP_BY_PATH.get(dp_path) or Datapack(dp_path)
    v = dp.asof(day)
    return _asset_facts(v, ticker)


_DP_BY_PATH: dict = {}


def asset_facts(v: AsOf, ticker: str) -> AssetFacts:
    _DP_BY_PATH[str(v.dp.path)] = v.dp
    return _facts_cached(str(v.dp.path), str(v.day), ticker)


def _asset_facts(v: AsOf, t: str) -> AssetFacts:
    lt = pfm.look_through(v, pfm.Portfolio([pfm.Holding(t, 1.0)]))
    vec = {d: dict(lt[d]) for d in DIMENSIONS}
    vol = core.volatilite(v, t)
    mdd = core.pire_baisse(v, t)
    uw = duree_sous_l_eau(v, t)
    a = v.dp.asset[t]
    vol_v = vol.valeur if vol.statut == "ok" else None
    spec = a["asset_class"] == "crypto" or (vol_v is not None and vol_v > SPECULATIF_VOL)
    return AssetFacts(
        ticker=t, vecteur=vec, transparent=not lt["fonds_opaques"], vol_1a=vol_v,
        pire_baisse_pct=mdd.valeur["baisse_pct"] if mdd.statut == "ok" else None,
        sous_l_eau_max_annees=uw.valeur["annees"] if uw.statut == "ok" else None,
        speculatif=spec, preuves=[vol, mdd, uw])


def pire_sur_horizon(v: AsOf, t: str, annees: float) -> Evidence:
    """Worst total return over every past holding period of `annees` years (rolling windows).
    Answers « had I needed this money H years after buying, what is the worst I would have found? »"""
    lv = v.series(t, "adj", "CAD")
    idx = np.flatnonzero(v.traded(t) & ~np.isnan(lv))
    d, x = v.dates[idx], lv[idx]
    span = np.timedelta64(int(round(annees * 365.25)), "D")
    base = dict(mesure="pire_rendement_sur_horizon", libelle=f"Pire résultat sur toutes les périodes passées de {annees:g} an(s)",
                sujet=t, as_of=str(v.day), donnees_source=core.src(v, t), methode="minimum_des_rendements_glissants",
                parametres={"horizon_annees": annees, "devise_calcul": "CAD"},
                reference="Rendements sur périodes glissantes (rolling returns) : minimum observé, aucune prévision.")
    if len(d) < 2 or d[-1] - d[0] < span + np.timedelta64(365, "D"):
        return evidence(**base, valeur=None, unite="%", date_de_calcul=v.date, statut="donnees_insuffisantes",
                        note=f"historique plus court que {annees:g} an(s) + 1 an")
    j = np.searchsorted(d, d + span)
    ok = j < len(d)
    i_idx = np.flatnonzero(ok)
    r = x[j[ok]] / x[ok] - 1.0
    k = int(np.argmin(r))
    return evidence(**base, valeur={"pire_pct": float(r[k] * 100), "achat_le": str(d[i_idx[k]]), "besoin_le": str(d[j[ok][k]]),
                                    "n_periodes": int(len(r)), "part_periodes_en_perte_pct": float((r < 0).mean() * 100)},
                    unite="%", date_de_calcul=str(d[-1]), periode=(str(d[0]), str(d[-1])))


def duree_sous_l_eau(v: AsOf, t: str) -> Evidence:
    """Longest time the total-return index stayed below a previous peak (still running counts)."""
    lv = v.series(t, "adj", "CAD")
    idx = np.flatnonzero(v.traded(t) & ~np.isnan(lv))
    d, x = v.dates[idx], lv[idx]
    base = dict(mesure="duree_max_sous_l_eau", libelle="Plus longue période passée sous un ancien sommet", sujet=t,
                as_of=str(v.day), donnees_source=core.src(v, t), methode="duree_max_entre_sommet_et_retour",
                reference="Durée de récupération d'un indice de rendement total (« underwater period »).")
    if len(x) < 250:
        return evidence(**base, valeur=None, unite="années", date_de_calcul=v.date, statut="donnees_insuffisantes",
                        note=f"{len(x)} séances, 250 requises")
    peak_val, peak_day = x[0], d[0]
    best = (0, d[0], d[0], True)
    for day, val in zip(d, x):
        if val >= peak_val:
            dur = int((day - peak_day).astype(int))
            if dur > best[0]:
                best = (dur, peak_day, day, True)
            peak_val, peak_day = val, day
    running = int((d[-1] - peak_day).astype(int))
    if running > best[0]:
        best = (running, peak_day, d[-1], False)
    years = best[0] / 365.25
    return evidence(**base, valeur={"annees": years, "debut": str(best[1]), "fin": str(best[2]), "termine": best[3]},
                    unite="années", date_de_calcul=str(d[-1]), periode=(str(d[0]), str(d[-1])))


# ---------------------------------------------------------------- portfolio state (before / after)

@dataclass
class Etat:
    total_cad: float
    valeurs: dict                 # ticker -> CAD value (positions only)
    liquidites_cad: float
    expo: dict                    # dimension -> key -> fraction of total
    opaques: list[str]
    nouvel_argent_cad: float = 0.0


def etat(v: AsOf, pf: pfm.Portfolio) -> Etat:
    val = pfm.valuation(v, pf)
    valeurs = {x["ticker"]: x["valeur_cad"] for x in val["lignes"] if x["valeur_cad"] > 0}
    return _compose(v, valeurs, pf.cash_cad)


def _compose(v: AsOf, valeurs: dict, cash: float, nouvel_argent: float = 0.0) -> Etat:
    total = sum(valeurs.values()) + cash
    expo = {d: {} for d in DIMENSIONS}
    opaques = []
    for t, x in valeurs.items():
        f = asset_facts(v, t)
        if not f.transparent:
            opaques.append(t)
        for d in DIMENSIONS:
            for k, w in f.vecteur[d].items():
                expo[d][k] = expo[d].get(k, 0.0) + w * x / total
    if cash > 0:
        expo["classes"]["Liquidités"] = expo["classes"].get("Liquidités", 0.0) + cash / total
        expo["devises"]["CAD"] = expo["devises"].get("CAD", 0.0) + cash / total
    return Etat(total, valeurs, cash, expo, opaques, nouvel_argent)


def apres_ordre(v: AsOf, e: Etat, ticker: str, montant_cad: float) -> Etat:
    """Simulated purchase, funded by available cash first, then by new money."""
    valeurs = dict(e.valeurs)
    valeurs[ticker] = valeurs.get(ticker, 0.0) + montant_cad
    from_cash = min(e.liquidites_cad, montant_cad)
    return _compose(v, valeurs, e.liquidites_cad - from_cash, montant_cad - from_cash)


# ---------------------------------------------------------------- stress (worst available episode)

def pire_episode(v: AsOf, e: Etat) -> Evidence:
    """Worst fall of the portfolio (current weights) over the historical episodes that ended
    before the simulation date. In the time machine, 2022 is not available in 2021."""
    worst = None
    for code, (start, end, label) in pfm.EPISODES.items():
        if np.datetime64(end) > v.day:
            continue
        dd = _episode_drawdown(v, e, start, end)
        if dd is not None and (worst is None or dd < worst[1]):
            worst = (code, dd, label, start, end)
    base = dict(mesure="pire_episode_historique", libelle="Pire baisse du portefeuille dans les épisodes passés disponibles",
                sujet="portefeuille", as_of=str(v.day), donnees_source=["S1+S2:adj_close", "S1+S3:FXUSDCAD", "profil:positions (fictives)"],
                methode="rejeu_episodes_poids_actuels", parametres={"episodes": [c for c, (s, en, _) in pfm.EPISODES.items()
                                                                                   if np.datetime64(en) <= v.day]},
                reference="Rejeu historique : poids actuels appliqués aux rendements réels de chaque épisode (aucune prévision).")
    if worst is None:
        return evidence(**base, valeur=None, unite="%", date_de_calcul=v.date, statut="donnees_insuffisantes",
                        note="aucun épisode de crise terminé avant la date de simulation")
    code, dd, label, start, end = worst
    return evidence(**base, valeur={"baisse_pct": dd * 100, "baisse_cad": dd * e.total_cad, "episode": code, "libelle": label,
                                    "valeur_reference_cad": e.total_cad}, unite="%", devise="CAD",
                    date_de_calcul=v.date, periode=(start, end))


def _episode_drawdown(v: AsOf, e: Etat, start: str, end: str) -> float | None:
    cal = v.dp.calendar
    i0 = int(np.searchsorted(cal, np.datetime64(start)))
    i1 = int(np.searchsorted(cal, np.datetime64(end), side="right"))
    if i1 - i0 < 5:
        return None
    path = np.full(i1 - i0, e.liquidites_cad / e.total_cad)
    for t, x in e.valeurs.items():
        s = v.series(t, "adj", "CAD")[i0:i1]
        w = x / e.total_cad
        path = path + (w if np.isnan(s[0]) else w * s / s[0])
    return float((path / np.maximum.accumulate(path) - 1).min())


# ---------------------------------------------------------------- clause evaluation

def _status_max(value: float | None, limit: float) -> str:
    if value is None:
        return "donnees_insuffisantes"
    if value > limit + 1e-9:
        return "depassee"
    if limit > 0 and value >= APPROCHE * limit:
        return "approchee"
    return "respectee"


def _fmt(x: float | None, d: int = 1) -> str:
    from ulysse.fmt import nombre
    return nombre(x, d)


def evaluer(v: AsOf, contrat: Contrat, avant: Etat, apres: Etat | None = None, cible: str | None = None,
            horizon_override: float | None = None, avant_statuts: list[StatutClause] | None = None
            ) -> tuple[list[StatutClause], list[Evidence]]:
    """Status of every clause, with `cause_par_intention`: exceeded after the action AND either
    respected before or made worse by it. Pre-existing, unchanged excesses are context only."""
    statuts, preuves = _evaluer(v, contrat, avant, apres, cible, horizon_override)
    if apres is None:
        return [s.model_copy(update={"cause_par_intention": s.statut == "depassee"}) for s in statuts], preuves
    before = {s.clause_id: s for s in (avant_statuts if avant_statuts is not None
                                       else _evaluer(v, contrat, avant, None, cible, horizon_override)[0])}
    return [qualifier(s, before.get(s.clause_id)) for s in statuts], preuves


TARGET_SPECIFIC = ("horizon", "esg_controverses")
AGGRAVATION_SIGNIFICATIVE = 0.10   # a pre-existing excess counts again if worsened by >= 10 % of the limit


def qualifier(s: StatutClause, b: StatutClause | None) -> StatutClause:
    """Was this excess caused (or materially worsened) by the intention?"""
    caused = s.statut == "depassee"
    already = b is not None and b.statut == "depassee"
    if caused and s.type not in TARGET_SPECIFIC and already and s.valeur_apres is not None and b.valeur_apres is not None:
        lim = s.limite or 0.0
        delta = (b.valeur_apres - s.valeur_apres) if s.type == "liquidites_min" else (s.valeur_apres - b.valeur_apres)
        caused = delta >= AGGRAVATION_SIGNIFICATIVE * lim
    return s.model_copy(update={"cause_par_intention": caused,
                                "deja_depassee_avant": already and s.type not in TARGET_SPECIFIC})


def _evaluer(v: AsOf, contrat: Contrat, avant: Etat, apres: Etat | None = None, cible: str | None = None,
             horizon_override: float | None = None) -> tuple[list[StatutClause], list[Evidence]]:
    a = apres or avant
    out: list[StatutClause] = []
    proofs: list[Evidence] = []

    def add(c: Clause, statut, va, vb, lim, expl, preuves=(), unite="%", incertain=False):
        out.append(StatutClause(clause_id=c.id, type=c.type, libelle=c.libelle, origine=c.origine, importante=c.importante,
                                statut=statut, valeur_avant=va, valeur_apres=vb, limite=lim, unite=unite,
                                explication=expl, preuves=[p.id for p in preuves], incertain=incertain))
        proofs.extend(preuves)

    def expo_ev(mesure, libelle, value, dim_note=None, sujet="portefeuille"):
        return evidence(mesure=mesure, libelle=libelle, sujet=sujet, valeur=value, unite="%", as_of=str(v.day),
                        date_de_calcul=v.date, donnees_source=["profil:positions (fictives)", "S1+S2:close", "S7:SSGA", "S8:iShares Canada"],
                        methode="transparence_fnb_arithmetique", parametres={"apres_ordre": apres is not None, "cible": cible},
                        note=dim_note, reference="Exposition = Σ valeur de la ligne × part du titre ou du secteur dans la ligne, ÷ total.")

    opaque_note = ("Composition non disponible pour : " + ", ".join(sorted(set(a.opaques)))) if a.opaques else None
    for c in contrat.clauses:
        p = c.parametres
        if c.type == "concentration_titre":
            lim = float(p["max_pct"])
            focus = [cible] if cible else []
            if not focus:   # current state: the largest single issuer
                focus = [max(a.expo["titres"], key=a.expo["titres"].get)] if a.expo["titres"] else []
            if not focus:
                add(c, "non_applicable", None, None, lim, "Aucun titre individuel en jeu.")
                continue
            t = focus[0]
            cls = v.dp.asset.get(t, {}).get("asset_class", "")
            if cls in ("crypto", "etf_bond", "etf_commodity"):
                add(c, "non_applicable", None, None, lim, f"{t} n'est pas une entreprise : la limite par entreprise ne s'applique pas.")
                continue
            if cls == "etf_equity":
                # a fund is not one issuer: check the largest issuer it adds exposure to
                inside = [k for k in asset_facts(v, t).vecteur["titres"]]
                if not inside:
                    add(c, "non_applicable", None, None, lim, f"Composition de {t} non disponible : exposition par entreprise inconnue.",
                        incertain=True)
                    continue
                t = max(inside, key=lambda k: a.expo["titres"].get(k, 0.0))
            vb = a.expo["titres"].get(t, 0.0) * 100
            va = avant.expo["titres"].get(t, 0.0) * 100
            ev = expo_ev("exposition_titre", f"Exposition à {t} (direct + via FNB)", {"avant_pct": va, "apres_pct": vb, "titre": t},
                         opaque_note, sujet=t)
            st = _status_max(vb, lim)
            add(c, st, va, vb, lim, f"{t} pèserait {_fmt(vb)} % du portefeuille (direct + via FNB), pour une limite de {_fmt(lim, 0)} %.",
                [ev], incertain=bool(a.opaques))
        elif c.type in ("techno_max", "crypto_max", "actions_max", "devise_etrangere_max", "concentration_secteur"):
            lim = float(p["max_pct"])
            if c.type == "techno_max":
                f = lambda s: (s.expo["secteurs"].get("Information Technology", 0) + s.expo["secteurs"].get("Communication Services", 0)) * 100
                what = "La techno (TI + services de communication, via FNB compris)"
            elif c.type == "crypto_max":
                f = lambda s: s.expo["classes"].get("Cryptoactifs", 0) * 100
                what = "Les cryptoactifs"
            elif c.type == "actions_max":
                f = lambda s: s.expo["classes"].get("Actions", 0) * 100
                what = "Les actions (via FNB compris)"
            elif c.type == "devise_etrangere_max":
                f = lambda s: sum(x for k, x in s.expo["devises"].items() if k != "CAD") * 100
                what = "Les placements hors dollar canadien"
            else:
                def f(s):
                    sect = {k: x for k, x in s.expo["secteurs"].items() if k not in NON_SECTEURS and not k.startswith("Non transparent")}
                    return max(sect.values()) * 100 if sect else 0.0
                what = "Le secteur le plus lourd"
            va, vb = f(avant), f(a)
            ev = expo_ev(f"part_{c.type}", what, {"avant_pct": va, "apres_pct": vb}, opaque_note)
            if c.type == "crypto_max" and lim == 0:
                st = "depassee" if vb > 0 else "respectee"
            else:
                st = _status_max(vb, lim)
            incert = bool(a.opaques) and c.type in ("techno_max", "concentration_secteur")
            add(c, st, va, vb, lim, f"{what} représenteraient {_fmt(vb)} % du portefeuille, pour une limite de {_fmt(lim, 0)} %.",
                [ev], incertain=incert)
        elif c.type == "speculatif_max":
            lim = float(p["max_pct"])
            def spec_share(s):
                return sum(x for t, x in s.valeurs.items() if asset_facts(v, t).speculatif) / s.total_cad * 100
            va, vb = spec_share(avant), spec_share(a)
            ev = expo_ev("part_speculative", f"Part très volatile (volatilité > {SPECULATIF_VOL:.0f} % ou cryptoactif)",
                         {"avant_pct": va, "apres_pct": vb, "seuil_volatilite_pct": SPECULATIF_VOL})
            add(c, _status_max(vb, lim), va, vb, lim,
                f"Les placements très volatils représenteraient {_fmt(vb)} % du portefeuille, pour une limite de {_fmt(lim, 0)} %.", [ev])
        elif c.type == "liquidites_min":
            lim = float(p["min_pct"])
            va = avant.expo["classes"].get("Liquidités", 0) * 100
            vb = a.expo["classes"].get("Liquidités", 0) * 100
            st = "depassee" if vb < lim - 1e-9 else ("approchee" if vb < lim * 1.2 else "respectee")
            ev = expo_ev("part_liquidites", "Part en liquidités", {"avant_pct": va, "apres_pct": vb})
            add(c, st, va, vb, lim, f"Les liquidités passeraient à {_fmt(vb)} % du portefeuille, pour un minimum de {_fmt(lim, 0)} %.", [ev])
        elif c.type == "perte_max":
            lim = float(p["max_pct"])
            eb = pire_episode(v, a)
            ea = pire_episode(v, avant) if apres is not None else eb
            if eb.statut != "ok":
                add(c, "donnees_insuffisantes", None, None, lim, "Aucun épisode de crise passé n'est disponible à cette date.", [eb])
                continue
            vb_loss = -eb.valeur["baisse_pct"]
            va_loss = -ea.valeur["baisse_pct"] if ea.statut == "ok" else None
            add(c, _status_max(vb_loss, lim), va_loss, vb_loss, lim,
                f"Si « {eb.valeur['libelle']} » se répétait, le portefeuille baisserait d'environ {_fmt(vb_loss)} % "
                f"(≈ {_fmt(abs(eb.valeur['baisse_cad']), 0)} $), pour une perte maximale acceptée de {_fmt(lim, 0)} %.",
                [eb] + ([ea] if ea is not eb else []))
        elif c.type == "horizon":
            yrs = float(horizon_override or p["annees"])
            lim = float(p.get("max_perte_pct", 15.0))
            targets = [cible] if cible else [t for t, x in sorted(a.valeurs.items(), key=lambda kv: -kv[1]) if x / a.total_cad >= 0.02]
            worst = None
            for t in targets:
                eff = yrs
                first = v.first_valid(t)
                hist = (v.day - first).astype(int) / 365.25 if first is not None else 0.0
                if hist - 1 < eff:                      # not enough history for full-length windows
                    eff = float(int(hist - 1))
                if eff < 1:
                    continue
                e = pire_sur_horizon(v, t, eff)
                if e.statut != "ok":
                    continue
                loss = -e.valeur["pire_pct"]
                if worst is None or loss > worst[1]:
                    worst = (t, loss, e, eff)
            if worst is None:
                add(c, "donnees_insuffisantes", None, None, lim, f"Historique trop court pour mesurer des périodes de {_fmt(yrs, 0)} an(s).")
                continue
            t, loss, e, eff = worst
            reduit = eff < yrs
            st = _status_max(max(loss, 0.0), lim)
            yrs = eff
            if loss <= 0:
                expl = (f"Sur toutes les périodes passées de {_fmt(yrs, 0)} an(s), {t} n'a jamais fini en perte "
                        f"(du {e.periode.debut} au {e.periode.fin}).")
            else:
                expl = (f"Acheté le {e.valeur['achat_le']} et revendu {_fmt(yrs, 0)} an(s) plus tard, {t} aurait perdu {_fmt(loss)} % : "
                        f"c'est la pire période de {_fmt(yrs, 0)} an(s) observée, pour une perte acceptée de {_fmt(lim, 0)} % à cet horizon.")
            if reduit:
                expl += f" (Fenêtre réduite à {_fmt(eff, 0)} an(s) : l'historique disponible ne couvre pas {_fmt(float(p['annees']), 0)} ans.)"
            add(c, st, None, max(loss, 0.0), lim, expl, [e], incertain=reduit)
        elif c.type == "esg_controverses":
            focus = [cible] if cible else list(a.valeurs)
            res = [esg.evaluer_controverses(v, t) for t in focus if not v.dp.asset[t]["asset_class"].startswith("etf_bond")]
            res = [r for r in res if r is not None]
            if not res:
                add(c, "non_applicable", None, None, None, "Aucun titre concerné.", unite="texte")
                continue
            order = {"depassee": 0, "donnees_insuffisantes": 1, "approchee": 2, "respectee": 3, "non_applicable": 4}
            r = min(res, key=lambda x: order[x["statut"]])
            add(c, r["statut"], None, None, None, r["explication"], r["preuves"], unite="texte")
        elif c.type == "esg_exclusion_secteurs":
            excl = set(p["secteurs"])
            direct = sum(x for t, x in a.valeurs.items()
                         if v.dp.asset[t]["asset_class"] == "equity" and v.dp.asset[t]["sector"] in excl) / a.total_cad * 100
            total = sum(a.expo["secteurs"].get(s, 0) for s in excl) * 100
            st = "depassee" if direct > 0 else ("approchee" if total > 0 else "respectee")
            ev = expo_ev("part_secteurs_exclus", "Part dans les secteurs exclus", {"direct_pct": direct, "total_via_fnb_pct": total,
                                                                                    "secteurs": sorted(excl)})
            add(c, st, None, total, 0.0,
                f"Secteurs exclus ({', '.join(sorted(excl))}) : {_fmt(direct)} % en direct, {_fmt(total)} % au total via les FNB.", [ev])
    return out, _dedupe(proofs)


def _dedupe(evs: list[Evidence]) -> list[Evidence]:
    seen, out = set(), []
    for e in evs:
        if e.id not in seen:
            seen.add(e.id)
            out.append(e)
    return out
