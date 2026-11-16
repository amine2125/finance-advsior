"""ULYSSE test bench (phase 8). Run: `make bench` (local, simulated LLM, no AWS).

Measures (prompt §11), each with its sample size; proportions get a Wilson 95 % interval:
  1. expected signals that fire        — labelled scenarios written from the BRIEF's intent, not from the code
  2. false alerts                       — scenarios labelled « no pause expected » that paused (and « quiet » ones that alerted)
  3. stability                          — same input run 5 times -> identical status
  4. proportionality                    — a larger order is never judged less severely (same profile, asset, date)
  5. no future information              — every evidence used is dated on or before the simulated date
  6. numbers with a proof               — every number of every published dossier is tied to cited evidence (verifier)
  7. verifier rejection rate            — share of LLM drafts rejected at least once (simulated LLM: injected defects)
  8. latency                            — signal (order check) p50/p95; dossier duration (simulated LLM)
  9. cost per dossier                   — measured only with Bedrock (phase 7); here: not measured
Writes bench/resultats/fiabilite.json (served on the Reliability page) and bench/resultats/rapport.md.
"""
from __future__ import annotations

import json
import math
import statistics
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from ulysse import demo, orchestrator, policy  # noqa: E402
from ulysse.analytics import portfolio as pfm  # noqa: E402
from ulysse.contract.defaults import Reponses, construire  # noqa: E402
from ulysse.data.datapack import get_datapack  # noqa: E402
from ulysse.llm import MockLLM  # noqa: E402
from ulysse.personas import persona  # noqa: E402
from ulysse.store import LocalStore, set_store  # noqa: E402

OUT = ROOT / "bench" / "resultats"
ORD = {"aucun": 0, "ok": 1, "attention": 2, "pause": 3}
TODAY, PAST = "2026-11-14", "2021-12-15"

PRUDENT = Reponses(nom="Profil prudent (créé en direct)", tolerance="faible", experience="debutant", capital_cad=70_000,
                   objectifs=[{"libelle": "Mise de fonds", "horizon_annees": 1.5, "part_pct": 70, "montant_cible_cad": 60_000}])

# (profile, ticker, size as share of the portfolio, date, min level, max level, why — from the brief, not from the code)
SCENARIOS = [
    ("robert", "TSLA", .20, TODAY, "pause", "pause", "PDF p.7 : remettre en question une demande médiatisée incohérente (20 % d'un titre très volatil à 3–5 ans de la retraite)"),
    ("robert", "NVDA", .20, TODAY, "pause", "pause", "idem, titre réellement en engouement à la date"),
    ("robert", "SHOP.TO", .20, TODAY, "pause", "pause", "idem, titre de croissance très volatil"),
    ("robert", "BTC-USD", .05, TODAY, "attention", "pause", "PDF p.7 : peu intéressé par les cryptoactifs"),
    ("robert", "TSLA", .20, PAST, "pause", "pause", "machine à remonter le temps : même incohérence en décembre 2021"),
    ("robert", "ZST.TO", .02, TODAY, "aucun", "attention", "obligations à très court terme, petite taille : pas de pause attendue"),
    ("robert", "XBB.TO", .02, TODAY, "aucun", "attention", "obligations canadiennes, petite taille : pas de pause attendue"),
    ("robert", "JNJ", .01, TODAY, "aucun", "attention", "entreprise établie, 1 % : pas de pause attendue"),
    ("amira", "BTC-USD", .05, TODAY, "aucun", "attention", "prompt §11 : Amira + 5 % de BTC -> pas de ⛔ (risque élevé, intérêt crypto)"),
    ("amira", "ETH-USD", .03, TODAY, "aucun", "attention", "idem, petite position crypto"),
    ("amira", "NVDA", .02, TODAY, "aucun", "attention", "petite position techno : signal discret au plus"),
    ("amira", "NVDA", .25, TODAY, "pause", "pause", "PDF p.5 : « risque élevé » ≠ « tout est acceptable » ; diversification qu'elle a demandée"),
    ("amira", "SHOP.TO", .25, TODAY, "pause", "pause", "idem"),
    ("amira", "XIU.TO", .05, TODAY, "aucun", "attention", "FNB large : diversifiant, pas de pause attendue"),
    ("mateo", "XOM", .03, TODAY, "attention", "attention", "PDF p.6 : critères ESG ; la clause doit être évaluée (preuve ou données insuffisantes), sans pause"),
    ("mateo", "ENB.TO", .03, TODAY, "attention", "attention", "PDF p.6 : controverse documentée -> au moins ⚠, jamais ⛔ sur une clause qualitative"),
    ("mateo", "CNQ.TO", .03, TODAY, "attention", "attention", "énergie, pas de preuve ESG dans la base -> données insuffisantes"),
    ("mateo", "ESGV", .02, TODAY, "aucun", "attention", "FNB filtré ESG, petite taille : pas de pause attendue"),
    ("mateo", "BTC-USD", .10, TODAY, "pause", "pause", "PDF p.6 : peu intéressé par les placements hautement spéculatifs"),
    ("prudent", "NVDA", .10, TODAY, "pause", "pause", "PDF p.14 : profil prudent préparant un achat prochain"),
    ("prudent", "TSLA", .05, TODAY, "attention", "pause", "idem"),
    ("prudent", "ZST.TO", .05, TODAY, "aucun", "attention", "obligations à très court terme : cohérent avec un achat prochain"),
]
QUIET_MAX = {"aucun", "ok"}       # « quiet » scenarios: max level attention means no pause expected


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (max(0.0, (c - m) / d) * 100, min(1.0, (c + m) / d) * 100)


