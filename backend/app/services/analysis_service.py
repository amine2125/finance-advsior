"""Portfolio X-Ray: valuation, exposures, concentration findings, risk metrics, tiers and persona assessment."""
from __future__ import annotations

import pandas as pd

from ..analytics.benchmarks import BENCHMARKS
from ..analytics.ledger import MetricLedger
from ..analytics.persona_rules import TIER_FR, allowed_tier, budget_checks, error_checks
from ..analytics.portfolio import (asset_correlation_pairs, exposures, hhi, portfolio_risk_metrics, value_holdings)
from ..analytics.tiers import classify_risk_tier, tier_from_stats
from ..data.loader import MarketData
from ..ids import new_id
from ..methodology import CALCULATION_VERSION, METHODOLOGY, methodology_hash
from ..models import (AnalysisSnapshot, ConcentrationFinding, InfoClass, InvestorProfile, PersonaAssessment, Portfolio,
                      RiskTier, Severity, utcnow)

SKIP_SECTORS = ("Diversified", "Fixed Income", "Commodities", "Cryptoassets")


def _pct(x):
    return "n/d" if x is None else f"{x * 100:.1f} %".replace(".", ",")


def asset_meta(md: MarketData, assets: list[str]) -> dict[str, dict]:
    out = {}
    for a in assets:
        m = md.asset(a)
        out[a] = {"asset_class": m["asset_class"], "sub_class": m.get("sub_class", ""), "sector": m["sector"], "region": m.get("region", ""),
                  "currency": m["currency"], "name": m["name"], "is_single_issuer": bool(int(m.get("is_single_issuer", 1))),
                  "is_leveraged": bool(int(m.get("is_leveraged", 0))), "is_inverse": bool(int(m.get("is_inverse", 0)))}
    return out


def persona_numbers(p: InvestorProfile | None) -> list[float]:
    if p is None:
        return []
    b = p.budget
    vals = [b.growth_min, b.growth_max, b.max_single_issuer, b.max_single_sector, b.max_speculative, b.drawdown_review,
            p.stated_max_decline or 0, p.horizon_years_min, p.horizon_years_max or 0]
    return [v * 100 for v in vals] + vals


def register_persona(led: MetricLedger, p: InvestorProfile) -> None:
    b = p.budget
    src = [f"persona_{p.persona_id}"]
    for key, label, val in [("growth_min", "Bande croissance min.", b.growth_min), ("growth_max", "Bande croissance max.", b.growth_max),
                            ("max_single_issuer", "Plafond émetteur unique", b.max_single_issuer),
                            ("max_single_sector", "Plafond secteur unique", b.max_single_sector),
                            ("max_speculative", "Plafond poche spéculative", b.max_speculative),
                            ("drawdown_review", "Seuil de revue (perte)", b.drawdown_review)]:
        led.add(f"persona.{p.persona_id}.{key}", f"{label} – {p.display_name}", val, "pct", "budget de risque déclaré (configurable)",
                source_ids=src, info_class=InfoClass.VERIFIED_FACT)
    if p.stated_max_decline is not None:
        led.add(f"persona.{p.persona_id}.tolerance", f"Baisse tolérée déclarée – {p.display_name}", p.stated_max_decline, "pct",
                "profil déclaré", source_ids=src, info_class=InfoClass.VERIFIED_FACT)
    led.add(f"persona.{p.persona_id}.horizon_min", f"Horizon minimal – {p.display_name}", p.horizon_years_min, "years", "profil déclaré",
            source_ids=src, info_class=InfoClass.VERIFIED_FACT)


def compute_positions(md: MarketData, holdings: list[dict], as_of: pd.Timestamp) -> pd.DataFrame:
    return value_holdings(md, holdings, as_of)


