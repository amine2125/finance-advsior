"""Tool registry: the only analysis capabilities an agent can ask for.

Each tool: name, module (loaded only when the case needs it), description, parameter schema,
and a function returning Evidence objects. The planner (LLM) may only pick tools from this list;
the orchestrator validates every call against the schema and runs it in code.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from ulysse.analytics import core, hype, portfolio as pfm, regime
from ulysse.data.datapack import AsOf
from ulysse.evidence import Evidence


@dataclass(frozen=True)
class Tool:
    name: str
    module: str
    description: str
    params: dict          # JSON schema (properties) of the tool parameters, besides the implicit context
    needs: tuple[str, ...]  # context keys required: "ticker", "portefeuille"
    fn: Callable[..., list[Evidence]]


def _as_list(x) -> list[Evidence]:
    return x if isinstance(x, list) else [x]


def _t(fn):
    return lambda v, ctx, **kw: _as_list(fn(v, ctx["ticker"], **kw))


def _p(fn):
    return lambda v, ctx, **kw: _as_list(fn(v, ctx["portefeuille"], **kw))


TOOLS: dict[str, Tool] = {t.name: t for t in [
    Tool("prix", "base", "Dernier cours (devise locale et CAD).", {}, ("ticker",), _t(core.prix)),
    Tool("volatilite", "risque_titre", "Volatilité annualisée du titre sur une fenêtre de séances.",
         {"window": {"type": "integer", "enum": [63, 252, 756], "default": 252}}, ("ticker",), _t(core.volatilite)),
    Tool("pire_baisse", "risque_titre", "Pire baisse historique (sommet → creux) et temps de récupération.",
         {"years": {"type": ["number", "null"], "enum": [1, 3, 5, None], "default": None}}, ("ticker",), _t(core.pire_baisse)),
    Tool("cvar", "risque_titre", "Perte moyenne des pires périodes (CVaR historique).",
         {"horizon": {"type": "integer", "enum": [1, 5, 20], "default": 20}}, ("ticker",), _t(core.cvar)),
    Tool("risque_recent", "risque_titre", "Volatilité récente (EWMA) comparée à celle de l'année.", {}, ("ticker",), _t(core.ewma)),
    Tool("rendement_passe", "performance_passee", "Rendement total passé sur une période (descriptif, ne prédit rien).",
         {"years": {"type": "number", "enum": [1, 3, 5], "default": 1}}, ("ticker",), _t(core.rendement_total)),
    Tool("dividendes", "revenu", "Dividendes des 12 derniers mois rapportés au cours.", {}, ("ticker",), _t(core.rendement_dividende)),
    Tool("engouement", "engouement", "Attention inhabituelle (pages vues, volume) détectée par Isolation Forest + règle écrite.",
         {}, ("ticker",), _t(hype.ev_engouement)),
    Tool("regime", "marche", "Climat de marché descriptif (calme, agité, tendu).", {}, (), lambda v, ctx: [regime.ev_regime(v)]),
    Tool("valeur_portefeuille", "base", "Valeur et poids des lignes du portefeuille.", {}, ("portefeuille",), _p(pfm.ev_valeur)),
    Tool("transparence", "transparence", "Exposition réelle (secteurs, pays, devises, titres) en ouvrant les FNB.",
         {}, ("portefeuille",), _p(pfm.ev_transparence)),
    Tool("contribution_risque", "portefeuille", "Part de chaque ligne dans le risque total et nombre effectif de paris.",
         {}, ("portefeuille",), _p(pfm.ev_contribution_risque)),
    Tool("paris_reels", "portefeuille", "Lignes qui évoluent ensemble (regroupement des corrélations).",
         {}, ("portefeuille",), _p(pfm.ev_paris_reels)),
    Tool("rejeu_historique", "scenarios", "Rejeu d'un épisode passé (2022, COVID 2020, fin 2018) sur le portefeuille.",
         {"episode": {"type": "string", "enum": list(pfm.EPISODES), "default": "2022"}}, ("portefeuille",), _p(pfm.ev_rejeu)),
    Tool("scenarios_reechantillonnes", "scenarios", "Éventail de résultats rééchantillonnés du passé (pas une prévision).",
         {"horizon_annees": {"type": "number", "enum": [1, 3, 5, 10], "default": 3}}, ("portefeuille",), _p(pfm.ev_scenarios_bootstrap)),
]}

MODULES = sorted({t.module for t in TOOLS.values()})


def run_tool(name: str, v: AsOf, ctx: dict, **params: Any) -> list[Evidence]:
    if name not in TOOLS:
        raise KeyError(f"unknown tool: {name}")
    tool = TOOLS[name]
    for need in tool.needs:
        if ctx.get(need) is None:
            raise ValueError(f"tool {name} needs '{need}' in context")
    allowed = set(tool.params)
    bad = set(params) - allowed
    if bad:
        raise ValueError(f"tool {name}: unexpected parameters {sorted(bad)}")
    call = {k: spec["default"] for k, spec in tool.params.items() if "default" in spec}
    call.update(params)
    for k, spec in tool.params.items():
        if k in call and "enum" in spec and call[k] not in spec["enum"]:
            raise ValueError(f"tool {name}: {k}={call[k]!r} not in {spec['enum']}")
    return tool.fn(v, ctx, **call)


def catalog() -> list[dict]:
    """What the planner sees (no code, no data)."""
    return [{"nom": t.name, "module": t.module, "description": t.description, "parametres": t.params,
             "requiert": list(t.needs)} for t in TOOLS.values()]
