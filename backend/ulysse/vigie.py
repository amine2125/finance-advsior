"""La Vigie: background watch (hourly via EventBridge Scheduler on AWS, on demand, or replayed at
a past date). LLM: plans WHAT to watch per profile, only when the contract changes. Code: computes.

Per profile it:
  1. checks drift of the portfolio beyond a rule (signal on the current state);
  2. watches unusual attention on held and watched assets (hype detector);
  3. reports a change of market climate (regime);
  4. pre-computes the « signal pack »: for every asset, what the « Pour toi » band shows, so that
     screens display signals in < 300 ms without recomputation;
  5. writes notifications (level >= the profile's preference, new only: no repeat within 7 days).
Usage: python -m ulysse.vigie [--as-of 2021-12-15] [--profil <identifiant>]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time

import numpy as np

from ulysse import policy, positions
from ulysse.analytics import hype, portfolio as pfm, regime
from ulysse.config import DEFAULT_ASOF
from ulysse.contract.evaluate import asset_facts
from ulysse.contract.schema import Contrat, Profil
from ulysse.data.datapack import get_datapack
from ulysse.store import get_store, now_iso

ORDRE = {"aucun": 0, "ok": 1, "attention": 2, "pause": 3}
TAILLE_REFERENCE = 0.05    # « Pour toi » band: how a 5 % position would fit your rules (documented hypothesis)
NOUVEAUTE_JOURS = 7


def plan_surveillance(profil: Profil, contrat: Contrat) -> dict:
    """Deterministic default watch plan (the LLM may refine it when the contract changes)."""
    modules = ["derive", "engouement", "regime"]
    if profil.preferences.esg_important:
        modules.append("esg")
    if profil.preferences.interet_crypto:
        modules.append("crypto")
    return {"modules": modules, "contrat_version": contrat.version, "planifie_par": "regles", "le": now_iso()}


def executer(as_of: str | None = None, profils: list[str] | None = None, store=None) -> dict:
    store = store or get_store()
    t0 = time.perf_counter()
    as_of = as_of or DEFAULT_ASOF
    dp = get_datapack()
    v = dp.asof(as_of)
    out = {"as_of": as_of, "donnees_jusqu_au": v.date, "debut": now_iso(), "profils": {}}
    reg = regime.ev_regime(v)
    for pid in profils or store.list("profils"):
        prof = Profil(**store.get("profils", pid))
        con = Contrat(**store.get("contrats", pid))
        plan = store.get("vigie_plans", pid)
        if not plan or plan.get("contrat_version") != con.version:
            plan = plan_surveillance(prof, con)
            store.put("vigie_plans", pid, plan)
        pf = positions.portefeuille(prof, as_of)
        total = pfm.valuation(v, pf)["total_cad"]
        notes = []
        # 1. drift --------------------------------------------------------------------------------
        sig = policy.signal_etat(v, con, pf)
        derives = [c for c in sig.clauses if c.statut == "depassee"]
        if derives:
            notes.append(_note(pid, as_of, "derive", "attention", "Ton portefeuille a dérivé au-delà d'une de tes règles",
                               "; ".join(c.explication for c in derives[:2]), [p for c in derives for p in c.preuves], "/portefeuille",
                               key="|".join(sorted(c.clause_id for c in derives))))
        # 2. unusual attention on held / watched assets --------------------------------------------------
        held = [h.ticker for h in pf.holdings]
        watched = store.get("surveillance", pid, [])
        for t in sorted(set(held) | set(watched)):
            if dp.asset[t]["asset_class"] not in ("equity", "crypto"):
                continue
            e = hype.ev_engouement(v, t)
            if e.statut == "ok" and e.valeur["engouement"]:
                where = "que tu détiens" if t in held else "de ta liste de surveillance"
                notes.append(_note(pid, as_of, "engouement", "attention" if t in held else "ok",
                                   f"Attention inhabituelle sur {t}, un titre {where}",
                                   ("Plus inhabituelle que tous les jours passés de ce titre." if e.valeur['plus_inhabituel_que_pct_des_jours'] >= 99.95
                                    else f"Plus inhabituelle que {e.valeur['plus_inhabituel_que_pct_des_jours']:.1f} % des jours passés de ce titre.".replace(".", ",", 1)),
                                   [e.id], f"/titre/{t}", key=t))
        # 3. market climate change ---------------------------------------------------------------------------
        last = store.get("vigie_regime", pid)
        if reg.statut == "ok" and last and last.get("regime") != reg.valeur["regime"]:
            notes.append(_note(pid, as_of, "regime", "ok", f"Le climat de marché est passé de « {last['regime']} » à « {reg.valeur['regime']} »",
                               "Description du présent, pas une prévision.", [reg.id], "/tendances", key=reg.valeur["regime"]))
        if reg.statut == "ok":
            store.put("vigie_regime", pid, {"regime": reg.valeur["regime"], "as_of": as_of})
        # 4. signal pack -------------------------------------------------------------------------------------------
        pack = {}
        lt = pfm.look_through(v, pf)
        for t in dp.tickers:
            if v.first_valid(t) is None:
                continue
            s = policy.signal_ordre(v, con, pf, t, TAILLE_REFERENCE * total, options=False)
            f = asset_facts(v, t)
            pack[t] = {"niveau": s.niveau, "mode": s.mode, "regles": s.regles_declenchees,
                       "clauses": [{"type": c.type, "statut": c.statut, "explication": c.explication} for c in s.clauses
                                   if c.statut in ("depassee", "approchee", "donnees_insuffisantes")][:3],
                       "deja_detenu_pct": lt["titres"].get(t, 0.0) * 100, "vol_1a": f.vol_1a, "pire_baisse_pct": f.pire_baisse_pct,
                       "taille_reference_pct": TAILLE_REFERENCE * 100}
        store.put("signal_packs", f"{pid}@{as_of}", {"as_of": as_of, "calcule_le": now_iso(), "titres": pack})
        # 5. notifications (preference + novelty) ---------------------------------------------------------------------
        mini = ORDRE[prof.preferences.notifications_min]
        existing = store.get("notifications", pid, [])
        kept = []
        for n in notes:
            if ORDRE[n["niveau"]] < mini:
                continue
            if any(x["cle"] == n["cle"] and abs((np.datetime64(x["as_of"]) - np.datetime64(as_of)).astype(int)) < NOUVEAUTE_JOURS
                   for x in existing):
                continue
            kept.append(n)
        if kept:
            store.put("notifications", pid, (existing + kept)[-200:])
            for n in kept:
                store.append("journal", pid, {"type": "notification", "a": now_iso(), "as_of": as_of, "niveau": n["niveau"],
                                              "titre": n["titre"], "id": n["id"]})
        out["profils"][pid] = {"plan": plan["modules"], "notifications_creees": len(kept), "signaux_precalcules": len(pack)}
    out["duree_ms"] = round((time.perf_counter() - t0) * 1000)
    out["fin"] = now_iso()
    store.append("vigie_executions", "historique", out)
    return out


def _note(pid, as_of, type_, niveau, titre, message, preuves, lien, key) -> dict:
    cle = f"{type_}:{key}"
    return {"id": "N-" + hashlib.sha1(f"{pid}|{cle}|{as_of}".encode()).hexdigest()[:10], "profil": pid, "as_of": as_of,
            "type": type_, "niveau": niveau, "titre": titre, "message": message, "preuves": preuves, "lien": lien,
            "cle": cle, "lu": False, "cree_le": now_iso()}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Vigie ULYSSE")
    ap.add_argument("--as-of", default=None)
    ap.add_argument("--profil", action="append")
    a = ap.parse_args()
    print(json.dumps(executer(a.as_of, a.profil), ensure_ascii=False, indent=1))