def run_xray(md: MarketData, portfolio: Portfolio, persona: InvestorProfile | None, as_of: str | None = None,
             lookback: int | None = None, benchmark_id: str | None = None, speculative_extra: set[str] | None = None,
             include_series: bool = True) -> dict:
    view = md.as_of(as_of) if as_of else md
    as_ts = pd.Timestamp(as_of) if as_of else md.end_date
    led = MetricLedger()
    holdings = [h.model_dump() for h in portfolio.holdings]
    pos = value_holdings(view, holdings, as_ts)
    assets = list(pos.index)
    meta = asset_meta(view, assets)
    weights = {a: float(pos.loc[a, "weight"]) for a in assets}
    total = float(pos["value_cad"].sum())
    data_date = max(pos["price_date"])
    win = (None, data_date)
    led.add("pf.total_value", "Valeur totale du portefeuille (CAD)", total, "cad", "Σ quantité × cours × FX", window=win, assets=assets,
            source_ids=["dataset_prices", "dataset_fx"])
    for a in assets:
        led.add(f"pf.weight.{a}", f"Poids {a}", weights[a], "pct", "valeur_i / valeur totale", window=win, assets=[a],
                source_ids=view.source_ids_for(a))
        led.add(f"pf.value.{a}", f"Valeur {a} (CAD)", float(pos.loc[a, "value_cad"]), "cad", "quantité × cours × FX", window=win, assets=[a],
                source_ids=view.source_ids_for(a))
    ordered = sorted(weights.items(), key=lambda kv: -kv[1])
    for n in (1, 2, 3, 5):
        if len(ordered) >= n:
            names = [a for a, _ in ordered[:n]]
            led.add(f"pf.top{n}", f"Poids cumulé des {n} plus grandes positions ({', '.join(names)})", sum(w for _, w in ordered[:n]), "pct",
                    "Σ des n plus grands poids", window=win, assets=names)
    singles = [a for a in assets if meta[a]["is_single_issuer"] and meta[a]["asset_class"] != "crypto"]
    single_total = sum(weights[a] for a in singles)
    led.add("pf.single_issuers", "Poids cumulé des titres individuels (actions)", single_total, "pct", "Σ poids des émetteurs uniques",
            window=win, assets=singles)
    top_singles = sorted(singles, key=lambda a: -weights[a])[:2]
    if len(top_singles) == 2:
        led.add("pf.top2_single", f"Poids cumulé {top_singles[0]} + {top_singles[1]}", weights[top_singles[0]] + weights[top_singles[1]], "pct",
                "Σ des deux plus grands émetteurs uniques", window=win, assets=top_singles)
    ex = exposures(pos)
    for dim in ("sector", "asset_class", "currency", "region"):
        for k, v in ex[dim].items():
            led.add(f"pf.{dim}.{k.replace(' ', '_')}", f"Exposition {dim} – {k}", v, "pct", f"Σ poids par {dim} (classification directe)",
                    window=win, assets=[a for a in assets if (meta[a].get(dim) if dim != "asset_class" else meta[a]["asset_class"]) == k])
    led.add("pf.growth_share", "Actifs de croissance (actions, FNB d'actions, crypto)", ex["growth_assets"]["growth"], "pct",
            "Σ poids des actions, FNB d'actions et cryptoactifs", window=win, assets=assets)
    h = hhi(weights)
    led.add("pf.hhi", "Indice de Herfindahl-Hirschman (HHI)", h, "ratio", "Σ poids²", window=win, assets=assets)
    led.add("pf.effective_n", "Nombre effectif de positions (1/HHI)", 1 / h, "ratio", "1 / HHI", window=win, assets=assets)

    bench = benchmark_id or (persona.benchmark_id if persona else "BLEND_BALANCED")
    from ..analytics.benchmarks import BENCHMARKS as _B
    if not all(view.has_asset(a) for a in _B[bench]["weights"]):
        bench = next((k for k in (bench, "BLEND_BALANCED", "SPY", "XIU.TO") if all(view.has_asset(a) for a in _B[k]["weights"])), bench)
    risk = portfolio_risk_metrics(view, weights, as_ts, lookback, bench)
    rw = (risk["window_start"], risk["window_end"])
    src = ["dataset_prices", "dataset_fx"]
    led.add("pf.vol", "Volatilité annualisée historique (pondérations actuelles)", risk["volatility"], "pct",
            f"std(rendements quotidiens CAD) × √{risk['periods_per_year']}", window=rw, assets=assets, source_ids=src, flags=risk["flags"])
    dd = risk["drawdown"] or {}
    led.add("pf.mdd", "Perte maximale historique (pondérations actuelles)", dd.get("max_drawdown"), "pct", "min(valeur/pic courant − 1)",
            window=rw, assets=assets, source_ids=src, params={"peak": dd.get("peak_date"), "trough": dd.get("trough_date")})
    led.add("pf.current_dd", "Recul actuel depuis le sommet", dd.get("current_drawdown"), "pct", "valeur/pic courant − 1", window=rw, assets=assets)
    for lvl, tag in (("0.95", "95"), ("0.99", "99")):
        v = risk["var"].get(lvl)
        led.add(f"pf.var{tag}", f"VaR historique 1 jour {tag} %", v["var"] if v else None, "pct", "−quantile empirique des rendements",
                window=rw, assets=assets, flags=[] if v else ["SUPPRESSED_INSUFFICIENT_OBS"], params={"n_obs": risk["n_obs"]})
        led.add(f"pf.cvar{tag}", f"CVaR (perte moyenne au-delà de la VaR) 1 jour {tag} %", v["cvar"] if v else None, "pct",
                "−moyenne des rendements ≤ quantile", window=rw, assets=assets)
        if v:
            led.add(f"pf.var{tag}_cad", f"VaR 1 jour {tag} % en CAD", v["var"] * total, "cad", "VaR × valeur totale", window=rw, assets=assets)
    led.add("pf.total_return", "Rendement total historique (pondérations actuelles)", risk["total_return"], "pct", "Π(1+r) − 1", window=rw, assets=assets)
    led.add("pf.ann_return", "Rendement annualisé historique", risk["annualized_return"], "pct", "(1+R)^(1/années) − 1", window=rw, assets=assets)
    led.add("pf.sharpe", "Ratio de Sharpe historique", risk["sharpe"], "ratio", "excès moyen / écart-type × √périodes", window=rw, assets=assets,
            source_ids=src + ([risk["risk_free"]["source_id"]] if risk["risk_free"]["source_id"] else []),
            flags=["SHARPE_ABOVE_1_5"] if (risk["sharpe"] or 0) > METHODOLOGY["sharpe_overfit_flag"] else [])
    led.add("pf.avg_corr", "Corrélation moyenne pondérée entre positions", risk["avg_pairwise_corr"], "ratio",
            "moyenne pondérée (w_i·w_j) des corrélations par paires", window=rw, assets=assets)
    rd = risk["risk"]
    led.add("pf.div_ratio", "Ratio de diversification", rd.get("diversification_ratio"), "ratio", "Σ w_i·σ_i / σ_p (1 = aucun bénéfice)",
            window=rw, assets=assets)
    for a, c in rd.get("contributions", {}).items():
        led.add(f"pf.rc.{a}", f"Contribution au risque {a}", c, "pct", "w_i·(Σw)_i / σ_p²", window=rw, assets=[a])
    st = risk.get("stressed")
    if st:
        sw = (st["window_start"], st["window_end"])
        led.add("pf.stress.vol", "Volatilité avec corrélations de la pire fenêtre (test de résistance)", st["stressed_vol"], "pct",
                "√(wᵀ D C_stress D w)", window=sw, assets=assets)
        led.add("pf.stress.normal_vol", "Volatilité avec corrélations de toute la période", st["normal_vol"], "pct", "√(wᵀ D C D w)", window=rw)
        led.add("pf.stress.avg_corr", "Corrélation moyenne pendant la pire fenêtre", st["avg_corr_stressed"], "ratio", "corrélations de la fenêtre",
                window=sw)
        led.add("pf.stress.window_return", "Rendement de la pire fenêtre de 63 séances", st["window_return"], "pct", "Π(1+r) − 1", window=sw)
    pairs = asset_correlation_pairs(risk["correlation"]["assets"], risk["correlation"]["matrix"],
                                    METHODOLOGY["concentration"]["correlated_pair_threshold"])
    for pr in pairs:
        led.add(f"pf.corr.{pr['a']}__{pr['b']}", f"Corrélation {pr['a']} / {pr['b']}", pr["corr"], "ratio", "corrélation de Pearson, rendements CAD",
                window=rw, assets=[pr["a"], pr["b"]])
    b = risk.get("benchmark")
    if b:
        led.add("bench.total_return", f"Rendement total – {b['label']}", b["total_return"], "pct", "Π(1+r) − 1, mélange rééquilibré", window=rw)
        led.add("bench.vol", f"Volatilité – {b['label']}", b["volatility"], "pct", "std × √périodes", window=rw)
        led.add("bench.mdd", f"Perte maximale – {b['label']}", b["max_drawdown"], "pct", "min(valeur/pic − 1)", window=rw)
        led.add("bench.excess_return", "Écart de rendement cumulé vs indice", b["excess_return"], "pct", "indice portefeuille − indice référence", window=rw)
        led.add("bench.tracking_error", "Erreur de suivi vs indice", b["tracking_error"], "pct", "std(r_p − r_b) × √périodes", window=rw)

    tiers = {}
    for a in assets:
        t = classify_risk_tier(view, a, as_ts)
        tiers[a] = t
        led.add(f"asset.{a}.vol", f"Volatilité annualisée {a}", t["volatility"], "pct", f"std × √{t['annualization']} (calendrier propre)",
                window=(t["window_start"], t["window_end"]), assets=[a])
        led.add(f"asset.{a}.mdd", f"Perte maximale historique {a}", t["max_drawdown"], "pct", "min(valeur/pic − 1)",
                window=(t["window_start"], t["window_end"]), assets=[a])

    findings = build_findings(led, weights, meta, ex, pairs, pos, h)
    persona_out = None
    if persona:
        register_persona(led, persona)
        persona_out = assess_persona(persona, weights, meta, {a: tiers[a]["tier"] for a in assets}, risk, speculative_extra)
    quality = {a: {"price_date": pos.loc[a, "price_date"], "flags": pos.loc[a, "quality_flags"], "price_age_days": int(pos.loc[a, "price_age_days"])}
               for a in assets}
    stale = [a for a, q in quality.items() if "STALE" in q["flags"]]
    diag = diagnosis_text(led, findings, persona_out, persona)
    out = {
        "analysis_id": new_id("anl"), "portfolio_id": portfolio.portfolio_id, "portfolio_name": portfolio.name,
        "persona_id": persona.persona_id if persona else None, "as_of": as_ts.date().isoformat(), "data_as_of": data_date,
        "created_at": utcnow(), "total_value_cad": total,
        "positions": [{"asset_id": a, **{k: (v if not isinstance(v, float) or v == v else None) for k, v in pos.loc[a].to_dict().items()},
                       "tier": tiers[a]["tier"], "tier_volatility": tiers[a]["volatility"], "tier_mdd": tiers[a]["max_drawdown"],
                       "risk_contribution": rd.get("contributions", {}).get(a)} for a in assets],
        "exposures": ex, "risk": {k: v for k, v in risk.items() if include_series or k not in ("series", "rolling_avg_corr")},
        "correlated_pairs": pairs, "tiers": tiers, "findings": [f.model_dump(mode="json") for f in findings],
        "persona_assessment": persona_out.model_dump(mode="json") if persona_out else None, "diagnosis": diag,
        "benchmark_id": bench, "benchmark_label": BENCHMARKS[bench]["label"],
        "data_quality": {"per_asset": quality, "stale_assets": stale, "dataset_warnings": view.warnings[:20],
                         "dataset_origin": view.origin},
        "etf_lookthrough": {"status": "UNAVAILABLE", "reason": "Aucun jeu de données de composition de FNB daté et vérifié n'est connecté: "
                            "le chevauchement FNB/titres directs est signalé comme suspecté, jamais quantifié."},
        "ledger": led.as_dict(), "methodology_version": METHODOLOGY["version"], "methodology_hash": methodology_hash(),
        "calculation_version": CALCULATION_VERSION, "dataset_version": view.dataset_version,
        "assumptions": [METHODOLOGY["returns"]["portfolio_risk_convention"], METHODOLOGY["returns"]["costs"],
                        "Quantités fractionnaires simulées; aucune transaction réelle", METHODOLOGY["var"]["caveat"]],
    }
    return out


