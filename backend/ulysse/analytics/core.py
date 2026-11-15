"""Asset-level analysis tools. Code computes, never the LLM. Every function takes an `AsOf` view
(only information published at the simulation date) and returns Evidence objects.

References (also in docs/technique.md):
- Annualised volatility: standard deviation of daily returns x sqrt(252).
- Maximum drawdown: largest peak-to-trough fall of a total-return index (Bacon 2008, Practical
  Portfolio Performance Measurement and Attribution, ch. 4).
- Historical expected shortfall / CVaR: Acerbi & Tasche (2002), J. Banking & Finance 26(7).
- EWMA volatility, lambda = 0.94 for daily data: J.P. Morgan/Reuters, RiskMetrics Technical
  Document (1996), 4th ed.
"""
from __future__ import annotations

import math

import numpy as np

from ulysse.config import ANNUALIZATION
from ulysse.data.datapack import AsOf
from ulysse.evidence import Evidence, evidence, insufficient

REF_VOL = "Écart-type des rendements quotidiens × √252 (convention usuelle)."
REF_MDD = "Bacon (2008), Practical Portfolio Performance Measurement and Attribution, ch. 4."
REF_ES = "Acerbi & Tasche (2002), On the coherence of expected shortfall, J. Banking & Finance 26(7)."
REF_EWMA = "J.P. Morgan/Reuters (1996), RiskMetrics — Technical Document, 4e éd. (λ = 0,94)."


def src(v: AsOf, t: str, currency: str = "CAD") -> list[str]:
    a = v.dp.asset[t]
    s = [f"S1+S2:adj_close[{t}]"]
    if currency == "CAD" and a["currency"] == "USD":
        s.append("S1+S3:FXUSDCAD")
    return s


