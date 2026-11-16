"""Plain-language definitions, shown on hover; the level follows the profile's experience."""
GLOSSAIRE = {
    "volatilite": ("Volatilité", "À quel point le prix bouge d'un jour à l'autre. Plus elle est haute, plus les hauts et les bas sont grands.",
                   "Écart-type annualisé des rendements quotidiens (√252)."),
    "pire_baisse": ("Pire baisse", "La plus grosse chute passée, du plus haut au plus bas, avant de remonter.",
                    "Drawdown maximal d'un indice de rendement total, avec dates du sommet et du creux."),
    "cvar": ("Pertes extrêmes (CVaR)", "La perte moyenne pendant les pires périodes observées.",
             "Expected shortfall historique : moyenne des pertes au-delà du quantile de 95 %."),
    "ewma": ("Risque récent", "Compare l'agitation des dernières semaines à celle de l'année.",
             "Volatilité EWMA (RiskMetrics, λ = 0,94) rapportée à la volatilité réalisée sur 252 séances."),
    "fnb": ("FNB", "Un panier de titres qui s'achète comme une action (ex. un indice).",
            "Fonds négocié en bourse ; sa composition publiée permet la transparence."),
    "transparence": ("Transparence des FNB", "Regarder à l'intérieur de tes fonds pour voir ce que tu détiens vraiment.",
                     "Exposition = Σ poids de la ligne × poids du titre dans le fonds (dernière composition publiée)."),
    "contribution_risque": ("Part du risque", "Quelle part des mouvements du portefeuille vient de chaque ligne.",
                            "Contributions d'Euler à la volatilité du portefeuille (covariance hebdomadaire, 3 ans)."),
    "paris_reels": ("Paris réels", "Des lignes qui montent et baissent ensemble comptent comme un seul pari.",
                    "Regroupement hiérarchique sur la distance √((1−ρ)/2), seuil ρ = 0,7."),
    "rendement_total": ("Rendement total", "Variation du prix plus les dividendes réinvestis.",
                        "Variation de l'indice ajusté (adj_close)."),
    "horizon": ("Horizon", "Le temps avant d'avoir besoin d'une bonne partie de l'argent.",
                "Utilisé pour mesurer la pire perte observée sur des périodes de même durée."),
    "liquidites": ("Liquidités", "L'argent disponible tout de suite, sans vendre de placement.",
                   "Part du portefeuille en encaisse (CAD)."),
    "regime": ("Climat de marché", "Un résumé de l'humeur récente des marchés : calme, agité ou tendu.",
               "Mélange gaussien à 3 composantes sur rendements, volatilités et pentes de taux (descriptif)."),
    "engouement": ("Attention inhabituelle", "Beaucoup plus de monde regarde ou échange ce titre que d'habitude.",
                   "Isolation Forest sur pages vues Wikipedia, volume, ampleur du mouvement ; plus une règle d'attention."),
    "esg": ("ESG", "Critères environnementaux, sociaux et de gouvernance.",
            "Évalués ici par preuves documentées et datées, jamais par une cote propriétaire."),
    "concentration": ("Concentration", "Trop d'argent sur une seule entreprise ou un seul secteur.",
                      "Exposition par émetteur, directe et via FNB, rapportée au total."),
    "diversification": ("Diversification", "Varier les placements pour ne pas dépendre d'un seul scénario.",
                        "Mesurée par les paris réels et le nombre effectif de paris."),
    "rejeu": ("Rejeu historique", "Ce qu'une crise passée aurait fait à ton portefeuille actuel.",
              "Poids actuels appliqués aux rendements réels de l'épisode ; aucune prévision."),
    "scenarios": ("Scénarios rééchantillonnés", "Des milliers de parcours fabriqués en recousant des morceaux du passé.",
                  "Bootstrap stationnaire (Politis & Romano, 1994), blocs moyens de 20 séances ; pas une prévision."),
}


def glossaire(niveau: str = "standard") -> list[dict]:
    return [{"cle": k, "terme": t, "definition": (d if niveau != "detaille" else f"{d} {tech}"), "technique": tech}
            for k, (t, d, tech) in GLOSSAIRE.items()]