def build_findings(led: MetricLedger, weights, meta, ex, pairs, pos, h) -> list[ConcentrationFinding]:
    cfg = METHODOLOGY["concentration"]
    out: list[ConcentrationFinding] = []
    singles = {a: w for a, w in weights.items() if meta[a]["is_single_issuer"] and meta[a]["asset_class"] != "crypto"}
    if singles:
        top = max(singles, key=singles.get)
        if singles[top] >= cfg["single_asset_warning_default"]:
            out.append(ConcentrationFinding(finding_id="f.direct_issuer", kind="direct_issuer",
                                            severity=Severity.WARNING if singles[top] < 0.35 else Severity.CRITICAL,
                                            title=f"{top} représente {_pct(singles[top])} du portefeuille",
                                            detail="Exposition directe à un seul émetteur (perte permanente possible).", assets=[top],
                                            metric_ids=[f"pf.weight.{top}"]))
        if "pf.top2_single" in led and led.get("pf.top2_single").value >= 0.30:
            r = led.get("pf.top2_single")
            out.append(ConcentrationFinding(finding_id="f.top2_single", kind="direct_issuer", severity=Severity.WARNING,
                                            title=f"{r.label.split('Poids cumulé ')[-1]} = {r.display} de la valeur",
                                            detail="Deux titres individuels concentrent une part majeure de la valeur.", assets=r.assets,
                                            metric_ids=["pf.top2_single"]))
    direct_sectors = {k: v for k, v in ex["sector"].items() if k not in SKIP_SECTORS}
    if direct_sectors:
        s = max(direct_sectors, key=direct_sectors.get)
        if direct_sectors[s] >= cfg["sector_warning_default"]:
            out.append(ConcentrationFinding(finding_id="f.sector", kind="sector",
                                            severity=Severity.WARNING if direct_sectors[s] < 0.5 else Severity.CRITICAL,
                                            title=f"Secteur {s} : {_pct(direct_sectors[s])} en détention directe",
                                            detail="Exposition sectorielle directe uniquement; les FNB ne sont pas reclassés sans composition vérifiée.",
                                            assets=[a for a in weights if meta[a]["sector"] == s], metric_ids=[f"pf.sector.{s.replace(' ', '_')}"]))
    eq_etfs = [a for a in weights if meta[a]["sub_class"] in ("equity_etf", "esg_equity_etf")]
    for etf in eq_etfs:
        overlapping = [a for a in singles if meta[a]["region"] == meta[etf]["region"] or (meta[etf]["region"] == "International" and False)]
        if overlapping:
            out.append(ConcentrationFinding(
                finding_id=f"f.overlap.{etf}", kind="etf_overlap_suspected", severity=Severity.INFO,
                title=f"Chevauchement suspecté : {etf} et {', '.join(overlapping)}",
                detail=(f"{meta[etf]['name']} réplique un indice large de la même région ({meta[etf]['region']}) que vos titres directs; "
                        "il est probable qu'il contienne une partie de ces mêmes sociétés. Non quantifié: aucune composition datée vérifiée."),
                assets=[etf] + overlapping, metric_ids=[f"pf.weight.{etf}"] + [f"pf.weight.{a}" for a in overlapping],
                info_class=InfoClass.INTERPRETATION))
    for pr in pairs[:4]:
        out.append(ConcentrationFinding(finding_id=f"f.corr.{pr['a']}__{pr['b']}", kind="correlation", severity=Severity.INFO,
                                        title=f"{pr['a']} et {pr['b']} : corrélation {pr['corr']:.2f}".replace(".", ","),
                                        detail="Corrélation statistique historique (pas un chevauchement de détention, pas une prévision).",
                                        assets=[pr["a"], pr["b"]], metric_ids=[f"pf.corr.{pr['a']}__{pr['b']}"]))
    dup = [a for a in weights if int(pos.loc[a, "lines"]) > 1]
    if dup:
        out.append(ConcentrationFinding(finding_id="f.duplicate", kind="duplicate_line", severity=Severity.INFO,
                                        title="Lignes en double : " + ", ".join(dup), detail="Même actif saisi plusieurs fois; regroupé.",
                                        assets=dup, metric_ids=[f"pf.weight.{a}" for a in dup]))
    if h >= cfg["hhi_warning"]:
        out.append(ConcentrationFinding(finding_id="f.hhi", kind="hhi", severity=Severity.WARNING if h < cfg["hhi_critical"] else Severity.CRITICAL,
                                        title=f"HHI {h:.3f} – {1 / h:.1f} positions effectives".replace(".", ","),
                                        detail="Le nombre effectif de positions mesure la diversification réelle des poids.", assets=list(weights),
                                        metric_ids=["pf.hhi", "pf.effective_n"]))
    usd = ex["currency"].get("USD", 0)
    if usd >= 0.5:
        out.append(ConcentrationFinding(finding_id="f.currency", kind="currency", severity=Severity.INFO,
                                        title=f"{_pct(usd)} en actifs cotés en USD",
                                        detail="Exposition au taux USD/CAD: une hausse du dollar canadien réduit la valeur en CAD.",
                                        assets=[a for a in weights if meta[a]["currency"] == "USD"], metric_ids=["pf.currency.USD"]))
    return out


