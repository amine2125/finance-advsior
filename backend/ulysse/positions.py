"""Simulated holdings and cash of a profile: what the person owns, and what changes when they decide.

Until the person changes anything, the portfolio is the fictitious allocation of the profile (capital split by weights at
`constitue_le`, unchanged behaviour). The first change (order, sale, deposit, manual edit, CSV import, simulated
connection) stores a record:

  lots        dated transactions {ticker, quantite (+ buy / − sale), date, prix_cad, compte, origine}
  mouvements  dated cash movements {montant_cad (+ in / − out), type, libelle}
  appliques   ids of the orders already applied (a double click never applies an order twice)

The portfolio at a date only uses lots and movements dated on or before that date (no information from the future,
PDF p. 14). Simulation only: no real transaction, no real account, no credential is ever asked (PDF p. 17).
"""
from __future__ import annotations

import csv
import hashlib
import io
import random
import threading
import uuid

import numpy as np

from ulysse.analytics import portfolio as pfm
from ulysse.contract.schema import Profil
from ulysse.data.datapack import get_datapack
from ulysse.store import get_store, now_iso

KIND = "positions"
MAX_DEPOT = 100_000.0
_LOCK = threading.RLock()


class SoldeInsuffisant(ValueError):
    pass


class PositionInsuffisante(ValueError):
    pass


# ------------------------------------------------------------------------------------------------ reading

def _initial(prof: Profil) -> dict:
    """The record equivalent to the profile's fictitious allocation (same quantities as from_allocation)."""
    dp = get_datapack()
    a = prof.allocation
    pf = pfm.from_allocation(dp, a.capital_cad, a.poids, a.constitue_le)
    day = pf.meta["constitue_le"]
    v = dp.asof(day)
    lots = [{"id": _id(), "ticker": h.ticker, "quantite": h.quantity, "date": day, "prix_cad": pfm._price_cad(v, h.ticker),
             "compte": None, "origine": "allocation_initiale"} for h in pf.holdings]
    mvts = [{"id": _id(), "date": day, "type": "initial", "montant_cad": round(pf.cash_cad, 2), "libelle": "Liquidités de départ (fictives)"}]
    return {"profil_id": prof.id, "origine": "allocation_initiale", "allocation_initiale": a.model_dump(), "capital_initial_cad": a.capital_cad,
            "lots": lots, "mouvements": mvts, "appliques": [], "cree_le": now_iso()}


def record(pid: str) -> dict | None:
    return get_store().get(KIND, pid)


def portefeuille(prof: Profil, as_of: str) -> pfm.Portfolio:
    """The portfolio of the profile at `as_of`, as the rest of the engine expects it."""
    dp = get_datapack()
    rec = record(prof.id)
    a = prof.allocation
    if rec is None:
        return pfm.from_allocation(dp, a.capital_cad, a.poids, a.constitue_le, as_of=as_of)
    ini = rec.get("allocation_initiale")
    if ini and np.datetime64(as_of) < np.datetime64(ini["constitue_le"]):
        # before the fictitious portfolio existed: same documented hypothesis as before (constituted at the simulation date)
        return pfm.from_allocation(dp, ini["capital_cad"], ini["poids"], ini["constitue_le"], as_of=as_of)
    qty: dict[str, float] = {}
    for lot in rec["lots"]:
        if lot["date"] <= as_of:
            qty[lot["ticker"]] = qty.get(lot["ticker"], 0.0) + float(lot["quantite"])
    cash = sum(float(m["montant_cad"]) for m in rec["mouvements"] if m["date"] <= as_of)
    debut = min([lot["date"] for lot in rec["lots"]] + [m["date"] for m in rec["mouvements"]], default=as_of)
    hs = [pfm.Holding(t, q) for t, q in sorted(qty.items()) if q > 1e-9]
    return pfm.Portfolio(hs, max(cash, 0.0), meta={"constitue_le": debut, "capital_initial": rec.get("capital_initial_cad"),
                                                   "origine": rec.get("origine")})


