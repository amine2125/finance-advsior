"""French display labels for GICS-style sectors (data keeps the original English classification)."""
SECTOR_FR = {
    "Information Technology": "Technologies de l'information", "Financials": "Services financiers", "Energy": "Énergie",
    "Health Care": "Santé", "Consumer Discretionary": "Consommation discrétionnaire", "Consumer Staples": "Consommation de base",
    "Industrials": "Industrie", "Utilities": "Services publics", "Communication Services": "Services de communication",
    "Materials": "Matériaux", "Real Estate": "Immobilier", "Diversified": "FNB diversifiés", "Fixed Income": "Revenu fixe",
    "Commodities": "Matières premières", "Cryptoassets": "Cryptoactifs",
}


def sector_fr(s: str) -> str:
    return SECTOR_FR.get(s, s)