def assess_persona(p: InvestorProfile, weights: dict, meta: dict, tiers: dict[str, str], risk: dict,
                   speculative_extra: set[str] | None = None) -> PersonaAssessment:
    at = allowed_tier(p)
    mdd = (risk.get("drawdown") or {}).get("max_drawdown")
    pt = tier_from_stats(risk.get("volatility"), mdd, risk.get("n_obs", 0), single_issuer=False, crypto=False,
                         min_obs=METHODOLOGY["windows"]["min_obs_var"])["tier"]
    checks = budget_checks(p, weights, meta, mdd, speculative_extra)
    errs = error_checks(p, weights, meta, tiers, mdd, at["allowed_tier"], pt)
    breaches = [c for c in checks if c.status in ("BREACH", "ABOVE_BAND", "BELOW_BAND")]
    over = pt != RiskTier.UNKNOWN and pt.value != at["allowed_tier"].value and \
        ["LOW", "MEDIUM", "HIGH"].index(pt.value) > ["LOW", "MEDIUM", "HIGH"].index(at["allowed_tier"].value)
    compatible = not breaches and not over
    summary = (f"Niveau permis pour {p.display_name} : {TIER_FR[at['allowed_tier'].value]} (contrainte(s) déterminante(s) : "
               f"{', '.join(at['binding_inputs'])}). Niveau mesuré du portefeuille : {TIER_FR[pt.value]}. ")
    summary += ("Aucun dépassement de budget." if not breaches else
                f"{len(breaches)} règle(s) du budget dépassée(s) : " + "; ".join(c.message for c in breaches))
    return PersonaAssessment(persona_id=p.persona_id, allowed_tier=at["allowed_tier"], binding_inputs=at["binding_inputs"],
                             tier_inputs=at["tier_inputs"], uncertainties=at["uncertainties"], portfolio_tier=pt, budget_checks=checks,
                             checks=errs, compatible=compatible, summary=summary)