def returns(v: AsOf, t: str, currency: str = "CAD", last: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Simple returns between consecutive sessions on which the asset actually traded."""
    lv = v.series(t, "adj", currency)
    ok = v.traded(t) & ~np.isnan(lv)
    idx = np.flatnonzero(ok)
    if len(idx) < 2:
        return np.array([], dtype="datetime64[D]"), np.array([])
    lvl = lv[idx]
    r = lvl[1:] / lvl[:-1] - 1.0
    d = v.dates[idx][1:]
    if last is not None:
        r, d = r[-last:], d[-last:]
    return d, r


def _period(d: np.ndarray) -> tuple[str, str] | None:
    return (str(d[0]), str(d[-1])) if len(d) else None


def volatilite(v: AsOf, t: str, window: int = 252, currency: str = "CAD") -> Evidence:
    d, r = returns(v, t, currency, window)
    p = {"fenetre_seances": window, "annualisation": ANNUALIZATION, "devise_calcul": currency}
    base = dict(mesure="volatilite_annualisee", libelle="Volatilité annualisée", sujet=t, as_of=str(v.day),
                donnees_source=src(v, t, currency), methode="ecart_type_rendements_quotidiens", parametres=p,
                reference=REF_VOL)
    if len(r) < int(0.8 * window):
        return insufficient(**base, unite="%", date_de_calcul=v.date,
                            note=f"{len(r)} séances disponibles, {int(0.8 * window)} requises")
    vol = float(np.std(r, ddof=1) * math.sqrt(ANNUALIZATION) * 100)
    return evidence(**base, valeur=vol, unite="%", date_de_calcul=str(d[-1]), periode=_period(d))


def pire_baisse(v: AsOf, t: str, years: float | None = None, currency: str = "CAD") -> Evidence:
    """Worst peak-to-trough fall of the total-return index over the window (whole history if None)."""
    lv = v.series(t, "adj", currency)
    ok = v.traded(t) & ~np.isnan(lv)
    idx = np.flatnonzero(ok)
    dates = v.dates[idx]
    lvl = lv[idx]
    if years is not None and len(dates):
        start = v.day - np.timedelta64(int(round(years * 365.25)), "D")
        keep = dates >= start
        dates, lvl = dates[keep], lvl[keep]
    p = {"fenetre_annees": years, "devise_calcul": currency}
    base = dict(mesure="pire_baisse", libelle="Pire baisse historique (sommet → creux)", sujet=t, as_of=str(v.day),
                donnees_source=src(v, t, currency), methode="drawdown_maximal_indice_rendement_total",
                parametres=p, reference=REF_MDD)
    if len(lvl) < 60:
        return insufficient(**base, unite="%", date_de_calcul=v.date, note=f"{len(lvl)} séances disponibles, 60 requises")
    peak = np.maximum.accumulate(lvl)
    dd = lvl / peak - 1.0
    it = int(np.argmin(dd))
    ip = int(np.argmax(lvl[: it + 1]))
    rec = np.flatnonzero(lvl[it:] >= lvl[ip])
    recovery = str(dates[it + rec[0]]) if len(rec) else None
    val = {"baisse_pct": float(dd[it] * 100), "date_sommet": str(dates[ip]), "date_creux": str(dates[it]),
           "date_retour_au_sommet": recovery,
           "jours_sommet_creux": int((dates[it] - dates[ip]).astype(int)),
           "jours_creux_retour": int((dates[it + rec[0]] - dates[it]).astype(int)) if len(rec) else None}
    return evidence(**base, valeur=val, unite="%", date_de_calcul=str(dates[-1]), periode=_period(dates))


def cvar(v: AsOf, t: str, alpha: float = 0.95, horizon: int = 1, years: float = 5.0, currency: str = "CAD") -> Evidence:
    """Average loss in the worst (1 - alpha) share of historical periods of `horizon` sessions."""
    lv = v.series(t, "adj", currency)
    idx = np.flatnonzero(v.traded(t) & ~np.isnan(lv))
    dates, lvl = v.dates[idx], lv[idx]
    start = v.day - np.timedelta64(int(years * 365.25), "D")
    keep = dates >= start
    dates, lvl = dates[keep], lvl[keep]
    p = {"alpha": alpha, "horizon_seances": horizon, "fenetre_annees": years, "devise_calcul": currency}
    base = dict(mesure="cvar_historique", libelle=f"Perte moyenne des {round((1 - alpha) * 100)} % pires périodes de {horizon} séance(s)",
                sujet=t, as_of=str(v.day), donnees_source=src(v, t, currency), methode="expected_shortfall_historique",
                parametres=p, reference=REF_ES)
    if len(lvl) <= horizon + 100:
        return insufficient(**base, unite="%", date_de_calcul=v.date, note="historique trop court")
    rh = lvl[horizon:] / lvl[:-horizon] - 1.0          # overlapping periods
    losses = -rh
    var = float(np.quantile(losses, alpha))
    es = float(losses[losses >= var].mean())
    return evidence(**base, valeur={"cvar_pct": -es * 100, "var_pct": -var * 100, "n_periodes": int(len(rh))},
                    unite="%", date_de_calcul=str(dates[-1]), periode=_period(dates))


def ewma(v: AsOf, t: str, lam: float = 0.94, ratio_seuil: float = 1.25, currency: str = "CAD") -> list[Evidence]:
    """Current EWMA volatility and its ratio to the trailing one-year realised volatility."""
    d, r = returns(v, t, currency)
    p = {"lambda": lam, "seuil_hausse": ratio_seuil, "reference": "volatilite realisee 252 seances"}
    base = dict(sujet=t, as_of=str(v.day), donnees_source=src(v, t, currency), methode="ewma_riskmetrics",
                reference=REF_EWMA)
    if len(r) < 300:
        e = insufficient(mesure="volatilite_ewma", libelle="Volatilité récente (EWMA)", unite="%", parametres=p,
                         date_de_calcul=v.date, note=f"{len(r)} séances, 300 requises", **base)
        return [e]
    s2 = float(np.var(r[:60], ddof=1))
    for x in r[60:]:
        s2 = lam * s2 + (1 - lam) * float(x) ** 2
    cur = math.sqrt(s2 * ANNUALIZATION) * 100
    ref = float(np.std(r[-252:], ddof=1) * math.sqrt(ANNUALIZATION) * 100)
    ratio = cur / ref if ref > 0 else float("nan")
    e1 = evidence(mesure="volatilite_ewma", libelle="Volatilité récente (EWMA)", valeur=cur, unite="%",
                  date_de_calcul=str(d[-1]), parametres=p, periode=_period(d), **base)
    e2 = evidence(mesure="ratio_risque_recent", libelle="Volatilité récente ÷ volatilité sur 1 an", valeur=ratio,
                  unite="ratio", date_de_calcul=str(d[-1]), parametres=p, periode=_period(d[-252:]), **base,
                  note="hausse du risque" if ratio >= ratio_seuil else None)
    return [e1, e2]


def rendement_total(v: AsOf, t: str, years: float, currency: str = "CAD") -> Evidence:
    """Past total return over a stated window (descriptive only: past returns do not predict)."""
    lv = v.series(t, "adj", currency)
    idx = np.flatnonzero(v.traded(t) & ~np.isnan(lv))
    dates, lvl = v.dates[idx], lv[idx]
    start = v.day - np.timedelta64(int(round(years * 365.25)), "D")
    p = {"fenetre_annees": years, "devise_calcul": currency}
    base = dict(mesure="rendement_total_passe", libelle=f"Rendement total passé sur {years:g} an(s)", sujet=t,
                as_of=str(v.day), donnees_source=src(v, t, currency), methode="variation_indice_rendement_total",
                parametres=p, reference="Rendement total = variation de prix + revenus réinvestis (adj_close).")
    if not len(dates) or dates[0] > start:
        return insufficient(**base, unite="%", date_de_calcul=v.date, note="historique plus court que la période")
    i0 = int(np.searchsorted(dates, start, side="right")) - 1
    tot = lvl[-1] / lvl[i0] - 1.0
    val = {"total_pct": float(tot * 100)}
    if years > 1:
        val["annualise_pct"] = float(((1 + tot) ** (1 / years) - 1) * 100)
    return evidence(**base, valeur=val, unite="%", date_de_calcul=str(dates[-1]), periode=(str(dates[i0]), str(dates[-1])))


def prix(v: AsOf, t: str) -> Evidence:
    a = v.dp.asset[t]
    loc = v.series(t, "close", "local")
    cad = v.series(t, "close", "CAD")
    idx = np.flatnonzero(v.traded(t) & ~np.isnan(loc))
    base = dict(mesure="prix_cloture", libelle="Dernier cours de clôture", sujet=t, as_of=str(v.day),
                donnees_source=[f"S1+S2:close[{t}]"] + (["S1+S3:FXUSDCAD"] if a["currency"] == "USD" else []),
                methode="derniere_cloture_disponible", reference="Cours de clôture ajusté des fractionnements (Yahoo).")
    if not len(idx):
        return insufficient(**base, unite="$", date_de_calcul=v.date, note="aucune cotation à cette date")
    i = idx[-1]
    return evidence(**base, valeur={"local": float(loc[i]), "devise_locale": a["currency"], "cad": float(cad[i])},
                    unite="$", devise=a["currency"], date_de_calcul=str(v.dates[i]))


def rendement_dividende(v: AsOf, t: str) -> Evidence:
    """Trailing 12-month dividends / last close (descriptive)."""
    a = v.dp.asset[t]
    end = v.day
    start = end - np.timedelta64(365, "D")
    divs = [x for x in v.dp.actions if x["ticker"] == t and x["action"] == "dividend"
            and start < np.datetime64(x["ex_date"]) <= end]
    loc = v.series(t, "close", "local")
    last = loc[~np.isnan(loc)]
    base = dict(mesure="rendement_dividende_12m", libelle="Dividendes des 12 derniers mois ÷ cours", sujet=t,
                as_of=str(v.day), donnees_source=[f"S1+S2:corporate_actions[{t}]", f"S1+S2:close[{t}]"],
                methode="somme_dividendes_12m_sur_cours", parametres={"fenetre_jours": 365},
                reference="Rendement en dividendes courant (trailing), par date ex-dividende.")
    if a["asset_class"] == "crypto":
        return evidence(**base, valeur=0.0, unite="%", date_de_calcul=v.date, statut="non_applicable",
                        note="un cryptoactif ne verse pas de dividende")
    if not len(last):
        return insufficient(**base, unite="%", date_de_calcul=v.date, note="aucun cours")
    total = sum(x["value"] for x in divs)
    return evidence(**base, valeur=float(total / last[-1] * 100), unite="%", devise=a["currency"],
                    date_de_calcul=str(v.date), periode=(str(start), str(end)))