def vue(prof: Profil, as_of: str) -> dict:
    """Brokerage-style list: lines with quantity, price, value, cost and gain, plus cash and recent movements."""
    dp = get_datapack()
    v = dp.asof(as_of)
    pf = portefeuille(prof, as_of)
    val = pfm.valuation(v, pf)
    rec = record(prof.id)
    cout: dict[str, float] = {}
    comptes: dict[str, set] = {}
    if rec is not None:
        for lot in rec["lots"]:
            if lot["date"] <= as_of:
                cout[lot["ticker"]] = cout.get(lot["ticker"], 0.0) + float(lot["quantite"]) * float(lot["prix_cad"])
                if lot.get("compte"):
                    comptes.setdefault(lot["ticker"], set()).add(lot["compte"])
    lignes = []
    for x in val["lignes"]:
        t = x["ticker"]
        c = cout.get(t)
        lignes.append({**x, "nom": dp.asset[t]["name"], "classe": dp.asset[t]["asset_class"], "devise": dp.asset[t]["currency"],
                       "cout_cad": c, "gain_cad": (x["valeur_cad"] - c) if c else None,
                       "gain_pct": ((x["valeur_cad"] / c - 1) * 100) if c else None, "comptes": sorted(comptes.get(t, []))})
    mvts = [m for m in (rec or {}).get("mouvements", []) if m["date"] <= as_of]
    return {"as_of": as_of, "donnees_jusqu_au": v.date, "total_cad": val["total_cad"], "liquidites_cad": val["liquidites_cad"],
            "lignes": sorted(lignes, key=lambda x: -x["valeur_cad"]), "mouvements": mvts[::-1][:20],
            "origine": (rec or {}).get("origine", "allocation_initiale"), "modifiable": True,
            "note": "Simulation : placements et liquidités fictifs, évalués aux vrais cours de clôture convertis en CAD."}


MAX_POINTS_HISTORIQUE = 400


def _jour(dates: np.ndarray, d: str, i0: int) -> int:
    """Index (from i0) of the first close on or after `d`; a change dated after the last close counts on the last point."""
    return min(max(0, int(np.searchsorted(dates, np.datetime64(d))) - i0), len(dates) - 1 - i0)