def diagnosis_text(led: MetricLedger, findings, pa: PersonaAssessment | None, p: InvestorProfile | None) -> dict:
    parts = []
    warn = [f for f in findings if f.severity != Severity.INFO]
    if warn:
        parts.append("Points de concentration : " + "; ".join(f.title for f in warn) + ".")
    else:
        parts.append("Aucune concentration au-delà des seuils méthodologiques par défaut.")
    v, dr = led.get("pf.vol"), led.get("pf.div_ratio")
    if v and v.value is not None:
        parts.append(f"Volatilité historique des pondérations actuelles : {v.display} ({v.window_start} → {v.window_end}).")
    if dr and dr.value is not None:
        parts.append(f"Ratio de diversification : {dr.display} (1 = aucun bénéfice de diversification).")
    st = led.get("pf.stress.vol")
    if st and st.value is not None:
        parts.append(f"Avec les corrélations de la pire fenêtre historique, la volatilité passerait à {st.display} "
                     "(test de résistance, pas une prévision) : des expositions corrélées peuvent amplifier les pertes lors d'un choc "
                     "sectoriel, mais l'issue réelle dépend des actifs et de l'événement.")
    if pa and p:
        parts.append(pa.summary)
    return {"text": " ".join(parts), "info_class": "COMPUTED_RESULT + INTERPRETATION",
            "metric_ids": [m for m in ("pf.vol", "pf.div_ratio", "pf.stress.vol") if m in led]}


