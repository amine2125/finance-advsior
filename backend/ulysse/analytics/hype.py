"""« Tout le monde en parle ? » — unsupervised detection of unusual attention.

Isolation Forest (Liu, Ting & Zhou 2008, ICDM) fitted per asset on its OWN past only (expanding
window, refitted at most once a month on data available at the first session of the month), on
attention features: Wikipedia views (published D+1), traded volume, size of the move, recent
volatility. The model flags what is unusual; a written rule then decides whether it is *attention*
(« engouement ») rather than any anomaly:

    engouement  <=>  anomaly score in the most unusual 5 % of the asset's own history
                     AND (views >= 1.5 x their usual level OR volume >= 1.5 x its usual level)

It says nothing about direction or future prices.
"""
from __future__ import annotations

import math
from functools import lru_cache

import numpy as np
from sklearn.ensemble import IsolationForest

from ulysse.config import SEED
from ulysse.data.datapack import AsOf, Datapack
from ulysse.evidence import Evidence, evidence, insufficient

REF_IF = "Liu, Ting & Zhou (2008), Isolation Forest, IEEE ICDM ; implémentation scikit-learn."
FEATURES = ["log_ratio_vues_7j", "log_ratio_volume_5j", "rendement_20j", "ampleur_mouvement_z", "ratio_volatilite_20j_1an"]
SEUIL_ATTENTION = 1.5
QUANTILE_ANOMALIE = 0.05
MIN_TRAIN = 250