def historique(prof: Profil, as_of: str, jours: int) -> dict:
    """Value of the profile's portfolio day by day over the last `jours` days (quantities and cash as they were each day,
    closing prices in CAD carried over non-trading days). The period change leaves out money that came from outside
    (deposits, holdings entered or connected), so a deposit never shows as a gain. Past only: nothing after `as_of`."""
    dp = get_datapack()
    v = dp.asof(as_of)
    rec = record(prof.id)
    if rec is None:
        pf = portefeuille(prof, as_of)
        debut = pf.meta["constitue_le"]
        lots = [{"ticker": h.ticker, "quantite": h.quantity, "date": debut, "prix_cad": None, "origine": "allocation_initiale"} for h in pf.holdings]
        mvts = [{"date": debut, "type": "initial", "montant_cad": pf.cash_cad}]
    else:
        lots = [lot for lot in rec["lots"] if lot["date"] <= as_of]
        mvts = [m for m in rec["mouvements"] if m["date"] <= as_of]
    dates = v.dates
    debut_pf = min([lot["date"] for lot in lots] + [m["date"] for m in mvts], default=str(v.day))
    fenetre = max(str(v.day - np.timedelta64(max(1, int(jours)), "D")), debut_pf)
    keep = np.flatnonzero(dates >= np.datetime64(fenetre))
    if not len(keep):
        return {"as_of": str(v.day), "jours": jours, "debut": debut_pf, "serie": [], "variation_cad": None, "variation_pct": None,
                "veille_cad": None}
    i0 = int(keep[0])
    tickers = sorted({lot["ticker"] for lot in lots})
    n = len(dates)
    valeur = np.zeros(n - i0)
    entrees = np.zeros(n - i0)     # money from outside, by day (deposits; holdings entered, connected or allocated)
    for t in tickers:
        px = v.series(t, "close", "CAD")
        ok = ~np.isnan(px)
        last = np.where(ok, np.arange(n), -1)
        np.maximum.accumulate(last, out=last)
        px = np.where(last >= 0, px[np.clip(last, 0, None)], np.nan)[i0:]
        q = np.zeros(n - i0)
        for lot in (x for x in lots if x["ticker"] == t):
            k = _jour(dates, lot["date"], i0)
            q[k:] += float(lot["quantite"])
            if lot.get("origine") not in ("ordre", "vente") and lot["date"] >= fenetre:
                pk = px[k] if not np.isnan(px[k]) else float(lot.get("prix_cad") or 0)
                entrees[k] += float(lot["quantite"]) * pk
        valeur += np.nan_to_num(q * px)
    for m in mvts:
        k = _jour(dates, m["date"], i0)
        valeur[k:] += float(m["montant_cad"])
        if m.get("type") in ("depot", "initial") and m["date"] >= fenetre:
            entrees[k] += float(m["montant_cad"])
    entrees[0] = 0.0                 # what is there on the first day is the starting point, not a flow
    pas = max(1, -(-len(valeur) // MAX_POINTS_HISTORIQUE))
    idx = list(range(0, len(valeur), pas))
    if idx[-1] != len(valeur) - 1:
        idx.append(len(valeur) - 1)
    serie = [{"date": str(dates[i0 + i]), "valeur_cad": round(float(valeur[i]), 2)} for i in idx]
    gain = float(valeur[-1] - valeur[0] - entrees.sum())
    base = float(valeur[0] + entrees.sum())
    trad = np.flatnonzero(np.diff(valeur) != 0)
    # last move between two closes, without the money added since
    veille = float(valeur[-1] - valeur[trad[-1]] - entrees[trad[-1] + 1:].sum()) if len(trad) else 0.0
    return {"as_of": str(v.day), "jours": jours, "debut": debut_pf, "serie": serie, "variation_cad": round(gain, 2),
            "variation_pct": round(gain / base * 100, 4) if base > 0 else None, "veille_cad": round(veille, 2),
            "note": "Valeur quotidienne du portefeuille simulé (cours de clôture en CAD). La variation exclut l'argent ajouté "
                    "(dépôts, placements saisis ou connectés)."}


# ------------------------------------------------------------------------------------------------ changes

def _id() -> str:
    return uuid.uuid4().hex[:12]


def _charger(prof: Profil) -> dict:
    return record(prof.id) or _initial(prof)


def _derniere_date(rec: dict) -> str:
    return max([lot["date"] for lot in rec["lots"]] + [m["date"] for m in rec["mouvements"]], default="0000-00-00")


def _verifier_date(rec: dict, as_of: str) -> None:
    last = _derniere_date(rec)
    if as_of < last:
        raise ValueError(f"Ton portefeuille a déjà changé le {last} : une opération ne peut pas être datée avant "
                         "(reviens au présent ou à une date plus récente dans la machine à remonter le temps).")


def _cash(rec: dict, as_of: str) -> float:
    return sum(float(m["montant_cad"]) for m in rec["mouvements"] if m["date"] <= as_of)


def _held(rec: dict, ticker: str, as_of: str) -> float:
    return sum(float(lot["quantite"]) for lot in rec["lots"] if lot["ticker"] == ticker and lot["date"] <= as_of)


def _sauver(rec: dict) -> None:
    rec["modifie_le"] = now_iso()
    get_store().put(KIND, rec["profil_id"], rec)


def acheter(prof: Profil, ticker: str, montant_cad: float, as_of: str, ordre_id: str | None = None, libelle: str = "") -> dict:
    """Simulated purchase at the closing price of `as_of`, paid with the profile's cash. Refused if the cash is short."""
    if not montant_cad > 0:
        raise ValueError("Le montant doit être positif.")
    dp = get_datapack()
    with _LOCK:
        rec = _charger(prof)
        if ordre_id and ordre_id in rec["appliques"]:
            return {"deja_applique": True, "liquidites_cad": _cash(rec, as_of)}
        _verifier_date(rec, as_of)
        dispo = _cash(rec, as_of)
        if montant_cad > dispo + 0.5:
            raise SoldeInsuffisant(f"Liquidités insuffisantes : {_fmt(dispo)} disponibles pour un achat de {_fmt(montant_cad)}. "
                                   "Ajoute des fonds (simulation) ou réduis le montant.")
        v = dp.asof(as_of)
        px = pfm._price_cad(v, ticker)
        rec["lots"].append({"id": _id(), "ticker": ticker, "quantite": montant_cad / px, "date": str(v.day), "prix_cad": px,
                            "compte": None, "origine": "ordre"})
        rec["mouvements"].append({"id": _id(), "date": str(v.day), "type": "achat", "montant_cad": -round(montant_cad, 2),
                                  "ticker": ticker, "libelle": libelle or f"Achat simulé de {ticker}"})
        if ordre_id:
            rec["appliques"] = (rec["appliques"] + [ordre_id])[-500:]
        _sauver(rec)
        return {"deja_applique": False, "liquidites_cad": _cash(rec, as_of), "prix_cad": px, "quantite": montant_cad / px}


def vendre(prof: Profil, ticker: str, montant_cad: float | None, as_of: str, tout: bool = False, ordre_id: str | None = None) -> dict:
    """Simulated sale at the closing price of `as_of`; the proceeds go to cash. Never more than what is held."""
    dp = get_datapack()
    with _LOCK:
        rec = _charger(prof)
        if ordre_id and ordre_id in rec["appliques"]:
            return {"deja_applique": True, "liquidites_cad": _cash(rec, as_of)}
        _verifier_date(rec, as_of)
        v = dp.asof(as_of)
        px = pfm._price_cad(v, ticker)
        held = _held(rec, ticker, as_of)
        if held <= 1e-9:
            raise PositionInsuffisante(f"Tu ne détiens pas de {ticker}.")
        q = held if tout else (float(montant_cad or 0) / px)
        if q <= 0:
            raise ValueError("Le montant doit être positif.")
        if q > held * 1.0001:
            raise PositionInsuffisante(f"Tu détiens {_fmt(held * px)} de {ticker} : impossible d'en vendre {_fmt(q * px)}.")
        q = min(q, held)
        rec["lots"].append({"id": _id(), "ticker": ticker, "quantite": -q, "date": str(v.day), "prix_cad": px, "compte": None, "origine": "vente"})
        rec["mouvements"].append({"id": _id(), "date": str(v.day), "type": "vente", "montant_cad": round(q * px, 2), "ticker": ticker,
                                  "libelle": f"Vente simulée de {ticker}"})
        if ordre_id:
            rec["appliques"] = (rec["appliques"] + [ordre_id])[-500:]
        _sauver(rec)
        return {"deja_applique": False, "liquidites_cad": _cash(rec, as_of), "montant_cad": q * px}


def deposer(prof: Profil, montant_cad: float, as_of: str) -> dict:
    if not 0 < montant_cad <= MAX_DEPOT:
        raise ValueError(f"Le dépôt doit être entre 1 $ et {_fmt(MAX_DEPOT)}.")
    with _LOCK:
        rec = _charger(prof)
        _verifier_date(rec, as_of)
        day = str(get_datapack().asof(as_of).day)
        rec["mouvements"].append({"id": _id(), "date": day, "type": "depot", "montant_cad": round(montant_cad, 2), "libelle": "Dépôt (simulation)"})
        _sauver(rec)
        return {"liquidites_cad": _cash(rec, as_of)}


def remplacer(prof: Profil, lignes: list[dict], liquidites_cad: float, as_of: str, origine: str) -> dict:
    """Manual entry / CSV import: the holdings become exactly `lignes` ({ticker, quantite} or {ticker, montant_cad}) at `as_of`."""
    dp = get_datapack()
    v = dp.asof(as_of)
    day = str(v.day)
    lots = []
    for ln in lignes:
        t = str(ln.get("ticker", "")).strip().upper()
        if t not in dp.idx:
            raise ValueError(f"« {t} » n'est pas couvert : l'univers du jeu de départ compte 31 actifs.")
        px = pfm._price_cad(v, t)
        q = float(ln["quantite"]) if ln.get("quantite") not in (None, "") else float(ln.get("montant_cad") or 0) / px
        if q <= 0:
            raise ValueError(f"{t} : quantité ou montant non positif.")
        lots.append({"id": _id(), "ticker": t, "quantite": q, "date": day, "prix_cad": float(ln.get("prix_cad") or px),
                     "compte": ln.get("compte"), "origine": origine})
    if liquidites_cad < 0:
        raise ValueError("Les liquidités ne peuvent pas être négatives.")
    total = sum(lot["quantite"] * pfm._price_cad(v, lot["ticker"]) for lot in lots) + liquidites_cad
    rec = {"profil_id": prof.id, "origine": origine, "allocation_initiale": None, "capital_initial_cad": round(total, 2), "lots": lots,
           "mouvements": [{"id": _id(), "date": day, "type": "initial", "montant_cad": round(liquidites_cad, 2), "libelle": "Liquidités déclarées"}],
           "appliques": [], "cree_le": now_iso()}
    with _LOCK:
        _sauver(rec)
    return rec


def parse_csv(text: str) -> list[dict]:
    """Documented format: header `ticker,quantite` or `ticker,montant_cad` (one of the two per line)."""
    if len(text) > 200_000:
        raise ValueError("Fichier CSV trop volumineux (200 Ko au maximum).")
    rows = list(csv.DictReader(io.StringIO(text.strip())))
    if not rows:
        raise ValueError("Aucune ligne dans le fichier.")
    out = []
    for i, r in enumerate(rows, start=2):
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        t = r.get("ticker") or r.get("symbole") or r.get("asset_id")
        if not t:
            raise ValueError("Colonne « ticker » manquante.")
        q, m = r.get("quantite") or r.get("quantity"), r.get("montant_cad")
        try:
            out.append({"ticker": t.upper(), "quantite": float(q.replace(",", "."))} if q else
                       {"ticker": t.upper(), "montant_cad": float(m.replace(",", "."))} if m else None)
        except ValueError:
            raise ValueError(f"Ligne {i} : quantité ou montant illisible.") from None
        if out[-1] is None:
            raise ValueError(f"Ligne {i} : il faut une quantité ou un montant.")
    return out


# ------------------------------------------------------------------------------------------------ simulated connection

INSTITUTIONS = [
    {"id": "bnc", "nom": "Banque Nationale", "type": "Banque"}, {"id": "desjardins", "nom": "Desjardins", "type": "Coopérative"},
    {"id": "rbc", "nom": "RBC Banque Royale", "type": "Banque"}, {"id": "td", "nom": "TD", "type": "Banque"},
    {"id": "bmo", "nom": "BMO", "type": "Banque"}, {"id": "scotia", "nom": "Banque Scotia", "type": "Banque"},
    {"id": "wealthsimple", "nom": "Wealthsimple", "type": "Courtier en ligne"}, {"id": "disnat", "nom": "Disnat", "type": "Courtier en ligne"},
]
# Account styles seen in practice (fictitious): a tech-heavy CELI, a classic REER, a speculative non-registered account, a cautious CELIAPP.
TYPES_COMPTE = {
    "celi": ("CELI", (12_000, 45_000), [("QQQ", .30), ("NVDA", .15), ("SHOP.TO", .12), ("AAPL", .10), ("XIU.TO", .18), ("MSFT", .15)]),
    "reer": ("REER", (20_000, 80_000), [("XIU.TO", .30), ("SPY", .25), ("RY.TO", .12), ("TD.TO", .10), ("XBB.TO", .15), ("ENB.TO", .08)]),
    "non_reg": ("Non enregistré", (5_000, 30_000), [("TSLA", .25), ("BTC-USD", .15), ("AMZN", .20), ("CNQ.TO", .15), ("GLD", .10), ("ATD.TO", .15)]),
    "celiapp": ("CELIAPP", (4_000, 16_000), [("XBB.TO", .40), ("ZST.TO", .30), ("XIU.TO", .30)]),
}
FENETRE_ACHATS = ("2022-02-01", "2025-09-30")


def _comptes(pid: str, inst: str, as_of: str) -> list[dict]:
    """Deterministic per (profile, institution): reconnecting shows the same accounts. Each position was "bought" on a past
    trading day at that day's real close, so cost and gain are computed from real data. Purchases after `as_of` are left out."""
    dp = get_datapack()
    rng = random.Random(int(hashlib.sha256(f"{pid}:{inst}".encode()).hexdigest()[:12], 16))
    kinds = ["celi", "reer"] + (["non_reg"] if rng.random() < 0.75 else []) + (["celiapp"] if rng.random() < 0.4 else [])
    debut, fin = np.datetime64(FENETRE_ACHATS[0]), np.datetime64(FENETRE_ACHATS[1])
    span = int((fin - debut).astype(int))
    vnow = dp.asof(as_of)
    out = []
    for k in kinds:
        label, (lo, hi), mix = TYPES_COMPTE[k]
        mix = [(t, w * rng.uniform(0.6, 1.4)) for t, w in mix if t in dp.idx]
        if len(mix) > 3 and rng.random() < 0.5:
            mix.pop(rng.randrange(len(mix)))
        tot_w = sum(w for _, w in mix)
        investi = round(rng.uniform(lo, hi), -2)
        numero = f"•••• {rng.randrange(1000, 9999)}"
        lignes = []
        for t, w in mix:
            day = str(debut + np.timedelta64(rng.randrange(span), "D"))
            if day > as_of:
                continue
            v = dp.asof(day)
            try:
                px = pfm._price_cad(v, t)
            except ValueError:
                continue
            montant = investi * w / tot_w
            lignes.append({"ticker": t, "quantite": montant / px, "date": str(v.day), "prix_cad": px, "compte": f"{label} {numero}"})
        if not lignes:
            continue
        valeur = sum(ln["quantite"] * pfm._price_cad(vnow, ln["ticker"]) for ln in lignes)
        out.append({"id": k, "libelle": label, "numero": numero, "valeur_cad": round(valeur, 2),
                    "cout_cad": round(sum(ln["quantite"] * ln["prix_cad"] for ln in lignes), 2), "n_lignes": len(lignes), "lignes": lignes})
    return out


def apercu_connexion(pid: str, inst_id: str, as_of: str) -> dict:
    inst = next((i for i in INSTITUTIONS if i["id"] == inst_id), None)
    if inst is None:
        raise ValueError("Institution inconnue.")
    return {"institution": inst, "comptes": [{k: v for k, v in c.items() if k != "lignes"} for c in _comptes(pid, inst_id, as_of)],
            "mode": "simulation", "note": "Aucune connexion réelle, aucun identifiant demandé : comptes simulés à partir de prix historiques réels."}


def connecter(prof: Profil, inst_id: str, comptes: list[str], liquidites_cad: float, as_of: str) -> dict:
    inst = next((i for i in INSTITUTIONS if i["id"] == inst_id), None)
    if inst is None:
        raise ValueError("Institution inconnue.")
    choisis = [c for c in _comptes(prof.id, inst_id, as_of) if c["id"] in set(comptes)]
    if not choisis:
        raise ValueError("Choisis au moins un compte.")
    lots = [{"id": _id(), **ln, "origine": f"connexion:{inst_id}"} for c in choisis for ln in c["lignes"]]
    day = min(lot["date"] for lot in lots)
    rec = {"profil_id": prof.id, "origine": f"connexion:{inst_id}", "allocation_initiale": None,
           "capital_initial_cad": round(sum(c["cout_cad"] for c in choisis) + liquidites_cad, 2), "lots": lots,
           "mouvements": [{"id": _id(), "date": day, "type": "initial", "montant_cad": round(liquidites_cad, 2),
                           "libelle": f"Liquidités ({inst['nom']}, simulation)"}],
           "appliques": [], "cree_le": now_iso(), "institution": inst["nom"], "comptes": [f"{c['libelle']} {c['numero']}" for c in choisis]}
    with _LOCK:
        _sauver(rec)
    return rec


def reinitialiser(pid: str) -> None:
    """Back to the profile's fictitious allocation."""
    get_store().delete(KIND, pid)


def _fmt(x: float) -> str:
    return f"{x:,.0f} $".replace(",", " ")
