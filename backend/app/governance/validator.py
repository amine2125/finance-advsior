"""Deterministic governance: the Evidence Agent's non-LLM checks.

* every referenced metric/source/event ID must exist in the ledger of this analysis;
* every number carrying a unit (%, $, x) must match a registered value (claims citing metrics are checked
  against those metrics specifically; free prose is checked against the whole ledger);
* point forecasts, price targets, probabilities of gain, trade instructions and certainty words are blocked;
* causal language in factual claims is rejected unless supported by an event-window test.
"""
from __future__ import annotations

import re
from typing import Iterable

from ..analytics.ledger import MetricLedger
from ..ids import new_id
from ..models import AgentArgument, ClaimCheck, InfoClass, VerificationResult

NEGATIONS = r"(?:pas|aucun|aucune|jamais|ni|sans|non|no|not|never|without|refuse|interdit|n'|ne)"
FORBIDDEN = [
    ("price_target", r"objectifs? de (cours|prix)|cibles? de (cours|prix)|price target|target price|juste valeur de \d|fair value (of|=)"),
    ("point_forecast", r"\b(va|vont|devrait|devraient|will|is going to|are going to)\s+(monter|grimper|baisser|chuter|s'effondrer|"
                       r"exploser|doubler|tripler|atteindre|rise|fall|crash|surge|double|reach|plunge|soar)"),
    ("probability_of_gain", r"probabilit[ée] (de|d')\s?(gain|hausse|baisse|succ[eè]s|profit)|chance(s)? de (gagner|succ[eè]s|hausse)|"
                            r"probability of (gain|profit|success|rising)|\d+\s?% de chances"),
    ("expected_return", r"rendement (attendu|esp[ée]r[ée]|pr[ée]vu) de\s*[-−]?\d|expected return of\s*[-−]?\d"),
    ("trade_instruction", r"\b(achetez|vendez|ach[eè]te maintenant|vends maintenant|buy now|sell now|you should buy|you should sell|"
                          r"vous devriez (acheter|vendre)|il faut (acheter|vendre))\b"),
    ("certainty", r"\b(garanti|garantie|guaranteed|certain(e)? de (monter|baisser)|sans aucun risque|risk[- ]free return|"
                  r"effondrement certain|perte garantie|guaranteed loss|will certainly)\b"),
]
CAUSAL = r"\b(à cause de|en raison de|a provoqué|a causé|because of|due to|caused|drove|est dû à|s'explique par)\b"
_forbidden = [(k, re.compile(p, re.IGNORECASE)) for k, p in FORBIDDEN]
_causal = re.compile(CAUSAL, re.IGNORECASE)
NUM_RE = re.compile(r"(?<![\w.])([-−+]?\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?|[-−+]?\d+(?:[.,]\d+)?)\s*(%|\$|x\b|×|pb\b|bps\b|pts?\b)?",
                    re.IGNORECASE)
ID_RE = re.compile(r"\b(?:asset|pf|persona|bench|scn|hyp|test|alt|hype|guard|fx|data)\.[A-Za-z0-9_.\-]+")


def _parse_num(raw: str) -> float:
    s = raw.replace("−", "-").replace(" ", "").replace(" ", "").replace(" ", "")
    if s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    return float(s)


def find_forbidden(text: str) -> list[dict[str, str]]:
    hits = []
    for kind, rx in _forbidden:
        for m in rx.finditer(text or ""):
            start = max(0, m.start() - 40)
            prefix = text[start:m.start()].lower()
            if re.search(NEGATIONS + r"\b[^.]{0,30}$", prefix):
                continue  # negated ("aucun objectif de cours", "ne va pas ...")
            hits.append({"kind": kind, "phrase": m.group(0)})
    return hits