def _rolling_median(x: np.ndarray, w: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    for i in range(w, len(x) + 1):
        seg = x[i - w:i]
        seg = seg[~np.isnan(seg)]
        if len(seg) >= w // 2:
            out[i - 1] = np.median(seg)
    return out


@lru_cache(maxsize=64)
def _feature_table(dp_path: str, ticker: str) -> tuple[np.ndarray, np.ndarray]:
    """Feature rows for every master-calendar day (computed with information available that day)."""
    dp = Datapack(dp_path)
    v = dp.asof(None)
    cal = dp.calendar
    lv = v.series(ticker, "adj", "local")
    traded = v.traded(ticker) & ~np.isnan(lv)
    vol = v.volume(ticker)
    n = len(cal)
    feats = np.full((n, len(FEATURES)), np.nan)
    # price/volume features on the asset's own sessions
    idx = np.flatnonzero(traded)
    if len(idx) > 300:
        lvl, vv = lv[idx], vol[idx].astype(float)
        r = np.r_[np.nan, lvl[1:] / lvl[:-1] - 1]
        for k in range(260, len(idx)):
            i = idx[k]
            med_vol = np.median(vv[k - 65:k - 5]) if k >= 65 else np.nan
            v5 = vv[k - 4:k + 1].mean()
            feats[i, 1] = math.log(v5 / med_vol) if med_vol and med_vol > 0 and v5 > 0 else np.nan
            feats[i, 2] = lvl[k] / lvl[k - 20] - 1
            sd60 = np.nanstd(r[k - 60:k], ddof=1)
            feats[i, 3] = abs(r[k]) / sd60 if sd60 > 0 else np.nan
            sd20, sd252 = np.nanstd(r[k - 19:k + 1], ddof=1), np.nanstd(r[k - 251:k + 1], ddof=1)
            feats[i, 4] = sd20 / sd252 if sd252 > 0 else np.nan
    # attention features: views published D+1 -> at day D use views up to D-1
    pv = np.load(dp.path / "pageviews.npy", mmap_mode="r")[:, dp.col(ticker)].astype(float)
    if not np.isnan(pv).all():
        days = dp.pv_days
        base = _rolling_median(pv, 90)
        att = np.convolve(np.nan_to_num(pv, nan=0.0), np.ones(7) / 7, mode="full")[: len(pv)]
        for i, d in enumerate(cal):
            j = int(np.searchsorted(days, d)) - 1          # index of D-1
            if j - 8 < 90 or j < 0:
                continue
            b = base[j - 7]                                  # usual level, measured before the last week
            if b and b > 0 and not np.isnan(b) and att[j] > 0:
                feats[i, 0] = math.log(att[j] / b)
    return cal, feats


def _model(dp: Datapack, ticker: str, fit_day: np.datetime64) -> tuple[IsolationForest | None, list[int], float, int]:
    cal, feats = _feature_table(str(dp.path), ticker)
    cols = [k for k in range(len(FEATURES)) if not np.isnan(feats[:, k]).all()]
    train = feats[cal < fit_day][:, cols]
    train = train[~np.isnan(train).any(axis=1)]
    if len(train) < MIN_TRAIN:
        return None, cols, float("nan"), len(train)
    m = IsolationForest(n_estimators=200, random_state=SEED).fit(train)
    thr = float(np.quantile(m.score_samples(train), QUANTILE_ANOMALIE))
    return m, cols, thr, len(train)


_MODELS: dict = {}


def ev_engouement(v: AsOf, ticker: str) -> Evidence:
    dp = v.dp
    month_start = np.datetime64(str(v.day)[:7] + "-01")
    key = (ticker, str(month_start), str(dp.path))
    if key not in _MODELS:
        _MODELS[key] = _model(dp, ticker, month_start)
    m, cols, thr, n_train = _MODELS[key]
    cal, feats = _feature_table(str(dp.path), ticker)
    i = v.t_end
    srcs = [f"S1+S2:adj_close[{ticker}]", f"S1+S2:volume[{ticker}]"]
    if 0 in cols:
        srcs.append(f"S5:pages_vues[{dp.asset[ticker].get('wikipedia')}]")
    p = {"modele": "IsolationForest(n_estimators=200)", "graine": SEED, "reentrainement": "mensuel, historique propre au titre",
         "quantile_anomalie": QUANTILE_ANOMALIE, "seuil_attention": SEUIL_ATTENTION, "variables": [FEATURES[k] for k in cols],
         "entraine_jusqu_au": str(month_start), "n_entrainement": n_train}
    base = dict(mesure="engouement", libelle="Attention inhabituelle (engouement)", sujet=ticker, as_of=str(v.day),
                donnees_source=srcs, methode="isolation_forest_plus_regle_attention", parametres=p, reference=REF_IF)
    row = feats[i, cols]
    if m is None or np.isnan(row).any():
        return insufficient(**base, unite="score", date_de_calcul=v.date,
                            note=f"historique propre insuffisant ({n_train} jours d'entraînement, {MIN_TRAIN} requis)")
    score = float(m.score_samples(row.reshape(1, -1))[0])
    past = feats[:i][:, cols]
    past = past[~np.isnan(past).any(axis=1)]
    plus_inhabituel_que = float((m.score_samples(past) > score).mean() * 100) if len(past) else float("nan")
    ratios = {FEATURES[k]: float(feats[i, k]) for k in cols}
    vues = math.exp(ratios["log_ratio_vues_7j"]) if "log_ratio_vues_7j" in ratios else None
    volume = math.exp(ratios["log_ratio_volume_5j"]) if "log_ratio_volume_5j" in ratios else None
    anomalie = score <= thr
    attention = (vues is not None and vues >= SEUIL_ATTENTION) or (volume is not None and volume >= SEUIL_ATTENTION)
    val = {"engouement": bool(anomalie and attention), "anomalie": bool(anomalie), "attention_elevee": bool(attention),
           "plus_inhabituel_que_pct_des_jours": plus_inhabituel_que,
           "vues_vs_habituel": vues, "volume_vs_habituel": volume,
           "rendement_20j_pct": ratios["rendement_20j"] * 100, "ampleur_mouvement_z": ratios["ampleur_mouvement_z"],
           "volatilite_20j_vs_1an": ratios["ratio_volatilite_20j_1an"]}
    return evidence(**base, valeur=val, unite="score", date_de_calcul=v.date)
