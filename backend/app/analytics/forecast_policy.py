"""Section 8A.1 forecast policy: detection of prediction requests and the deterministic four-part answer."""
from __future__ import annotations

import re

import pandas as pd

from ..data.loader import MarketData
from ..methodology import METHODOLOGY
from .ledger import MetricLedger
from .risk import rolling_window_base_rate

PREDICTION_PATTERNS = [
    r"\bo[uù] (va|ira)\b", r"\bva[- ]t[- ](il|elle) (monter|baisser|grimper|chuter|remonter|s'effondrer|exploser)",
    r"\bpr[ée]vision", r"\bpr[ée]dire\b", r"\bcombien (vaudra|va valoir)", r"\bobjectif de (cours|prix)", r"\bcible de prix",
    r"\bprix (dans|en) \d", r"\bdans (un|1|deux|2|six|6|douze|12) (an|ans|mois|semaine)", r"\bva (monter|baisser|chuter|grimper)",
    r"\bwhere (is|will) .* go", r"\bwill (it|.*) (rise|fall|go up|go down|crash|moon)", r"\bprice target", r"\bforecast",
    r"\bpredict", r"\bva[- ]t[- ]il (crasher|planter)", r"\bfuture price", r"\bprochain(e)? (sommet|record)",
]
_pred_re = re.compile("|".join(PREDICTION_PATTERNS), re.IGNORECASE)


def is_prediction_request(text: str) -> bool:
    return bool(_pred_re.search(text or ""))


POLICY_TABLE = [
    {"object": "Prix dans un jour ou un mois", "predictability": "Quasi nulle", "behaviour": "Jamais prévu"},
    {"object": "Prix dans 12 mois", "predictability": "Faible", "behaviour": "Pas de cible; trois scénarios hypothétiques explicites"},
    {"object": "Volatilité des prochaines semaines", "predictability": "Bonne (regroupement de la volatilité)",
     "behaviour": "Prévision EWMA validée hors échantillon (H1)"},
    {"object": "Fondamentaux sur 1–3 ans", "predictability": "Modérée", "behaviour": "Seulement avec états financiers; fourchettes"},
    {"object": "Classement relatif d'actifs", "predictability": "Faible", "behaviour": "Jamais de « meilleur achat »"},
    {"object": "Détresse financière", "predictability": "Passable", "behaviour": "Scores = signaux, jamais verdicts"},
]


def four_part_answer(md: MarketData, asset_id: str, as_of: pd.Timestamp, led: MetricLedger, h1_result: dict | None = None) -> dict:
    cfg = METHODOLOGY["forecast_policy"]
    meta = md.asset(asset_id)
    prices = md.native_series(asset_id, "adj_close")
    prices = prices[prices.index <= as_of]
    window = 365 if meta["asset_class"] == "crypto" else cfg["base_rate_window_days"]
    br = rolling_window_base_rate(prices, window, cfg["base_rate_loss_threshold"])
    p = f"asset.{asset_id}.base"
    w = (prices.index[0].date().isoformat(), prices.index[-1].date().isoformat())
    if br:
        led.add(f"{p}.windows", f"Fenêtres glissantes de 12 mois observées {asset_id}", br["windows"], "count", "nombre de fenêtres", window=w, assets=[asset_id])
        led.add(f"{p}.loss_hits", f"Fenêtres de 12 mois avec perte ≤ −20 % {asset_id}", br["loss_hits"], "count", "comptage", window=w, assets=[asset_id])
        led.add(f"{p}.p10", f"10e centile des rendements 12 mois {asset_id}", br["p10"], "pct", "quantile empirique", window=w, assets=[asset_id])
        led.add(f"{p}.median", f"Médiane des rendements 12 mois {asset_id}", br["median"], "pct", "quantile empirique", window=w, assets=[asset_id])
        led.add(f"{p}.p90", f"90e centile des rendements 12 mois {asset_id}", br["p90"], "pct", "quantile empirique", window=w, assets=[asset_id])
        led.add(f"{p}.min", f"Pire rendement 12 mois {asset_id}", br["min"], "pct", "minimum empirique", window=w, assets=[asset_id])
    name = meta["name"]
    part1 = (f"Ce qui ne peut pas être connu : le prix futur de {name}. Les meilleurs modèles d'apprentissage automatique "
             "n'expliquent qu'environ 0,4 % de la variation mensuelle des rendements individuels hors échantillon, et seulement "
             "~38 % des cibles de cours à 12 mois des analystes sont atteintes (constats de la littérature, pas des calculs AEGIS). "
             "AEGIS ne donne donc ni cible de cours, ni rendement attendu, ni probabilité de gain.")
    if br:
        fr = lambda x: f"{x * 100:.1f}".replace(".", ",")  # noqa: E731
        part2 = (f"Fourchette historique calculée sur le jeu de données ({w[0]} → {w[1]}) : sur {br['windows']} fenêtres glissantes de 12 mois, "
                 f"{br['loss_hits']} ont connu une perte de 20 % ou plus. 10e centile {fr(br['p10'])} %, médiane {fr(br['median'])} %, "
                 f"90e centile {fr(br['p90'])} %, pire fenêtre {fr(br['min'])} %. Fenêtres chevauchantes : observations non indépendantes, "
                 "et le passé ne garantit pas l'avenir.")
    else:
        part2 = "Historique insuffisant pour calculer des taux de base sur 12 mois."
    if h1_result and h1_result.get("status") == "evaluated":
        part2 += (f" Seule la volatilité est prévisible de façon modeste : l'hypothèse pré-enregistrée H1 (EWMA vs moyenne longue) "
                  f"a été {'confirmée' if h1_result.get('supported') else 'non confirmée'} hors échantillon.")
    part3 = ("Pour explorer : ouvrez le Laboratoire de scénarios et comparez trois scénarios hypothétiques explicites "
             "(par exemple −30 %, 0 %, +20 %) appliqués à votre position, avec leur effet sur le budget de risque de votre profil.")
    part4 = ("Ce qui changerait l'analyse : un événement vérifié et daté (dépôt officiel, résultats publiés), une variation mesurée de "
             "la volatilité ou de la corrélation avec votre portefeuille, ou un changement de vos contraintes (horizon, tolérance).")
    return {"type": "forecast_policy_answer", "asset_id": asset_id, "parts": [
        {"title": "Ce qui ne peut pas être connu", "text": part1},
        {"title": "Fourchette historique (jeu de données)", "text": part2},
        {"title": "Laboratoire de scénarios", "text": part3, "link": f"/scenarios?asset={asset_id}"},
        {"title": "Ce qui changerait l'analyse", "text": part4}],
        "base_rates": br, "policy_table": POLICY_TABLE,
        "metric_ids": [k for k in led.ids() if k.startswith(p)]}
