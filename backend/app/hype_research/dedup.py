"""Duplicate / syndication clustering. Repeated wire copies count as ONE underlying report."""
from __future__ import annotations

import re
import unicodedata

STOP = {"the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are", "as", "at", "by", "with", "from", "after",
        "le", "la", "les", "de", "des", "du", "un", "une", "et", "en", "au", "aux", "pour", "sur", "par", "est", "sont"}


def normalize_title(title: str) -> str:
    t = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode().lower()
    t = re.sub(r"\s[-|–—]\s[^-|–—]{2,40}$", "", t)  # trailing " - Publisher"
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return " ".join(w for w in t.split() if w not in STOP)


def shingles(text: str, k: int = 2) -> set[str]:
    words = text.split()
    if len(words) < k:
        return set(words)
    return {" ".join(words[i:i + k]) for i in range(len(words) - k + 1)}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def cluster_articles(articles: list[dict], threshold: float = 0.55) -> list[dict]:
    """Greedy single-pass clustering on title shingles (and identical canonical URLs).

    The earliest article in a cluster is treated as the presumed original; others as syndicated copies.
    """
    arts = sorted(articles, key=lambda a: a.get("published_at") or "9999")
    clusters: list[dict] = []
    for a in arts:
        norm = normalize_title(a.get("title") or "")
        sh = shingles(norm)
        placed = None
        for c in clusters:
            if a.get("canonical_url") and a.get("canonical_url") in c["urls"]:
                placed = c
                break
            if jaccard(sh, c["shingles"]) >= threshold:
                placed = c
                break
        if placed is None:
            placed = {"cluster_id": f"clu.{len(clusters) + 1}", "shingles": sh, "urls": set(), "members": [], "publishers": set(),
                      "title": a.get("title"), "first_seen": a.get("published_at"), "original_evidence_id": a["evidence_id"]}
            clusters.append(placed)
        placed["members"].append(a["evidence_id"])
        if a.get("canonical_url"):
            placed["urls"].add(a["canonical_url"])
        if a.get("publisher"):
            placed["publishers"].add(a["publisher"])
        a["duplicate_cluster_id"] = placed["cluster_id"]
        a["is_original"] = a["evidence_id"] == placed["original_evidence_id"]
    out = []
    for c in clusters:
        out.append({"cluster_id": c["cluster_id"], "title": c["title"], "first_seen": c["first_seen"],
                    "original_evidence_id": c["original_evidence_id"], "members": c["members"], "size": len(c["members"]),
                    "publishers": sorted(c["publishers"]), "syndicated_copies": len(c["members"]) - 1})
    return out


def independence_summary(articles: list[dict], clusters: list[dict]) -> dict:
    return {"articles": len(articles), "independent_reports": len(clusters),
            "syndicated_or_duplicate": len(articles) - len(clusters),
            "unique_publishers": len({a.get("publisher") for a in articles if a.get("publisher")}),
            "rule": "Les copies d'une même dépêche comptent pour UN rapport sous-jacent, pas des confirmations indépendantes"}
