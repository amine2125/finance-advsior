"""« Est-ce que je peux investir X $ dans Y ? » — deterministic suitability verdict against the investor's own profile.

The verdict is a check of the investor's stated constraints (simulation, educational), never a price forecast or an order:
  1. stated preferences (no speculative sleeve, excluded sectors) — hard stops;
  2. horizon rule: money needed within `low_below_years` cannot go into a HIGH-tier asset;
  3. budget rules recomputed after the hypothetical addition (concentration, sector, growth band, speculative sleeve,
     drawdown review) and the portfolio's measured tier vs the tier the profile allows;
  4. if the amount is too large, the largest amount that creates no new or worsened breach (binary search).
Every number comes from run_xray on the real dataset; the reasons cite the measured values.
"""
from __future__ import annotations

from ..analytics.persona_rules import allowed_tier
from ..analytics.tiers import classify_risk_tier
from ..data.loader import MarketData
from ..i18n import sector_fr
from ..methodology import METHODOLOGY
from ..models import InvestorProfile, Portfolio
from .analysis_service import run_xray
from .impact_service import _with_addition

ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "UNKNOWN": 3}
TIER_FR = {"LOW": "faible", "MEDIUM": "moyen", "HIGH": "élevé", "UNKNOWN": "inconnu"}
LOWER_IS_WORSE = {"budget.drawdown_review", "budget.growth_band_below"}


def _pct(x: float | None) -> str:
    return "n/d" if x is None else f"{x * 100:.1f} %".replace(".", ",")


def _cad(x: float) -> str:
    return f"{x:,.0f} $".replace(",", " ")


def _problems(before: dict | None, after: dict) -> list[dict]:
    """Budget rules that the addition newly breaches or makes worse, plus a portfolio tier above the allowed tier."""
    b = {c["rule_id"]: c for c in ((before or {}).get("persona_assessment") or {}).get("budget_checks", [])}
    pa = after.get("persona_assessment") or {}
    out = []
    for c in pa.get("budget_checks", []):
        if c["status"] in ("OK", "UNKNOWN"):
            continue
        prev = b.get(c["rule_id"])
        if prev is None or prev["status"] in ("OK", "UNKNOWN"):
            out.append({"rule_id": c["rule_id"], "kind": "new", "message": c["message"], "label": c["label"], "value": c.get("measured_value")})
            continue
        pv, av = prev.get("measured_value"), c.get("measured_value")
        if pv is None or av is None:
            continue
        worse = av < pv - 1e-9 if (c["rule_id"] == "budget.drawdown_review" or c["status"] == "BELOW_BAND") else av > pv + 1e-9
        if worse:
            out.append({"rule_id": c["rule_id"], "kind": "worse", "message": c["message"], "label": c["label"], "value": av})
    pt, at = pa.get("portfolio_tier"), pa.get("allowed_tier")
    pt_before = ((before or {}).get("persona_assessment") or {}).get("portfolio_tier")
    if pt in ORDER and at in ORDER and ORDER[pt] < 3 and ORDER[pt] > ORDER[at] and (pt_before is None or ORDER.get(pt_before, 0) < ORDER[pt]):
        out.append({"rule_id": "tier", "kind": "new", "label": "Niveau de risque du portefeuille",
                    "message": f"le portefeuille passerait au niveau de risque {TIER_FR[pt]}, au-dessus du niveau {TIER_FR[at]} permis par votre profil"})
    return out


