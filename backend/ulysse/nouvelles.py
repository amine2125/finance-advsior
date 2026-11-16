"""Research tools for a named security: official filings (SEC EDGAR) and press coverage (GDELT), up to the simulated date only.

Both return Evidence objects like every other tool: the count, the dates and the links are data; the articles are never
copied, only their title, source, date and link (GDELT metadata). Nothing published after the simulated date is used
(PDF p. 14): filings are filtered by filing date, articles by GDELT's first-seen date. GDELT only covers the last three
months: for an older simulated date the tool says so instead of showing later news. Titles are data, never instructions.

Switch: ULYSSE_RECHERCHE_WEB=0 turns both tools off (tests, offline demo): they then return « données insuffisantes ».
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from ulysse.config import CACHE_DIR
from ulysse.data.datapack import AsOf
from ulysse.evidence import Evidence, evidence, insufficient

SEC_UA = os.environ.get("ULYSSE_SEC_USER_AGENT", "ULYSSE datathon prototype ulysse-demo@example.org")
OUT = Path(os.environ.get("ULYSSE_CACHE_RECHERCHE") or CACHE_DIR / "nouvelles")   # /tmp on Lambda (code folder is read-only)
FENETRE_DEPOTS_JOURS = 120
FENETRE_ARTICLES_JOURS = 14
GDELT_COUVERTURE_JOURS = 90
FORMES = ("8-K", "10-Q", "10-K", "6-K", "20-F", "40-F", "S-1", "DEF 14A")
ITEMS_8K = {"1.01": "entente importante", "1.05": "incident de cybersécurité", "2.01": "acquisition ou cession", "2.02": "résultats",
            "2.05": "restructuration", "2.06": "dépréciation", "4.01": "changement d'auditeur", "4.02": "états antérieurs non fiables",
            "5.02": "départ ou nomination de dirigeants", "7.01": "communication (Reg FD)", "8.01": "autre événement"}


def actif() -> bool:
    return os.environ.get("ULYSSE_RECHERCHE_WEB", "1") != "0"


class Indisponible(RuntimeError):
    pass


_LU: dict[str, str] = {}   # file name -> moment the source was really read (UTC), shown next to the results (PDF p. 14)


def lu_le(nom: str) -> str | None:
    return _LU.get(nom)


def _json(url: str, nom: str, headers: dict | None = None) -> dict:
    """GET with a file cache (one file per day and query). Short timeout: the app never waits long for a live source."""
    dest = OUT / nom
    if dest.exists():
        _LU.setdefault(nom, datetime.fromtimestamp(dest.stat().st_mtime, tz=timezone.utc).isoformat(timespec="minutes"))
        return json.loads(dest.read_text(encoding="utf-8"))
    req = urllib.request.Request(url, headers={"User-Agent": SEC_UA, "Accept": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
        data = json.loads(raw.decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        raise Indisponible(str(e)[:120]) from e
    _LU[nom] = datetime.now(timezone.utc).isoformat(timespec="minutes")
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)
    except OSError:
        pass                                       # no cache available: still answer
    return data


def _cik(ticker: str) -> str | None:
    d = _json("https://www.sec.gov/files/company_tickers.json", "sec_company_tickers.json", {"User-Agent": SEC_UA})
    for rec in d.values():
        if rec.get("ticker", "").upper() == ticker.upper():
            return str(rec["cik_str"]).zfill(10)
    return None


def ev_depots(v: AsOf, t: str) -> Evidence:
    """Official filings of a U.S. issuer over the last FENETRE_DEPOTS_JOURS days before the simulated date."""
    a = v.dp.asset[t]
    base = dict(mesure="depots_officiels", libelle=f"Dépôts officiels récents de {t} (SEC EDGAR)", sujet=t, as_of=str(v.day),
                date_de_calcul=str(v.day), donnees_source=["SEC EDGAR submissions"], methode="depots_filtres_par_date_de_depot",
                parametres={"fenetre_jours": FENETRE_DEPOTS_JOURS},
                reference="SEC EDGAR, données publiques du gouvernement des États-Unis (politique d'accès équitable).")
    if a["asset_class"] != "equity" or a["currency"] != "USD":
        return insufficient(**base, unite="nombre",
                            note="Pas d'émetteur américain : la SEC ne publie des dépôts que pour les sociétés cotées aux États-Unis.")
    if not actif():
        return insufficient(**base, unite="nombre", note="Recherche web désactivée (ULYSSE_RECHERCHE_WEB=0).")
    try:
        cik = _cik(t)
        if not cik:
            return insufficient(**base, unite="nombre", note="Émetteur introuvable dans la table officielle de la SEC.")
        nom = f"sec_submissions_{cik}_{date.today().isoformat()}.json"
        sub = _json(f"https://data.sec.gov/submissions/CIK{cik}.json", nom, {"User-Agent": SEC_UA})
    except Indisponible as e:
        return insufficient(**base, unite="nombre", note=f"SEC EDGAR indisponible ({str(e)[:80]}).")
    r = sub.get("filings", {}).get("recent", {})
    fin = str(v.day)
    debut = str(np.datetime64(fin) - np.timedelta64(FENETRE_DEPOTS_JOURS, "D"))
    depots = []
    for i, forme in enumerate(r.get("form", [])):
        jour = r["filingDate"][i]
        if forme not in FORMES or not (debut < jour <= fin):
            continue
        items = [x.strip() for x in (r.get("items", [""] * (i + 1))[i] or "").split(",") if x.strip()]
        accn = r["accessionNumber"][i]
        doc = r.get("primaryDocument", [""] * (i + 1))[i]
        depots.append({"forme": forme, "date": jour, "objet": ", ".join(ITEMS_8K.get(x, x) for x in items) or None,
                       "url": f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accn.replace('-', '')}/{doc}"})
    depots.sort(key=lambda x: x["date"], reverse=True)
    return evidence(**base, unite="nombre",
                    valeur={"n_depots": len(depots), "plus_recent": depots[0]["date"] if depots else None, "depots": depots[:8], "lu_le": lu_le(nom)},
                    periode=(debut, fin))


def _norm(titre: str) -> str:
    s = unicodedata.normalize("NFKD", titre).encode("ascii", "ignore").decode().lower()
    return " ".join(w for w in re.findall(r"[a-z0-9]+", s) if len(w) > 2)[:80]


def _propre(x: str | None, n: int = 200) -> str:
    return re.sub(r"[\x00-\x1f\x7f<>]", " ", x or "").strip()[:n]


def ev_articles(v: AsOf, t: str) -> Evidence:
    """Press coverage over the last FENETRE_ARTICLES_JOURS days before the simulated date, near-duplicates grouped."""
    a = v.dp.asset[t]
    nom = a["name"]
    base = dict(mesure="couverture_mediatique", libelle=f"Articles de presse récents sur {nom}", sujet=t, as_of=str(v.day),
                date_de_calcul=str(v.day), donnees_source=["GDELT DOC 2.0 (métadonnées)"], methode="articles_filtres_par_date_puis_dedoublonnes",
                parametres={"fenetre_jours": FENETRE_ARTICLES_JOURS},
                reference="GDELT Project, usage libre avec citation ; la présence d'un article ne prouve pas son contenu.")
    if not actif():
        return insufficient(**base, unite="nombre", note="Recherche web désactivée (ULYSSE_RECHERCHE_WEB=0).")
    fin = date.fromisoformat(str(v.day))
    if (date.today() - fin).days > GDELT_COUVERTURE_JOURS:
        return insufficient(**base, unite="nombre", note=f"GDELT ne couvre que les {GDELT_COUVERTURE_JOURS} derniers jours : "
                            "aucune nouvelle n'est montrée pour cette date simulée, plutôt que des nouvelles publiées après.")
    debut = fin - timedelta(days=FENETRE_ARTICLES_JOURS)
    q = {"query": f"\"{nom}\"", "mode": "artlist", "maxrecords": "75", "sort": "datedesc", "format": "json",
         "startdatetime": debut.strftime("%Y%m%d000000"), "enddatetime": fin.strftime("%Y%m%d235959")}
    url = "https://api.gdeltproject.org/api/v2/doc/doc?" + urllib.parse.urlencode(q)
    nom = f"gdelt_{t}_{fin.isoformat()}.json"
    try:
        d = _json(url, nom)
    except Indisponible as e:
        return insufficient(**base, unite="nombre", note=f"GDELT indisponible ({str(e)[:80]}).")
    groupes: dict[str, dict] = {}
    for art in d.get("articles", []) or []:
        vu = art.get("seendate") or ""
        jour = f"{vu[0:4]}-{vu[4:6]}-{vu[6:8]}" if len(vu) >= 8 else None
        if not jour or jour > fin.isoformat():
            continue
        titre = _propre(art.get("title"))
        g = groupes.setdefault(_norm(titre), {"titre": titre, "source": _propre(art.get("domain"), 80), "date": jour,
                                              "url": art.get("url"), "reprises": 0})
        g["reprises"] += 1
    arts = sorted(groupes.values(), key=lambda x: x["date"], reverse=True)
    n_total = sum(g["reprises"] for g in arts)
    return evidence(**base, unite="nombre", valeur={"n_articles": n_total, "n_independants": len(arts), "articles": arts[:8], "lu_le": lu_le(nom)},
                    periode=(debut.isoformat(), fin.isoformat()),
                    note="Date = première détection par GDELT, proxy de la date de publication. Titres affichés tels quels, non vérifiés.")


def lire_d_avance(v: AsOf, tickers: list[str]) -> dict:
    """Read the sources of the watched securities ahead of time (Vigie), so a dossier or a security page does not wait for them
    (idea from AEGIS, Raouf). Results are only cached; their real reading moment stays visible."""
    if not actif():
        return {"lus": 0, "echecs": []}
    lus, echecs = 0, []
    for t in dict.fromkeys(tickers):
        for fn in (ev_depots, ev_articles):
            e = fn(v, t)
            if e.statut == "ok":
                lus += 1
            elif e.note and "indisponible" in e.note:
                echecs.append(f"{t}: {e.note}")
    return {"lus": lus, "echecs": echecs}
