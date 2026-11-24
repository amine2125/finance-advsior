"""Verifier (code, no LLM). A guardrail that blocks, not one that reminds (method, level 6).

Checks every sentence of a written dossier:
  V1  every sentence has a label among MESURE, DOCUMENTE, HYPOTHESE, INCERTAIN;
  V2  every sentence cites at least one evidence id, and every cited id exists in the dossier;
  V3  every number (and year) in the sentence matches a value of the evidence it cites, within the
      rounding of the number as written (37,3 % accepts 37,25..37,35);
  V4  no forbidden wording (recommendation, promotion, urgency, prediction);
  V5  the five steps are present (Données, Constats, Analyse, Options, Explication).
On failure it NAMES the defect precisely; the orchestrator sends that name back to the writer
(2 attempts max), then falls back to the template writer. Every failure is logged.
"""
from __future__ import annotations

import re
from typing import Any

from ulysse.dossier import LABELS, affichage
from ulysse.evidence import Evidence

ETAPES = ("donnees", "constats", "analyse", "options", "explication")
INTERDITS = [
    (re.compile(r"\bach[eè]te(?:r|z|s)?\b", re.I), "recommandation d'achat"),
    (re.compile(r"\bvend(?:s|re|ez)\b", re.I), "recommandation de vente"),
    (re.compile(r"\btu devrais\b|\bvous devriez\b|\bil faut (?:acheter|vendre|investir)\b", re.I), "conseil prescriptif"),
    (re.compile(r"\bbonne affaire\b|\bocc?asion à ne pas manquer\b|\bà ne pas rater\b|\bdépêche-toi\b", re.I), "ton promotionnel ou urgence"),
    (re.compile(r"\bva (?:monter|baisser|grimper|chuter)\b|\bmontera\b|\bbaissera\b|\bprévoyons\b|\bnous prévoyons\b", re.I), "prédiction de cours"),
    (re.compile(r"\bgaranti(?:e|s)?\b", re.I), "promesse de résultat"),
]
NUM = re.compile(r"(?<![\w-])[-−]?\d{1,3}(?:[   ]\d{3})+(?:,\d+)?(?![\d-])|(?<![\w-])[-−]?\d+(?:,\d+)?(?![\d-])")
DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")


class Defaut(Exception):
    pass


def _numbers(text: str) -> list[tuple[str, float, float]]:
    """(raw, value, tolerance) for each number written in the text (dates removed first)."""
    t = DATE.sub(" ", text)
    out = []
    for m in NUM.finditer(t):
        raw = m.group(0)
        s = raw.replace("−", "-").replace(" ", "").replace(" ", "").replace(" ", "")
        dec = len(s.split(",")[1]) if "," in s else 0
        val = float(s.replace(",", "."))
        tol = 0.5 * 10 ** (-dec) + 1e-9
        if dec == 0 and abs(val) >= 1000:              # rounded amounts: 222 300 $ accepts ±50, 1 100 $ ±50
            z = len(s.rstrip("0")) - len(s)
            tol = max(tol, 0.5 * 10 ** min(-z, 3)) if z < 0 else tol
        out.append((raw, val, tol))
    return out


def _leaves(e: Evidence) -> list[float]:
    vals: list[float] = []

    def walk(x: Any):
        if isinstance(x, bool) or x is None:
            return
        if isinstance(x, (int, float)):
            vals.append(float(x))
        elif isinstance(x, dict):
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
        elif isinstance(x, str):
            for d in DATE.findall(x):
                vals.extend([float(d[:4]), float(d[5:7]), float(d[8:10])])
            for _raw, n, _t in _numbers(x):   # numbers quoted from a cited source text are verifiable there
                vals.append(n)
    walk(e.valeur)
    walk(e.parametres)
    for k in ("debut", "fin"):
        if e.periode is not None:
            d = getattr(e.periode, k)
            vals.extend([float(d[:4]), float(d[5:7]), float(d[8:10])])
    for d in (e.as_of, e.date_de_calcul):
        if d and len(d) >= 4 and d[:4].isdigit():
            vals.append(float(d[:4]))
    for _raw, n, _t in _numbers(e.libelle):
        vals.append(n)
    for s in affichage(e).values():   # displayed strings (e.g. rounded amounts) are valid too
        for raw, v, _t in _numbers(s):
            vals.append(v)
    return vals


def verifier(redaction: dict, preuves: dict[str, Evidence]) -> list[str]:
    """Return the list of named defects (empty = accepted)."""
    defauts: list[str] = []
    sections = redaction.get("sections", [])
    vues = {s.get("etape") for s in sections}
    manquantes = [e for e in ETAPES if e not in vues]
    if manquantes:
        defauts.append(f"V5 ÉTAPE_MANQUANTE : sections absentes {manquantes}.")
    phrases = [ph for sec in sections for ph in sec.get("phrases", [])]
    defauts += verifier_phrases(phrases, preuves)
    if not phrases:
        defauts.append("V5 DOSSIER_VIDE : aucune phrase.")
    return defauts


def verifier_phrases(phrases: list[dict], preuves: dict[str, Evidence]) -> list[str]:
    """V1–V4 on a flat list of sentences (dossier sections, or an assistant answer)."""
    defauts: list[str] = []
    for n, ph in enumerate(phrases, start=1):
        txt = ph.get("texte", "")
        where = f"phrase {n} (« {txt[:60]}… »)"
        if ph.get("etiquette") not in LABELS:
            defauts.append(f"V1 PHRASE_SANS_ETIQUETTE : {where} a l'étiquette {ph.get('etiquette')!r} ; attendu {list(LABELS)}.")
        ids = ph.get("preuves") or []
        if not ids:
            defauts.append(f"V2 PHRASE_SANS_PREUVE : {where} ne cite aucune preuve.")
        unknown = [i for i in ids if i not in preuves]
        if unknown:
            defauts.append(f"V2 PREUVE_INCONNUE : {where} cite {unknown}, absents du dossier.")
        for rx, why in INTERDITS:
            m = rx.search(txt)
            if m:
                defauts.append(f"V4 FORMULATION_INTERDITE : {where} contient « {m.group(0)} » ({why}).")
        leaves = [v for i in ids if i in preuves for v in _leaves(preuves[i])]
        for raw, val, tol in _numbers(txt):
            if not any(abs(abs(val) - abs(x)) <= tol for x in leaves):
                proches = sorted(leaves, key=lambda x: abs(abs(x) - abs(val)))[:2]
                defauts.append(f"V3 CHIFFRE_SANS_PREUVE : « {raw} » dans la {where} ne correspond à aucune valeur des "
                               f"preuves citées {ids} (valeurs les plus proches : {[round(p, 2) for p in proches]}).")
    return defauts
