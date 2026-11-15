"""Lens 1 (fundamentals, SEC EDGAR XBRL) and Lens 2 (reverse DCF) - US operating companies only."""
from __future__ import annotations


import pandas as pd

from ...data.loader import MarketData
from ...fundamentals_providers import edgar
from ...methodology import METHODOLOGY
from ...models import InfoClass, LensStatus
from .. import fundamentals as F
from ..ledger import MetricLedger
from ..risk import beta, simple_returns
from ..valuation import dcf_value, implied_growth

L1_BLIND = ["Ne dit rien du prix payé", "Rétrospectif, avec un délai de publication",
            "Pénalise les entreprises dont les actifs sont surtout incorporels"]
L2_BLIND = ["Pièges de valeur", "Le moment (timing)", "Fausse précision: ~3/4 de la valeur vient d'années imprévisibles"]


def applicability(md: MarketData, asset_id: str) -> tuple[str, str]:
    meta = md.asset(asset_id)
    if meta["asset_class"] == "crypto":
        return LensStatus.NOT_APPLICABLE.value, "Cryptoactif: aucun flux de trésorerie, l'analyse fondamentale ne s'applique pas"
    if meta["asset_class"] == "etf":
        return LensStatus.NOT_APPLICABLE.value, "FNB: analyser l'émetteur et la composition (non connectée), pas des états financiers"
    if not meta.get("cik"):
        return LensStatus.UNAVAILABLE.value, ("Émetteur canadien: aucune source structurée légalement accessible connectée "
                                              "(SEDAR+ n'offre pas d'API publique)")
    return "APPLICABLE", ""