def _plain(p: dict, name: str, persona: InvestorProfile) -> str:
    """One broken limit in words a client understands — the same rule for any security."""
    b, v, worse = persona.budget, p.get("value"), p.get("kind") == "worse"
    rid = p["rule_id"]
    if v is not None:
        if rid == "budget.growth_band":
            return (f"Votre portefeuille a déjà trop d'actions et de cryptos ({_pct(v)} ; votre zone : {_pct(b.growth_min)} à {_pct(b.growth_max)}). "
                    "En ajouter aggraverait le problème." if worse else
                    f"Avec ce placement, vos actions et cryptos passeraient à {_pct(v)}, au-delà de votre zone ({_pct(b.growth_min)} à {_pct(b.growth_max)}).")
        if rid == "budget.single_issuer":
            return f"{name} pèserait {_pct(v)} de votre portefeuille ; le maximum conseillé par entreprise est {_pct(b.max_single_issuer)}."
        if rid == "budget.speculative":
            return f"Les cryptoactifs feraient {_pct(v)} de votre portefeuille ; votre profil en permet au plus {_pct(b.max_speculative)}."
        if rid == "budget.single_sector":
            return f"Un même secteur ferait {_pct(v)} de votre portefeuille (maximum conseillé : {_pct(b.max_single_sector)}) : ces titres baissent souvent ensemble."
        if rid == "budget.theme_exposure":
            return f"Un seul thème porterait jusqu'à {_pct(v)} de votre argent (maximum conseillé : {_pct(b.max_single_sector)})."
        if rid == "budget.drawdown_review":
            return (f"Votre portefeuille pourrait perdre jusqu'à {_pct(-v)} dans une mauvaise année, plus que les {_pct(-b.drawdown_review)} "
                    "que vous avez dit pouvoir accepter.")
    msg = p["message"].replace("Hors bande: ", "")
    return msg[0].upper() + msg[1:] + "."


def _existing_plain(c: dict, persona: InvestorProfile) -> str:
    """A limit the portfolio ALREADY breaks (before the purchase), in plain words."""
    b, v = persona.budget, c.get("measured_value")
    if c["rule_id"] == "budget.growth_band" and v is not None:
        return (f"votre portefeuille a peu d'actions ({_pct(v)} ; votre zone : {_pct(b.growth_min)} à {_pct(b.growth_max)})." if c["status"] == "BELOW_BAND" else
                f"votre portefeuille a déjà trop d'actions ({_pct(v)} ; votre zone : {_pct(b.growth_min)} à {_pct(b.growth_max)}).")
    return _plain({"rule_id": c["rule_id"], "value": v, "kind": "worse", "message": c.get("message") or c["label"]}, "Un placement", persona)


