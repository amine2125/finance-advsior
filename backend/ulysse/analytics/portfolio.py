"""Portfolio-level tools: valuation, look-through ('radiographie'), risk contributions, real bets,
historical replays and block-bootstrap scenarios. All in CAD.

References:
- Euler risk contributions: Maillard, Roncalli & Teïletche (2010), J. Portfolio Management 36(4).
- Correlation distance sqrt((1 - rho) / 2) and hierarchical clustering: López de Prado (2016),
  "Building Diversified Portfolios that Outperform Out of Sample", J. Portfolio Management 42(4).
- Effective number of bets (notion): Meucci (2009), "Managing Diversification", Risk 22(5); here
  measured by the inverse Herfindahl index of risk-contribution shares (simpler, explainable proxy).
- Stationary bootstrap: Politis & Romano (1994), J. American Statistical Association 89(428).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

from ulysse.config import SEED
from ulysse.data.datapack import AsOf, Datapack
from ulysse.evidence import Evidence, evidence, insufficient

REF_RC = "Maillard, Roncalli & Teïletche (2010), J. Portfolio Management 36(4) — contributions d'Euler."
REF_HRP = "López de Prado (2016), J. Portfolio Management 42(4) — distance √((1−ρ)/2), regroupement hiérarchique."
REF_ENB = "Notion de nombre effectif de paris : Meucci (2009), Risk 22(5) ; mesure ici : inverse de l'indice de Herfindahl des parts de risque."
REF_BOOT = "Politis & Romano (1994), The Stationary Bootstrap, JASA 89(428)."

ASSET_CLASS_FR = {"equity": "Actions", "etf_equity": "Actions", "etf_bond": "Obligations",
                  "etf_commodity": "Or", "crypto": "Cryptoactifs", "cash": "Liquidités"}
TECH_SECTORS = ("Information Technology", "Communication Services")


@dataclass
class Holding:
    ticker: str
    quantity: float


@dataclass
class Portfolio:
    holdings: list[Holding]
    cash_cad: float = 0.0
    label: str = "portefeuille"
    meta: dict = field(default_factory=dict)

    def with_order(self, ticker: str, amount_cad: float, v: AsOf) -> "Portfolio":
        """Simulated purchase funded by cash first (then new money). Never a real transaction."""
        px = _price_cad(v, ticker)
        q = amount_cad / px
        hs = [Holding(h.ticker, h.quantity) for h in self.holdings]
        for h in hs:
            if h.ticker == ticker:
                h.quantity += q
                break
        else:
            hs.append(Holding(ticker, q))
        cash = self.cash_cad - amount_cad
        meta = dict(self.meta, new_money=max(0.0, -cash))
        return Portfolio(hs, max(cash, 0.0), self.label + "+ordre", meta)


def from_allocation(dp: Datapack, capital_cad: float, weights: dict[str, float], constituted_on: str,
                    as_of: str | None = None) -> Portfolio:
    """Fictitious portfolio: `capital` split by `weights` (incl. 'CASH') at `constituted_on`;
    if the simulation date is earlier, the portfolio is constituted at the simulation date
    (hypothesis, documented in docs/hypotheses.md)."""
    day = constituted_on
    if as_of is not None and np.datetime64(as_of) < np.datetime64(constituted_on):
        day = as_of
    v0 = dp.asof(day)
    hs = []
    cash = capital_cad * weights.get("CASH", 0.0)
    for t, w in weights.items():
        if t == "CASH" or w <= 0:
            continue
        hs.append(Holding(t, capital_cad * w / _price_cad(v0, t)))
    return Portfolio(hs, cash, meta={"constitue_le": str(v0.date), "capital_initial": capital_cad})


def _price_cad(v: AsOf, t: str) -> float:
    s = v.series(t, "close", "CAD")
    s = s[~np.isnan(s)]
    if not len(s):
        raise ValueError(f"{t}: no price at {v.date}")
    return float(s[-1])


def valuation(v: AsOf, pf: Portfolio) -> dict:
    lines = []
    for h in pf.holdings:
        try:
            px = _price_cad(v, h.ticker)
        except ValueError:
            px = float("nan")
        lines.append({"ticker": h.ticker, "quantite": h.quantity, "prix_cad": px, "valeur_cad": h.quantity * px})
    total = sum(x["valeur_cad"] for x in lines if not math.isnan(x["valeur_cad"])) + pf.cash_cad
    for x in lines:
        x["poids"] = x["valeur_cad"] / total if total else 0.0
    return {"lignes": lines, "liquidites_cad": pf.cash_cad, "total_cad": total,
            "poids_liquidites": pf.cash_cad / total if total else 0.0}


def ev_valeur(v: AsOf, pf: Portfolio) -> Evidence:
    val = valuation(v, pf)
    return evidence(mesure="valeur_portefeuille", libelle="Valeur du portefeuille", sujet=pf.label,
                    valeur={"total_cad": val["total_cad"],
                            "lignes": {x["ticker"]: {"valeur_cad": x["valeur_cad"], "poids_pct": x["poids"] * 100}
                                       for x in val["lignes"]},
                            "liquidites_cad": val["liquidites_cad"], "poids_liquidites_pct": val["poids_liquidites"] * 100},
                    unite="$", devise="CAD", as_of=str(v.day), date_de_calcul=v.date,
                    donnees_source=["S1+S2:close", "S1+S3:FXUSDCAD", "profil:positions (fictives)"],
                    methode="quantites_x_dernier_cours_cad",
                    reference="Valeur = Σ quantité × dernier cours de clôture converti en CAD + liquidités.")


# ---------------------------------------------------------------- look-through ("radiographie")

def look_through(v: AsOf, pf: Portfolio) -> dict:
    """Distribute each line over what it really holds. ETFs with a published composition at the
    simulation date are opened; others stay opaque (declared)."""
    val = valuation(v, pf)
    total = val["total_cad"]
    by_class, by_sector, by_country, by_ccy, by_stock = {}, {}, {}, {}, {}
    covered, opaque, used = 0.0, [], []

    def add(d, k, x):
        d[k] = d.get(k, 0.0) + x

    for x in val["lignes"]:
        t, w = x["ticker"], x["poids"]
        a = v.dp.asset[t]
        cls = ASSET_CLASS_FR[a["asset_class"]]
        add(by_class, cls, w)
        snap = v.etf_snapshot(t) if a["asset_class"].startswith("etf") else None
        if a["asset_class"] in ("equity",):
            add(by_sector, a["sector"], w)
            add(by_country, "CA" if a["market"] == "TSX" else "US", w)
            add(by_ccy, a["currency"], w)
            add(by_stock, t, w)
            covered += w
        elif snap is not None and a["asset_class"] == "etf_equity":
            s = sum(h["weight"] for h in snap["holdings"]) or 1.0
            for h in snap["holdings"]:
                hw = w * h["weight"] / s
                add(by_sector, h.get("sector") or "Non classé", hw)
                add(by_country, h.get("country") or "?", hw)
                add(by_ccy, h.get("currency") or a["currency"], hw)
                if h.get("universe_ticker"):
                    add(by_stock, h["universe_ticker"], hw)
            covered += w
            used.append({"fonds": t, "composition_au": snap["as_of"], "source": snap["source"]})
        elif a["asset_class"] in ("etf_bond", "etf_commodity", "crypto"):
            add(by_country, "CA" if a["market"] == "TSX" else ("US" if a["asset_class"] != "crypto" else "Mondial"), w)
            add(by_ccy, a["currency"], w)
            covered += w
            if snap is not None:
                used.append({"fonds": t, "composition_au": snap["as_of"], "source": snap["source"]})
        else:  # equity ETF without composition at this date: opaque block, declared
            add(by_sector, f"Non transparent : {t}", w)
            add(by_country, "CA" if a["market"] == "TSX" else "US", w)
            add(by_ccy, a["currency"], w)
            opaque.append(t)
    if val["poids_liquidites"]:
        add(by_class, "Liquidités", val["poids_liquidites"])
        add(by_ccy, "CAD", val["poids_liquidites"])
        covered += val["poids_liquidites"]
    equity_w = by_class.get("Actions", 0.0)
    tech = sum(by_sector.get(s, 0.0) for s in TECH_SECTORS)
    return {"total_cad": total, "classes": by_class, "secteurs": by_sector, "pays": by_country,
            "devises": by_ccy, "titres": dict(sorted(by_stock.items(), key=lambda kv: -kv[1])),
            "couverture": covered, "fonds_opaques": opaque, "compositions_utilisees": used,
            "poids_actions": equity_w, "poids_techno": tech}


def ev_transparence(v: AsOf, pf: Portfolio) -> list[Evidence]:
    lt = look_through(v, pf)
    pct = lambda d: {k: x * 100 for k, x in sorted(d.items(), key=lambda kv: -kv[1])}
    srcs = ["profil:positions (fictives)", "S1+S2:close", "S1+S3:FXUSDCAD", "S7:SSGA", "S8:iShares Canada"]
    common = dict(sujet=pf.label, as_of=str(v.day), date_de_calcul=v.date, donnees_source=srcs,
                  methode="transparence_fnb_par_composition_publiee",
                  reference="Exposition = Σ poids de la ligne × poids du titre dans le fonds (dernière composition publiée à la date).")
    note = None
    if lt["fonds_opaques"]:
        note = "Composition non disponible à cette date pour : " + ", ".join(lt["fonds_opaques"])
    out = [
        evidence(mesure="exposition_classes", libelle="Répartition par classe d'actifs", valeur=pct(lt["classes"]),
                 unite="%", **common, note=note),
        evidence(mesure="exposition_secteurs", libelle="Exposition réelle par secteur (FNB ouverts)", valeur=pct(lt["secteurs"]),
                 unite="%", **common, note=note),
        evidence(mesure="exposition_pays", libelle="Exposition par pays", valeur=pct(lt["pays"]), unite="%", **common),
        evidence(mesure="exposition_devises", libelle="Exposition par devise", valeur=pct(lt["devises"]), unite="%", **common),
        evidence(mesure="exposition_techno", libelle="Exposition réelle à la techno (TI + services de communication)",
                 valeur=lt["poids_techno"] * 100, unite="%", **common,
                 parametres={"secteurs": list(TECH_SECTORS)}, note=note),
        evidence(mesure="exposition_titres", libelle="Exposition par titre (direct + via FNB)",
                 valeur={k: x * 100 for k, x in list(lt["titres"].items())[:15]}, unite="%", **common, note=note),
        evidence(mesure="couverture_transparence", libelle="Part du portefeuille dont la composition est connue",
                 valeur=lt["couverture"] * 100, unite="%", **common,
                 parametres={"compositions": lt["compositions_utilisees"]}),
    ]
    return out


def exposure_to(v: AsOf, pf: Portfolio, ticker: str) -> float:
    """Total exposure (fraction of portfolio) to one issuer, directly and through opened ETFs."""
    return look_through(v, pf)["titres"].get(ticker, 0.0)


# ---------------------------------------------------------------- risk structure

def weekly_returns(v: AsOf, tickers: list[str], years: float = 3.0) -> tuple[np.ndarray, np.ndarray]:
    lv = v.matrix(tickers, "adj", "CAD")
    dates = v.dates
    wk = dates.astype("datetime64[W]")
    last_of_week = np.flatnonzero(np.r_[wk[1:] != wk[:-1], True])
    lvl = lv[last_of_week]
    d = dates[last_of_week]
    start = v.day - np.timedelta64(int(years * 365.25), "D")
    keep = d >= start
    lvl, d = lvl[keep], d[keep]
    r = lvl[1:] / lvl[:-1] - 1.0
    return d[1:], r


def _risk_inputs(v: AsOf, pf: Portfolio, years: float):
    val = valuation(v, pf)
    lines = [x for x in val["lignes"] if x["valeur_cad"] > 0]
    tickers = [x["ticker"] for x in lines]
    w = np.array([x["poids"] for x in lines])
    d, r = weekly_returns(v, tickers, years)
    ok = ~np.isnan(r).any(axis=1)
    return val, tickers, w, d[ok], r[ok]


def ev_contribution_risque(v: AsOf, pf: Portfolio, years: float = 3.0) -> list[Evidence]:
    val, tickers, w, d, r = _risk_inputs(v, pf, years)
    base = dict(sujet=pf.label, as_of=str(v.day), donnees_source=["S1+S2:adj_close", "S1+S3:FXUSDCAD", "profil:positions (fictives)"],
                methode="contributions_euler_covariance_hebdomadaire", parametres={"fenetre_annees": years, "frequence": "hebdomadaire"},
                reference=REF_RC)
    if len(r) < 52:
        return [insufficient(mesure="contribution_risque", libelle="Part de chaque ligne dans le risque total", unite="%",
                             date_de_calcul=v.date, note=f"{len(r)} semaines communes, 52 requises", **base)]
    cov = np.cov(r, rowvar=False, ddof=1) * 52
    sig = float(math.sqrt(w @ cov @ w))
    rc = w * (cov @ w) / sig
    share = rc / sig
    per = (str(d[0]), str(d[-1]))
    e1 = evidence(mesure="volatilite_portefeuille", libelle="Volatilité annualisée du portefeuille", valeur=sig * 100,
                  unite="%", date_de_calcul=str(d[-1]), periode=per, **base)
    e2 = evidence(mesure="contribution_risque", libelle="Part de chaque ligne dans le risque total",
                  valeur={t: float(s * 100) for t, s in sorted(zip(tickers, share), key=lambda kv: -kv[1])},
                  unite="%", date_de_calcul=str(d[-1]), periode=per, **base)
    pos = np.clip(share, 0, None)
    pos = pos / pos.sum() if pos.sum() > 0 else pos
    enb = float(1.0 / np.sum(pos ** 2)) if pos.sum() > 0 else float("nan")
    e3 = evidence(mesure="nombre_effectif_paris", libelle="Nombre effectif de paris (selon le risque)", valeur=enb,
                  unite="nombre", date_de_calcul=str(d[-1]), periode=per,
                  **{**base, "methode": "inverse_herfindahl_parts_de_risque", "reference": REF_ENB})
    return [e1, e2, e3]


def ev_paris_reels(v: AsOf, pf: Portfolio, years: float = 3.0, rho_seuil: float = 0.7) -> Evidence:
    val, tickers, w, d, r = _risk_inputs(v, pf, years)
    base = dict(mesure="paris_reels", libelle="Lignes qui bougent ensemble (paris réels)", sujet=pf.label, as_of=str(v.day),
                donnees_source=["S1+S2:adj_close", "S1+S3:FXUSDCAD", "profil:positions (fictives)"],
                methode="regroupement_hierarchique_moyen_distance_correlation",
                parametres={"fenetre_annees": years, "seuil_correlation": rho_seuil, "frequence": "hebdomadaire"},
                reference=REF_HRP)
    if len(tickers) == 0 or len(r) < 52:
        return insufficient(**base, unite="nombre", date_de_calcul=v.date, note="historique commun insuffisant")
    if len(tickers) == 1:
        return evidence(**base, valeur={"n_lignes": 1, "n_paris": 1, "groupes": [[tickers[0]]]}, unite="nombre",
                        date_de_calcul=str(d[-1]))
    c = np.corrcoef(r, rowvar=False)
    dist = np.sqrt(np.clip(0.5 * (1 - c), 0, None))
    np.fill_diagonal(dist, 0.0)
    z = linkage(squareform(dist, checks=False), method="average")
    lab = fcluster(z, t=math.sqrt(0.5 * (1 - rho_seuil)), criterion="distance")
    groups = {}
    for t, l, wi in zip(tickers, lab, w):
        groups.setdefault(int(l), {"titres": [], "poids_pct": 0.0})
        groups[int(l)]["titres"].append(t)
        groups[int(l)]["poids_pct"] += float(wi * 100)
    gl = sorted(groups.values(), key=lambda g: -g["poids_pct"])
    return evidence(**base, valeur={"n_lignes": len(tickers), "n_paris": len(gl), "groupes": gl}, unite="nombre",
                    date_de_calcul=str(d[-1]), periode=(str(d[0]), str(d[-1])))


# ---------------------------------------------------------------- history-based scenarios

EPISODES = {
    "2022": ("2022-01-03", "2022-12-30", "2022 : actions et obligations en baisse en même temps"),
    "covid_2020": ("2020-02-19", "2020-03-23", "Février–mars 2020 : chute liée à la COVID-19"),
    "fin_2018": ("2018-10-01", "2018-12-24", "Automne 2018 : correction des marchés"),
}


def ev_rejeu(v: AsOf, pf: Portfolio, episode: str = "2022") -> Evidence:
    start, end, label = EPISODES[episode]
    base = dict(mesure="rejeu_historique", libelle=f"Rejeu : {label}", sujet=pf.label, as_of=str(v.day),
                donnees_source=["S1+S2:adj_close", "S1+S3:FXUSDCAD", "profil:positions (fictives)"],
                methode="rejeu_achat_conservation_poids_actuels", parametres={"episode": episode, "debut": start, "fin": end},
                reference="Rejeu historique : poids actuels appliqués aux rendements réels de la période (aucune prévision).")
    if np.datetime64(end) > v.day:
        return evidence(**base, valeur=None, unite="%", date_de_calcul=v.date, statut="non_applicable",
                        note="période postérieure à la date de simulation : rejeu impossible sans information future")
    val = valuation(v, pf)
    lines = [x for x in val["lignes"] if x["valeur_cad"] > 0]
    dp = v.dp
    i0 = int(np.searchsorted(dp.calendar, np.datetime64(start)))
    i1 = int(np.searchsorted(dp.calendar, np.datetime64(end), side="right"))
    path = np.full(i1 - i0, val["poids_liquidites"])
    missing = []
    for x in lines:
        s = v.series(x["ticker"], "adj", "CAD")[i0:i1]
        if np.isnan(s[0]):
            missing.append(x["ticker"])
            path += x["poids"]          # asset absent at the time: held flat (declared)
            continue
        path += x["poids"] * s / s[0]
    peak = np.maximum.accumulate(path)
    dd = path / peak - 1
    worst = float(dd.min())
    total = val["total_cad"]
    return evidence(**base, valeur={"variation_finale_pct": float((path[-1] - 1) * 100), "pire_baisse_pct": worst * 100,
                                    "pire_baisse_cad": worst * total, "valeur_reference_cad": total,
                                    "date_creux": str(dp.calendar[i0 + int(np.argmin(dd))]), "titres_absents": missing},
                    unite="%", devise="CAD", date_de_calcul=v.date, periode=(start, end),
                    note=("Absents à l'époque, tenus constants : " + ", ".join(missing)) if missing else None)


def ev_scenarios_bootstrap(v: AsOf, pf: Portfolio, horizon_annees: float, n: int = 2000, bloc_moyen: int = 20,
                           seuil_perte_pct: float = 20.0) -> Evidence:
    """Stationary block bootstrap of the portfolio's past daily returns: a range of *resampled past*
    outcomes, not a forecast. Only the downside tail and the spread are meant to be shown."""
    val = valuation(v, pf)
    lines = [x for x in val["lignes"] if x["valeur_cad"] > 0]
    tickers = [x["ticker"] for x in lines]
    w = np.array([x["poids"] for x in lines])
    lv = v.matrix(tickers, "adj", "CAD")
    ok = ~np.isnan(lv).any(axis=1)
    lv = lv[ok]
    base = dict(mesure="scenarios_reechantillonnes", libelle=f"Scénarios rééchantillonnés du passé sur {horizon_annees:g} an(s)",
                sujet=pf.label, as_of=str(v.day), donnees_source=["S1+S2:adj_close", "S1+S3:FXUSDCAD", "profil:positions (fictives)"],
                methode="bootstrap_stationnaire_rendements_quotidiens",
                parametres={"n_scenarios": n, "bloc_moyen_seances": bloc_moyen, "graine": SEED, "horizon_annees": horizon_annees,
                            "seuil_perte_pct": seuil_perte_pct},
                reference=REF_BOOT)
    if len(lv) < 500:
        return insufficient(**base, unite="%", date_de_calcul=v.date, note=f"{len(lv)} séances communes, 500 requises")
    r = (lv[1:] / lv[:-1] - 1) @ w            # constant-mix daily portfolio returns (cash = 0 %)
    T = len(r)
    H = int(round(horizon_annees * 252))
    rng = np.random.default_rng(SEED)
    p = 1.0 / bloc_moyen
    starts = rng.integers(0, T, size=(n, H))
    new_block = rng.random((n, H)) < p
    new_block[:, 0] = True
    idx = np.empty((n, H), dtype=np.int64)
    for j in range(H):                        # vectorised over scenarios
        idx[:, j] = np.where(new_block[:, j], starts[:, j], (idx[:, j - 1] + 1) % T if j else starts[:, 0])
    paths = np.cumprod(1 + r[idx], axis=1)
    final = paths[:, -1] - 1
    trough = (paths / np.maximum.accumulate(paths, axis=1) - 1).min(axis=1)
    q = np.quantile(final, [0.05, 0.25, 0.75, 0.95]) * 100
    return evidence(**base, valeur={"p05_pct": float(q[0]), "p25_pct": float(q[1]), "p75_pct": float(q[2]), "p95_pct": float(q[3]),
                                    "part_scenarios_perte_sup_seuil_pct": float((final < -seuil_perte_pct / 100).mean() * 100),
                                    "pire_baisse_mediane_en_cours_de_route_pct": float(np.median(trough) * 100),
                                    "historique_utilise": [str(v.dates[ok][0]), str(v.dates[ok][-1])]},
                    unite="%", date_de_calcul=v.date, periode=(str(v.dates[ok][0]), str(v.dates[ok][-1])),
                    note="Rééchantillonnage du passé : ce n'est pas une prévision.")