def extract_numbers(text: str) -> list[tuple[float, str, str]]:
    out = []
    clean = ID_RE.sub(" ", text or "")
    clean = re.sub(r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b", " ", clean)
    for m in NUM_RE.finditer(clean):
        raw, unit = m.group(1), (m.group(2) or "").lower()
        try:
            val = _parse_num(raw)
        except ValueError:
            continue
        if not unit:
            continue  # only numbers with a financial unit are validated
        if unit == "×":
            unit = "x"
        out.append((val, unit, m.group(0).strip()))
    return out


def allowed_values(led: MetricLedger, metric_ids: Iterable[str] | None = None, extra: Iterable[float] = ()) -> dict[str, list[float]]:
    recs = [led.get(i) for i in metric_ids] if metric_ids is not None else led.records()
    pct, money, ratio = [], [], []
    for r in recs:
        if r is None or r.value is None:
            continue
        v = r.value
        if r.unit == "pct":
            pct += [v * 100, abs(v * 100)]
        elif r.unit in ("cad", "usd"):
            money += [v, abs(v)]
        else:
            ratio += [v, abs(v)]
            pct += [v, abs(v)] if r.unit in ("count", "index") else []
    for x in extra:
        pct += [x, abs(x)]
        money += [x]
        ratio += [x]
    return {"pct": pct, "money": money, "ratio": ratio}


def number_ok(val: float, unit: str, allowed: dict[str, list[float]]) -> bool:
    a = abs(val)
    if unit == "%":
        return any(abs(a - abs(x)) <= max(0.151, abs(x) * 0.01) for x in allowed["pct"]) or a in (0.0, 100.0)
    if unit == "$":
        return any(abs(a - abs(x)) <= max(1.0, abs(x) * 0.01) for x in allowed["money"])
    return any(abs(a - abs(x)) <= max(0.011, abs(x) * 0.01) for x in allowed["ratio"])


def methodology_constants() -> list[float]:
    from ..methodology import METHODOLOGY
    vals: list[float] = []

    def walk(o):
        if isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
        elif isinstance(o, (int, float)) and not isinstance(o, bool):
            vals.extend([float(o), float(o) * 100])
    walk(METHODOLOGY)
    return vals


def check_argument(arg: AgentArgument, led: MetricLedger, source_ids: set[str], event_ids: set[str],
                   extra_numbers: Iterable[float] = ()) -> list[ClaimCheck]:
    checks = []
    const = methodology_constants() + list(extra_numbers)
    for c in arg.claims:
        reasons = []
        unknown = [m for m in c.metric_ids if m not in led] + [s for s in c.source_ids if s not in source_ids] + \
                  [e for e in c.event_ids if e not in event_ids]
        if unknown:
            reasons.append("identifiant(s) inexistant(s): " + ", ".join(unknown))
        nums = extract_numbers(c.text)
        if nums:
            scope = allowed_values(led, [m for m in c.metric_ids if m in led], const) if c.metric_ids else allowed_values(led, None, const)
            bad = [raw for val, unit, raw in nums if not number_ok(val, unit, scope)]
            if bad:
                reasons.append("nombre(s) ne correspondant à aucun calcul référencé: " + ", ".join(bad))
        if c.claim_type == "fact" and not (c.metric_ids or c.source_ids or c.event_ids):
            reasons.append("affirmation factuelle sans référence")
        for hit in find_forbidden(c.text):
            reasons.append(f"formulation interdite ({hit['kind']}): « {hit['phrase']} »")
        if c.claim_type == "fact" and _causal.search(c.text) and not c.event_ids:
            reasons.append("lien causal présenté comme un fait sans test de fenêtre d'événement")
        info = {"fact": InfoClass.COMPUTED_RESULT if c.metric_ids else InfoClass.VERIFIED_FACT,
                "interpretation": InfoClass.INTERPRETATION, "hypothetical": InfoClass.HYPOTHETICAL}[c.claim_type]
        checks.append(ClaimCheck(claim_id=c.claim_id, agent_id=arg.agent_id, text=c.text, accepted=not reasons, reasons=reasons,
                                 info_class=info))
    return checks


def check_free_text(text: str, led: MetricLedger, extra_numbers: Iterable[float] = ()) -> dict:
    const = methodology_constants() + list(extra_numbers)
    scope = allowed_values(led, None, const)
    bad = [raw for val, unit, raw in extract_numbers(text) if not number_ok(val, unit, scope)]
    forbidden = find_forbidden(text)
    ids = set(ID_RE.findall(text or ""))
    unknown = [i for i in ids if i not in led and not i.rstrip(".") in led]
    return {"numeric_mismatches": bad, "forbidden": forbidden, "unknown_ids": unknown,
            "passed": not bad and not forbidden and not unknown}


def verify_arguments(args: list[AgentArgument], led: MetricLedger, source_ids: set[str], event_ids: set[str]) -> VerificationResult:
    checks: list[ClaimCheck] = []
    for a in args:
        checks += check_argument(a, led, source_ids, event_ids)
    blocked = [{"claim_id": c.claim_id, "reason": r} for c in checks for r in c.reasons if r.startswith("formulation interdite")]
    unknown = [r for c in checks for r in c.reasons if r.startswith("identifiant")]
    mism = [{"claim_id": c.claim_id, "reason": r} for c in checks for r in c.reasons if r.startswith("nombre")]
    return VerificationResult(verification_id=new_id("ver"), checked_claims=checks, blocked_phrases=blocked, unknown_ids=unknown,
                              numeric_mismatches=mism, passed=all(c.accepted for c in checks))


def strip_sentences(text: str, bad_fragments: list[str]) -> str:
    if not bad_fragments:
        return text
    parts = re.split(r"(?<=[.!?])\s+", text)
    keep = [p for p in parts if not any(b and b in p for b in bad_fragments)]
    return " ".join(keep)