def check_investment(md: MarketData, persona: InvestorProfile, pf: Portfolio | None, asset_id: str, amount_cad: float) -> dict:
    asset_id = asset_id.upper()
    meta = md.asset(asset_id)
    tier = classify_risk_tier(md, asset_id)
    at = allowed_tier(persona)
    allowed = at["allowed_tier"].value
    crypto = meta["asset_class"] == "crypto"
    extra = {asset_id} if crypto else set()
    reasons: list[dict] = [{"tone": "info", "text": f"{meta['name']} a un risque {TIER_FR[tier['tier']]} : il varie typiquement de ± {_pct(tier['volatility'])} "
                            f"par année, et sa pire baisse sur 5 ans a été de {_pct(tier['max_drawdown'])}."}]
    base = {"asset_id": asset_id, "name": meta["name"], "amount_cad": amount_cad, "asset_tier": tier, "allowed_tier": allowed,
            "binding_inputs": at["binding_inputs"], "profile_level": persona.risk_profile_label, "data_as_of": md.end_date.date().isoformat(),
            "label": "Vérification de compatibilité avec votre profil (simulation éducative), pas un conseil financier personnalisé."}

    def stop(text: str) -> dict:
        reasons.append({"tone": "bad", "text": text})
        return base | {"verdict": "not_suitable", "headline": "Non, ce placement n'est pas adapté à votre profil", "max_amount_cad": 0.0,
                       "reasons": reasons, "before": None, "after": None, "existing_breaches": []}

    # 1. stated preferences
    if crypto and persona.budget.max_speculative <= 0:
        return stop("Votre profil ne prévoit aucune part pour les placements spéculatifs comme les cryptoactifs.")
    if meta["sector"] in persona.excluded_sectors:
        return stop(f"Vous avez choisi d'éviter le secteur « {sector_fr(meta['sector'])} ».")
    # 2. horizon rule
    if tier["tier"] == "HIGH" and persona.horizon_years_min < METHODOLOGY["horizon_rule"]["low_below_years"]:
        return stop(f"Vous aurez besoin de cet argent dans {persona.horizon_years_min:g} an(s) : un placement qui a déjà perdu "
                    f"{_pct(-tier['max_drawdown'])} n'aurait peut-être pas le temps de remonter.")
    # 2b. the asset itself: two risk levels above what the profile allows is never suitable (same rule as options_for),
    #     whatever the rest of the portfolio looks like.
    if tier["tier"] in ORDER and ORDER[tier["tier"]] < 3 and ORDER[tier["tier"]] > ORDER[allowed] + 1:
        return stop(f"Son risque est {TIER_FR[tier['tier']]}, alors que votre profil ne permet qu'un risque {TIER_FR[allowed]}.")
    if tier["tier"] == "UNKNOWN":
        reasons.append({"tone": "warn", "text": "Historique trop court pour mesurer le risque de façon fiable."})

    # 3. budget rules after the hypothetical addition
    if pf is None or not pf.holdings:
        empty = Portfolio(portfolio_id="hyp-new", owner_id="-", name="Nouveau", persona_id=persona.persona_id, holdings=[])
        before = None

        def after_for(x: float) -> dict:
            return run_xray(md, _with_addition(md, empty, asset_id, x), persona, include_series=False, speculative_extra=extra)
        reasons.append({"tone": "info", "text": "Ce serait votre seul placement : il représenterait 100 % de votre argent investi."})
    else:
        before = run_xray(md, pf, persona, include_series=False, speculative_extra=extra)

        def after_for(x: float) -> dict:
            return run_xray(md, _with_addition(md, pf, asset_id, x), persona, include_series=False, speculative_extra=extra)

    single = bool(int(meta.get("is_single_issuer", 1))) and not crypto

    def own_limits(x: dict) -> list[dict]:
        """The new line's own weight vs the profile's caps. An existing breach elsewhere (e.g. 100 % in one asset) must not
        hide a new one: comparing only the portfolio maximum would let any second concentrated line through."""
        w_ = (x.get("ledger") or {}).get(f"pf.weight.{asset_id}", {}).get("value")
        if w_ is None:
            return []
        if single and w_ > persona.budget.max_single_issuer + 1e-9:
            return [{"rule_id": "budget.single_issuer", "kind": "new", "label": "Poids d'un seul placement", "value": w_,
                     "message": f"{asset_id} pèserait {_pct(w_)} de votre portefeuille, au-delà du maximum de {_pct(persona.budget.max_single_issuer)} par entreprise"}]
        if crypto and w_ > persona.budget.max_speculative + 1e-9:
            return [{"rule_id": "budget.speculative", "kind": "new", "label": "Part spéculative", "value": w_,
                     "message": f"{asset_id} pèserait {_pct(w_)} de votre portefeuille, au-delà de votre part spéculative maximale de {_pct(persona.budget.max_speculative)}"}]
        return []

    def problems(x: dict) -> list[dict]:
        found = _problems(before, x)
        return found + [o for o in own_limits(x) if o["rule_id"] not in {f["rule_id"] for f in found}]

    after = after_for(amount_cad)
    probs = problems(after)
    existing = [_existing_plain(c, persona) for c in ((before or {}).get("persona_assessment") or {}).get("budget_checks", [])
                if c["status"] not in ("OK", "UNKNOWN")]

    def snap(x: dict | None) -> dict | None:
        if not x:
            return None
        L = x["ledger"]
        return {"total_value_cad": x["total_value_cad"], "volatility": L.get("pf.vol", {}).get("value"),
                "max_drawdown": L.get("pf.mdd", {}).get("value"), "weight": L.get(f"pf.weight.{asset_id}", {}).get("value"),
                "portfolio_tier": (x.get("persona_assessment") or {}).get("portfolio_tier"),
                "breaches": [c["label"] for c in (x.get("persona_assessment") or {}).get("budget_checks", []) if c["status"] not in ("OK", "UNKNOWN")]}

    base |= {"before": snap(before), "after": snap(after), "existing_breaches": existing}
    w = (snap(after) or {}).get("weight")
    if not probs:
        reasons.append({"tone": "good", "text": f"Avec {_cad(amount_cad)}, {meta['name']} pèserait {_pct(w)} de votre portefeuille : toutes vos limites restent respectées."})
        if existing:
            reasons.append({"tone": "warn", "text": "À savoir : " + " ".join(existing)})
        return base | {"verdict": "suitable", "headline": "Oui, ce placement est compatible avec votre profil", "max_amount_cad": amount_cad, "reasons": reasons}

    for p in probs:
        reasons.append({"tone": "bad", "text": _plain(p, meta["name"], persona), "budget": True})  # a size limit, not a hard « no »
    # 4. largest amount without new or worsened breach (binary search, rounded down to 50 $)
    lo, hi = 0.0, amount_cad
    for _ in range(8):
        mid = (lo + hi) / 2
        if mid < 1:
            break
        if problems(after_for(mid)):
            hi = mid
        else:
            lo = mid
    max_ok = float(int(lo // 50) * 50)
    floor = max(50.0, 0.05 * amount_cad)
    if max_ok >= floor:
        reasons.append({"tone": "good", "text": f"Jusqu'à environ {_cad(max_ok)}, ce placement resterait dans vos limites."})
        return base | {"verdict": "partial", "headline": f"Oui, mais pas plus d'environ {_cad(max_ok)}", "max_amount_cad": max_ok, "reasons": reasons}
    return base | {"verdict": "not_suitable", "headline": "Non, ce placement n'est pas adapté à votre profil", "max_amount_cad": 0.0, "reasons": reasons}


def options_for(md: MarketData, persona: InvestorProfile) -> dict:
    """Universe grouped by fit with the profile: tier vs allowed tier and stated preferences (fast, no portfolio maths)."""
    allowed = allowed_tier(persona)["allowed_tier"].value
    groups: dict[str, list] = {"fit": [], "small": [], "no": []}
    for aid in md.universe.index:
        meta = md.asset(aid)
        t = classify_risk_tier(md, aid)
        row = {"asset_id": aid, "name": meta["name"], "asset_class": meta["asset_class"], "sector": meta["sector"],
               "tier": t["tier"], "volatility": t["volatility"], "max_drawdown": t["max_drawdown"]}
        crypto = meta["asset_class"] == "crypto"
        if (crypto and persona.budget.max_speculative <= 0) or meta["sector"] in persona.excluded_sectors or t["tier"] == "UNKNOWN":
            row["why"] = "exclu par vos préférences" if t["tier"] != "UNKNOWN" else "historique insuffisant"
            groups["no"].append(row)
        elif ORDER[t["tier"]] <= ORDER[allowed]:
            groups["fit"].append(row)
        elif ORDER[t["tier"]] == ORDER[allowed] + 1 and persona.horizon_years_min >= METHODOLOGY["horizon_rule"]["low_below_years"]:
            if t["tier"] == "HIGH":
                cap = persona.budget.max_speculative if crypto else persona.budget.max_single_issuer
                row["why"] = f"en petite part seulement (max {_pct(cap)} de votre portefeuille)"
            elif meta.get("sub_class") in ("bond_etf", "gold_etf", "commodity_etf"):
                row["why"] = "en partie, avec des placements plus stables"
            else:
                row["why"] = (f"en partie seulement : actions et cryptos entre {_pct(persona.budget.growth_min)} et "
                              f"{_pct(persona.budget.growth_max)} de votre portefeuille")
            groups["small"].append(row)
        else:
            row["why"] = f"risque {TIER_FR[t['tier']]}, au-dessus de votre niveau permis ({TIER_FR[allowed]})"
            groups["no"].append(row)
    for g in groups.values():
        g.sort(key=lambda r: (r["volatility"] if r["volatility"] is not None else 9))
    return {"allowed_tier": allowed, "groups": groups, "data_as_of": md.end_date.date().isoformat()}
