"""Market regime (descriptive): Gaussian mixture with 3 components on weekly market features.

Features (each available at the end of the week, macro with its publication lag):
  S&P 500 (SPY, USD) 4-week return and realised volatility, S&P/TSX 60 (XIU) 4-week return and
  realised volatility, U.S. and Canadian 10y-2y yield slopes.
Fitted on an expanding window (data up to the first day of the simulation month, minimum 3 years),
standardised with training moments; components ordered by average S&P 500 volatility and named
« calme », « agité », « tendu ». It describes the present; it predicts nothing.
Reference: Bishop (2006), Pattern Recognition and Machine Learning, ch. 9 (mixtures, EM).
"""
from __future__ import annotations

import math

import numpy as np
from sklearn.mixture import GaussianMixture

from ulysse.config import SEED
from ulysse.data.datapack import AsOf, Datapack
from ulysse.evidence import Evidence, evidence, insufficient

REF_GMM = "Bishop (2006), Pattern Recognition and Machine Learning, ch. 9 ; implémentation scikit-learn."
NAMES = ["calme", "agité", "tendu"]
FEATS = ["spy_rend_4s", "spy_vol_4s", "xiu_rend_4s", "xiu_vol_4s", "pente_us_10a_2a", "pente_ca_10a_2a"]
MIN_WEEKS = 156


def _macro_on(v: AsOf, sid: str, days: np.ndarray) -> np.ndarray:
    """Value known at each day (as-of each day: last observation with available_from <= day)."""
    m = v.dp.macro[sid]
    avail = np.array(m["available_from"], dtype="datetime64[D]")
    vals = np.array(m["value"], dtype=float)
    order = np.argsort(avail, kind="stable")
    avail, vals = avail[order], vals[order]
    k = np.searchsorted(avail, days, side="right") - 1
    out = np.where(k >= 0, vals[np.clip(k, 0, None)], np.nan)
    return out


def weekly_features(dp: Datapack) -> tuple[np.ndarray, np.ndarray]:
    v = dp.asof(None)
    cal = dp.calendar
    wk = cal.astype("datetime64[W]")
    ends = np.flatnonzero(np.r_[wk[1:] != wk[:-1], True])
    days = cal[ends]
    out = np.full((len(ends), len(FEATS)), np.nan)
    for j, t in enumerate(["SPY", "XIU.TO"]):
        lv = v.series(t, "adj", "local")
        r = np.r_[np.nan, lv[1:] / lv[:-1] - 1]
        for k, i in enumerate(ends):
            if i < 25:
                continue
            out[k, 2 * j] = lv[i] / lv[i - 20] - 1
            out[k, 2 * j + 1] = np.nanstd(r[i - 19:i + 1], ddof=1) * math.sqrt(252)
    out[:, 4] = _macro_on(v, "DGS10", days) - _macro_on(v, "DGS2", days)
    out[:, 5] = _macro_on(v, "BD.CDN.10YR.DQ.YLD", days) - _macro_on(v, "BD.CDN.2YR.DQ.YLD", days)
    return days, out


_CACHE: dict = {}


def _fit(dp: Datapack, fit_day: np.datetime64):
    key = (str(dp.path), str(fit_day))
    if key in _CACHE:
        return _CACHE[key]
    days, X = weekly_features(dp)
    tr = (days < fit_day) & ~np.isnan(X).any(axis=1)
    if tr.sum() < MIN_WEEKS:
        _CACHE[key] = None
        return None
    mu, sd = X[tr].mean(axis=0), X[tr].std(axis=0)
    g = GaussianMixture(n_components=3, covariance_type="full", n_init=5, random_state=SEED).fit((X[tr] - mu) / sd)
    order = np.argsort(g.means_[:, 1])          # by average S&P 500 volatility (standardised)
    raw_means = g.means_ * sd + mu                # component centres in original units (for transparency)
    _CACHE[key] = (g, mu, sd, order, int(tr.sum()), raw_means)
    return _CACHE[key]


def ev_regime(v: AsOf) -> Evidence:
    month_start = np.datetime64(str(v.day)[:7] + "-01")
    fit = _fit(v.dp, month_start)
    p = {"composantes": 3, "variables": FEATS, "frequence": "hebdomadaire", "graine": SEED,
         "entraine_jusqu_au": str(month_start), "reentrainement": "mensuel, fenêtre croissante"}
    base = dict(mesure="regime_marche", libelle="Climat de marché (descriptif)", sujet="marche", as_of=str(v.day),
                donnees_source=["S1+S2:adj_close[SPY,XIU.TO]", "S1+S4:DGS10,DGS2", "S1+S3:BD.CDN.10YR,BD.CDN.2YR"],
                methode="melange_gaussien_3_composantes", parametres=p, reference=REF_GMM)
    if fit is None:
        return insufficient(**base, unite="texte", date_de_calcul=v.date, note=f"moins de {MIN_WEEKS} semaines d'entraînement")
    g, mu, sd, order, n, raw_means = fit
    days, X = weekly_features(v.dp)
    k = int(np.searchsorted(days, v.day, side="right")) - 1
    while k >= 0 and np.isnan(X[k]).any():
        k -= 1
    proba = g.predict_proba(((X[k] - mu) / sd).reshape(1, -1))[0]
    rank = {int(c): r for r, c in enumerate(order)}
    probs = {NAMES[rank[c]]: float(proba[c] * 100) for c in range(3)}
    current = max(probs, key=probs.get)
    labels = [NAMES[rank[int(c)]] for c in g.predict((X[: k + 1][~np.isnan(X[: k + 1]).any(axis=1)] - mu) / sd)]
    streak = 1
    for x in reversed(labels[:-1]):
        if x != current:
            break
        streak += 1
    p["n_semaines_entrainement"] = n
    profils = {NAMES[rank[c]]: {"vol_sp500_pct": float(raw_means[c, 1] * 100), "vol_tsx60_pct": float(raw_means[c, 3] * 100),
                                "pente_us_pts": float(raw_means[c, 4]), "pente_ca_pts": float(raw_means[c, 5])} for c in range(3)}
    return evidence(**base, valeur={"regime": current, "probabilites_pct": probs, "semaines_consecutives": streak,
                                    "profils_regimes": profils,
                                    "variables_semaine": {f: float(X[k, j]) for j, f in enumerate(FEATS)}},
                    unite="texte", date_de_calcul=str(days[k]))
