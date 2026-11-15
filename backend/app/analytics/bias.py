"""Section 8A.10: behavioural-pattern detector. Describes the pattern, never the person; stores nothing about the user."""
from __future__ import annotations

import re

BIASES = [
    {"bias": "herding_fomo", "label": "Effet de troupeau / FOMO",
     "patterns": [r"tout le monde (ach[eè]te|en parle|investit)", r"\bviral", r"\btendance\b", r"\btrending", r"everyone is buying",
                  r"\bfomo\b", r"\bbuzz\b", r"en vogue", r"\bhype\b", r"réseaux sociaux"],
     "response": "Le brief Hype Intelligence sépare l'attention mesurée des faits vérifiés et montre ce que le prix suppose déjà."},
    {"bias": "recency", "label": "Biais de récence",
     "patterns": [r"(n'arr[eê]te pas|continue) de (monter|grimper)", r"keeps going up", r"monte sans arr[eê]t", r"toujours monter"],
     "response": "Voir la perte maximale sur tout l'historique et les taux de base calculés sur le jeu de données."},
    {"bias": "anchoring", "label": "Ancrage",
     "patterns": [r"[ée]tait [àa] \d", r"j'ai achet[ée] [àa]", r"i bought at", r"it was at", r"mon prix d'achat"],
     "response": "Refaire l'analyse comme si rien n'était détenu : le prix d'achat ne change pas le risque futur."},
    {"bias": "overconfidence", "label": "Excès de confiance",
     "patterns": [r"ne peut pas (baisser|chuter|tomber)", r"can'?t (fall|go down|lose)", r"c'est s[uû]r", r"sans risque", r"garanti"],
     "response": "Trois scénarios obligatoires et un tableau de taille de position."},
    {"bias": "loss_aversion", "label": "Aversion aux pertes",
     "patterns": [r"attendre (qu'il|qu'elle|que [çc]a) (revienne|remonte)", r"revenir [àa] mon prix", r"wait until it gets back"],
     "response": "Asymétrie de récupération : −50 % exige +100 %. Définir des critères de sortie à l'avance."},
    {"bias": "confirmation", "label": "Biais de confirmation",
     "patterns": [r"seulement les (arguments|raisons) (pour|positifs)", r"confirme[- ]moi", r"only (the )?(bull|positive)",
                  r"dis[- ]moi (pourquoi|que) (c'est|il faut) (bon|acheter)"],
     "response": "Le contre-argument le plus fort de l'agent Risque est présenté systématiquement."},
]
_compiled = [(b, re.compile("|".join(b["patterns"]), re.IGNORECASE)) for b in BIASES]


def detect_biases(text: str) -> list[dict]:
    out = []
    for b, rx in _compiled:
        m = rx.search(text or "")
        if m:
            out.append({"bias": b["bias"], "label": b["label"], "matched_phrase": m.group(0),
                        "pattern_description": f"La formulation « {m.group(0)} » correspond au schéma « {b['label']} ».",
                        "educational_response": b["response"],
                        "privacy": "Schéma décrit, aucune inférence psychologique enregistrée sur l'utilisateur."})
    return out