def main() -> None:
    t_all = time.perf_counter()
    dp = get_datapack()
    store = LocalStore(tempfile.mkdtemp(prefix="ulysse-bench-"))
    set_store(store)
    demo.reset(store)
    profils = {pid: persona(pid) for pid in ("amira", "mateo", "robert")}
    profils["prudent"] = construire(PRUDENT, "prudent")
    store.put("profils", "prudent", profils["prudent"][0].model_dump())
    store.put("contrats", "prudent", profils["prudent"][1].model_dump())

    def order(pid, t, size, day, horizon=None):
        prof, con = profils[pid]
        v = dp.asof(day)
        pf = pfm.from_allocation(dp, prof.allocation.capital_cad, prof.allocation.poids, prof.allocation.constitue_le, as_of=day)
        total = pfm.valuation(v, pf)["total_cad"]
        return policy.signal_ordre(v, con, pf, t, size * total, options=False, horizon_override=horizon)

    # 1-2 labelled scenarios ---------------------------------------------------------------------------------------
    rows, ok_n, fa_quiet, n_quiet, lat = [], 0, 0, 0, []
    for pid, t, size, day, lo, hi, why in SCENARIOS:
        s = order(pid, t, size, day)
        lat.append(s.latence_ms or 0.0)
        good = ORD[lo] <= ORD[s.niveau] <= ORD[hi]
        ok_n += good
        if hi != "pause":
            n_quiet += 1
            fa_quiet += s.niveau == "pause"
        rows.append({"profil": pid, "titre": t, "taille_pct": size * 100, "date": day, "attendu": f"{lo}..{hi}", "obtenu": s.niveau,
                     "regles": s.regles_declenchees, "conforme": good, "pourquoi": why})
    # 3 stability ----------------------------------------------------------------------------------------------------
    stab_n, stab_ok = 0, 0
    for pid, t, size, day, *_ in SCENARIOS[::3]:
        outs = {order(pid, t, size, day).model_dump_json(exclude={"latence_ms"}) for _ in range(5)}
        stab_n += 1
        stab_ok += len(outs) == 1
    # 4 proportionality + 5 no future information (generated grid) ------------------------------------------------------
    grid_days = ["2021-12-15", "2022-10-14", "2024-06-20", TODAY]
    tickers = dp.tickers
    mono_n = mono_ok = 0
    fut_n = fut_ok = 0
    for pid in profils:
        for day in grid_days:
            for t in tickers:
                if dp.asof(day).first_valid(t) is None:
                    continue
                levels = []
                for size in (.01, .05, .10, .20):
                    s = order(pid, t, size, day)
                    lat.append(s.latence_ms or 0.0)
                    levels.append(ORD[s.niveau])
                    fut_n += 1
                    fut_ok += all(np.datetime64(p["date_de_calcul"]) <= np.datetime64(day) for p in s.preuves)
                mono_n += 1
                mono_ok += all(a <= b for a, b in zip(levels, levels[1:]))
    # 6-7-8 dossiers: numbers with proof, verifier rejections (injected defects), duration -----------------------------------
    dossier_cases = [("robert", {"type": "ordre", "ticker": "TSLA", "montant_cad": 160000}, TODAY),
                     ("robert", {"type": "ordre", "ticker": "TSLA", "montant_cad": 140000}, PAST),
                     ("amira", {"type": "ordre", "ticker": "BTC-USD", "montant_cad": 2000}, TODAY),
                     ("amira", {"type": "portefeuille"}, TODAY),
                     ("mateo", {"type": "ordre", "ticker": "XOM", "montant_cad": 5000}, TODAY),
                     ("mateo", {"type": "ordre", "ticker": "ENB.TO", "montant_cad": 5000}, TODAY),
                     ("prudent", {"type": "ordre", "ticker": "NVDA", "montant_cad": 7000}, TODAY),
                     ("robert", {"type": "titre", "ticker": "NVDA"}, TODAY)]
    dos_n = dos_proved = drafts = rejected = corrected = 0
    durations = []
    for pid, it, day in dossier_cases:
        for llm in (MockLLM(), MockLLM(defaut_injecte="chiffre")):
            d = orchestrator.executer(store, orchestrator.creer(store, pid, it, day), llm)
            dos_n += 1
            durations.append(d.get("duree_totale_ms", 0.0))
            last = d["essais_verification"][-1]
            dos_proved += d["etat"] == "termine" and last["resultat"] == "accepte"
            llm_drafts = [e for e in d["essais_verification"] if e["essai"] != "gabarit"]
            drafts += 1
            rejected += any(e["resultat"] == "rejete" for e in llm_drafts)
            corrected += any(e["resultat"] == "rejete" for e in llm_drafts) and last["resultat"] == "accepte" and last["essai"] != "gabarit"

    def pct(k, n):
        return k / n * 100 if n else None

    lat_sorted = sorted(lat)
    mets = [
        {"cle": "signaux_attendus", "libelle": "Signaux attendus qui se déclenchent (scénarios étiquetés d'après l'énoncé)", "valeur": pct(ok_n, len(SCENARIOS)),
         "unite": "%", "n": len(SCENARIOS), "ic95": wilson(ok_n, len(SCENARIOS)), "niveau": "Mesuré"},
        {"cle": "fausses_alertes", "libelle": "Fausses alertes : pause sur un scénario où aucune pause n'est attendue", "valeur": pct(fa_quiet, n_quiet),
         "unite": "%", "n": n_quiet, "ic95": wilson(fa_quiet, n_quiet), "niveau": "Mesuré"},
        {"cle": "stabilite", "libelle": "Stabilité : même entrée exécutée 5 fois, même statut", "valeur": pct(stab_ok, stab_n), "unite": "%", "n": stab_n,
         "ic95": wilson(stab_ok, stab_n), "niveau": "Mesuré"},
        {"cle": "proportionnalite", "libelle": "Proportionnalité : un ordre plus gros n'est jamais jugé moins sévèrement (1 %, 5 %, 10 %, 20 %)",
         "valeur": pct(mono_ok, mono_n), "unite": "%", "n": mono_n, "ic95": wilson(mono_ok, mono_n), "niveau": "Mesuré"},
        {"cle": "pas_d_information_future", "libelle": "Aucune preuve postérieure à la date simulée (4 dates, dont 2021 et 2022)",
         "valeur": pct(fut_ok, fut_n), "unite": "%", "n": fut_n, "ic95": wilson(fut_ok, fut_n), "niveau": "Mesuré"},
        {"cle": "chiffres_prouves", "libelle": "Dossiers publiés dont chaque chiffre est relié à une preuve citée (vérificateur)",
         "valeur": pct(dos_proved, dos_n), "unite": "%", "n": dos_n, "ic95": wilson(dos_proved, dos_n), "niveau": "Mesuré"},
        {"cle": "rejets_verificateur", "libelle": "Brouillons rejetés au moins une fois par le vérificateur (LLM simulé, défauts injectés dans la moitié des cas)",
         "valeur": pct(rejected, drafts), "unite": "%", "n": drafts, "ic95": wilson(rejected, drafts), "niveau": "Indicatif",
         "note": f"{corrected} défauts injectés corrigés au second essai sur {rejected}. Le taux réel se mesure avec Bedrock (phase 7)."},
        {"cle": "latence_signal_p50", "libelle": "Latence du signal (vérification d'ordre), médiane, local", "valeur": statistics.median(lat_sorted), "unite": "ms",
         "n": len(lat_sorted), "niveau": "Mesuré"},
        {"cle": "latence_signal_p95", "libelle": "Latence du signal, 95e centile, local", "valeur": lat_sorted[int(0.95 * (len(lat_sorted) - 1))], "unite": "ms",
         "n": len(lat_sorted), "niveau": "Mesuré", "note": "Cible : moins de 300 ms. Mesure sur AWS en phase 7."},
        {"cle": "duree_dossier", "libelle": "Durée d'un dossier complet, médiane, local avec LLM simulé", "valeur": statistics.median(durations), "unite": "ms",
         "n": len(durations), "niveau": "Indicatif", "note": "Sans appel LLM réel : la durée avec Bedrock sera mesurée en phase 7."},
        {"cle": "cout_dossier", "libelle": "Coût par dossier", "valeur": None, "unite": "$ US", "n": 0, "niveau": "Indicatif",
         "note": "Non mesuré : nécessite Bedrock (phase 7). Estimation a priori dans docs/aws.md."},
    ]
    res = {"disponible": True, "execute_le": time.strftime("%Y-%m-%d %H:%M"), "environnement": "local, LLM simulé, datapack du 2026-11-12",
           "duree_s": round(time.perf_counter() - t_all, 1), "metriques": mets, "scenarios": rows}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "fiabilite.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    lines = ["# Banc d'essai — résultats", "", f"Exécuté le {res['execute_le']} · {res['environnement']} · {res['duree_s']} s", "",
             "| Mesure | Résultat | n | IC 95 % (Wilson) | Niveau |", "|---|---|---|---|---|"]
    for m in mets:
        v = "—" if m["valeur"] is None else (f"{m['valeur']:.1f} %" if m["unite"] == "%" else f"{m['valeur']:.0f} {m['unite']}")
        ic = f"{m['ic95'][0]:.1f}–{m['ic95'][1]:.1f} %" if m.get("ic95") else "—"
        lines.append(f"| {m['libelle']} | {v} | {m['n']} | {ic} | {m['niveau']} |")
    lines += ["", "## Scénarios étiquetés", "", "| Profil | Titre | Taille | Date | Attendu | Obtenu | Conforme | Pourquoi |", "|---|---|---|---|---|---|---|---|"]
    lines += [f"| {r['profil']} | {r['titre']} | {r['taille_pct']:.0f} % | {r['date']} | {r['attendu']} | {r['obtenu']} | {'oui' if r['conforme'] else '**non**'} | {r['pourquoi']} |" for r in rows]
    (OUT / "rapport.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines[:16]))
    bad = [r for r in rows if not r["conforme"]]
    if bad:
        print("\nNON CONFORMES :", json.dumps(bad, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