def make_snapshot(owner_id: str, portfolio: Portfolio, xr: dict, label: str | None = None, alerts: list[str] | None = None) -> AnalysisSnapshot:
    led = xr["ledger"]
    keys = ["pf.vol", "pf.mdd", "pf.current_dd", "pf.var95", "pf.cvar95", "pf.hhi", "pf.effective_n", "pf.avg_corr", "pf.div_ratio",
            "pf.growth_share", "pf.single_issuers", "pf.total_return", "pf.stress.vol"]
    return AnalysisSnapshot(
        snapshot_id=new_id("snap"), owner_id=owner_id, portfolio_id=portfolio.portfolio_id, persona_id=xr["persona_id"], as_of=xr["as_of"],
        quantities={p["asset_id"]: p["quantity"] for p in xr["positions"]},
        prices_native={p["asset_id"]: p["price_native"] for p in xr["positions"]},
        fx_usdcad=next((p["fx_usdcad"] for p in xr["positions"] if p.get("fx_usdcad")), None),
        values_cad={p["asset_id"]: p["value_cad"] for p in xr["positions"]}, total_value_cad=xr["total_value_cad"],
        weights={p["asset_id"]: p["weight"] for p in xr["positions"]}, sector_weights=xr["exposures"]["sector"],
        asset_class_weights=xr["exposures"]["asset_class"], key_metrics={k: led[k]["value"] for k in keys if k in led},
        alerts=alerts or [], dataset_version=xr["dataset_version"], methodology_version=xr["methodology_version"],
        calculation_version=xr["calculation_version"], label=label)