def run(md: MarketData, asset_id: str, as_of: pd.Timestamp, led: MetricLedger, beta_value: float | None) -> tuple[dict, dict]:
    status, reason = applicability(md, asset_id)
    if status != "APPLICABLE":
        return ({"lens": 1, "status": status, "reason": reason, "blind_spots": L1_BLIND},
                {"lens": 2, "status": status, "reason": reason, "blind_spots": L2_BLIND})
    cik = md.asset(asset_id)["cik"]
    try:
        st = edgar.annual_statements(cik, as_of.date())
        sic = edgar.sic_code(cik)
    except edgar.ProviderError as exc:
        msg = f"SEC EDGAR indisponible: {exc}"
        return ({"lens": 1, "status": LensStatus.UNAVAILABLE.value, "reason": msg, "blind_spots": L1_BLIND},
                {"lens": 2, "status": LensStatus.UNAVAILABLE.value, "reason": msg, "blind_spots": L2_BLIND})
    periods = st["periods"]
    if len(periods) < 2:
        msg = "Moins de deux exercices annuels déposés avant la date d'analyse"
        return ({"lens": 1, "status": LensStatus.UNAVAILABLE.value, "reason": msg, "blind_spots": L1_BLIND},
                {"lens": 2, "status": LensStatus.UNAVAILABLE.value, "reason": msg, "blind_spots": L2_BLIND})
    src_id = f"sec_companyfacts_{cik}"
    t, t1 = periods[0], periods[1]
    t2 = periods[2] if len(periods) > 2 else None
    p = f"asset.{asset_id}.fund"
    win = (t1["period_end"], t["period_end"])
    rf_row = md.macro_value("US_TREASURY_10Y", as_of)
    rf = rf_row["value"] / 100 if rf_row else None
    erp = METHODOLOGY["valuation"]["equity_risk_premium"]
    # CAPM beta against the broad US market (SPY, native USD returns, 3 years), not the persona benchmark
    capm_beta = None
    if md.has_asset("SPY"):
        a_r = simple_returns(md.native_series(asset_id, "adj_close")[lambda s: s.index <= as_of]).iloc[-756:]
        m_r = simple_returns(md.native_series("SPY", "adj_close")[lambda s: s.index <= as_of]).iloc[-756:]
        b = beta(a_r, m_r)
        capm_beta = b["beta"] if b else None
    beta_value = capm_beta if capm_beta is not None else beta_value
    coe = rf + (beta_value if beta_value is not None else 1.0) * erp if rf is not None else None
    q = F.quality_metrics(periods, coe)
    financial = F.is_financial(sic)
    price, pdate = md.last_price(asset_id, as_of, "close")
    shares = st["shares_outstanding"]["value"] if st["shares_outstanding"] else t.get("shares_diluted")
    mcap = price * shares if shares else None
    z = {"status": LensStatus.NOT_APPLICABLE.value, "reason": "Société financière: Z non valide"} if financial else \
        F.altman_z(t, mcap, F.is_manufacturer(sic))
    m = {"status": LensStatus.NOT_APPLICABLE.value, "reason": "Société financière: M-score non valide"} if financial else F.beneish_m(t, t1)
    f = F.piotroski_f(t, t1, t2)
    def add(key, label, val, unit, method):
        led.add(f"{p}.{key}", f"{label} {asset_id}", val, unit, method, window=win, assets=[asset_id], source_ids=[src_id],
                info_class=InfoClass.COMPUTED_RESULT)
    add("revenue_cagr", "Croissance annuelle composée du chiffre d'affaires", q.get("revenue_cagr"), "pct", "(CA_t/CA_t−n)^(1/n) − 1")
    add("op_margin", "Marge opérationnelle", q.get("operating_margin"), "pct", "résultat opérationnel / CA")
    add("roic", "ROIC", q.get("roic"), "pct", "NOPAT / (capitaux propres + dette − trésorerie)")
    add("cash_conversion", "Conversion en trésorerie", q.get("cash_conversion"), "ratio", "FCF / résultat net")
    add("net_debt_ebitda", "Dette nette / BAIIA", q.get("net_debt_to_ebitda"), "x", "(dette − trésorerie) / BAIIA")
    add("interest_cov", "Couverture des intérêts", q.get("interest_coverage"), "x", "BAII / charges d'intérêts")
    add("accruals", "Ratio de régularisations", q.get("accrual_ratio"), "ratio", "(RN − FTO) / actif total")
    add("share_change", "Variation du nombre d'actions", q.get("share_count_change"), "pct", "actions diluées t / t−n − 1")
    if z.get("value") is not None:
        add("altman", f"Altman {z['variant']}", z["value"], "ratio", z["variant"])
    if m.get("value") is not None:
        add("beneish", "Beneish M-score", m["value"], "ratio", "8 ratios, seuil −1,78")
    if f.get("value") is not None:
        add("piotroski", "Piotroski F-score", f["value"], "count", "9 tests binaires")
    filing_info = {"period_end": t["period_end"], "filed": t["filed"], "accession_numbers": t["accession_numbers"],
                   "source_url": st["source_url"], "retrieved_at": st["retrieved_at"], "sic": sic,
                   "point_in_time_rule": "un état n'est connu qu'à partir de sa date de dépôt"}
    lens1 = {"lens": 1, "status": LensStatus.COMPUTED.value, "entity": st["entity"], "filing": filing_info, "quality": q,
             "altman": z, "beneish": m, "piotroski": f, "financial_firm": financial, "source_id": src_id,
             "periods_used": [{"period_end": x["period_end"], "filed": x["filed"]} for x in periods],
             "wording_rule": "Scores = signaux de dépistage (« signalé pour revue »), jamais « fraude » ni « faillite »",
             "blind_spots": L1_BLIND, "metric_ids": [k for k in led.ids() if k.startswith(p)]}
    # ---- lens 2: reverse DCF
    fcf0 = q.get("free_cash_flow")
    nd = q.get("net_debt")
    if financial or fcf0 is None or fcf0 <= 0 or shares is None or coe is None or nd is None:
        why = ("Société financière: le DCF sur flux libres ne s'applique pas" if financial else
               "FCF non positif, actions, dette nette ou taux sans risque manquants")
        lens2 = {"lens": 2, "status": LensStatus.NOT_APPLICABLE.value if financial else LensStatus.UNAVAILABLE.value,
                 "reason": why, "blind_spots": L2_BLIND}
        return lens1, lens2
    cfg = METHODOLOGY["valuation"]
    g, n = cfg["terminal_growth"], cfg["forecast_years"]
    implied = implied_growth(price, fcf0, n, coe, g, nd, shares)
    base = dcf_value(fcf0, implied if implied is not None else 0.0, n, coe, g, nd, shares)
    grid_r = [round(coe - 0.01, 4), round(coe, 4), round(coe + 0.01, 4)]
    grid_g = [g - 0.005, g, g + 0.005]
    grid = []
    for r in grid_r:
        row = {"r": r}
        for gg in grid_g:
            row[f"{gg:.3f}"] = implied_growth(price, fcf0, n, r, gg, nd, shares)
        grid.append(row)
    led.add(f"asset.{asset_id}.val.implied_growth", f"Croissance implicite du FCF sur {n} ans {asset_id}", implied, "pct",
            "DCF inversé: croissance qui égalise valeur/action et cours", window=(None, pdate.date().isoformat()), assets=[asset_id],
            params={"r": coe, "g": g, "years": n}, source_ids=[src_id, "dataset_prices", rf_row["source_id"]])
    led.add(f"asset.{asset_id}.val.terminal_share", f"Part de la valeur terminale {asset_id}", base["terminal_share"], "pct",
            "VA(valeur terminale)/valeur d'entreprise", assets=[asset_id], source_ids=[src_id])
    lens2 = {"lens": 2, "status": LensStatus.COMPUTED.value, "price": price, "price_date": pdate.date().isoformat(),
             "fcf0": fcf0, "net_debt": nd, "shares": shares, "discount_rate": coe, "terminal_growth": g, "years": n,
             "risk_free": rf_row, "erp": erp, "erp_source": cfg["erp_source"], "beta_used": beta_value,
             "implied_growth": implied, "terminal_share": base["terminal_share"],
             "implied_growth_grid": {"r_values": grid_r, "g_values": grid_g, "rows": grid},
             "statement": (f"Le cours actuel implique une croissance annuelle du flux de trésorerie disponible de "
                           f"{implied * 100:.1f} % pendant {n} ans, avec r = {coe * 100:.1f} % et g = {g * 100:.1f} %."
                           if implied is not None else "Aucune croissance dans [−50 %, +150 %] ne justifie le cours"),
             "never_fair_value": "Aucune « juste valeur » n'est affichée: ce calcul montre ce que le prix suppose déjà.",
             "blind_spots": L2_BLIND, "source_id": src_id}
    return lens1, lens2


