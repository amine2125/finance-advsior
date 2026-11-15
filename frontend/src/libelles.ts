export const SECTEURS: Record<string, string> = { "Information Technology": "Technologies de l'information", "Communication Services": "Services de communication",
  Financials: "Finance", Energy: "Énergie", Industrials: "Industrie", Utilities: "Services publics", "Consumer Staples": "Consommation de base",
  "Consumer Discretionary": "Consommation discrétionnaire", "Health Care": "Santé", Materials: "Matériaux", "Real Estate": "Immobilier",
  "Crypto asset": "Cryptoactif", Gold: "Or", "Broad market (Canada)": "Marché large (Canada)", "Broad market (U.S.)": "Marché large (États-Unis)",
  "Broad market (U.S. growth/tech-heavy)": "Marché large (États-Unis, croissance, forte part de techno)", "Broad market (U.S., ESG-screened)": "Marché large (États-Unis, filtré ESG)",
  "Bonds (Canada aggregate)": "Obligations (Canada, univers)", "Bonds (Canada ultra short-term)": "Obligations (Canada, très court terme)",
  "Bonds (U.S. aggregate)": "Obligations (États-Unis, univers)", "Bonds (U.S. long Treasury)": "Obligations (Trésor américain, long terme)" };
export const VOCABULAIRE: Record<string, string> = { simple: "simple", standard: "standard", detaille: "détaillé" };
export const MODULES: Record<string, string> = { liquidites: "liquidités", pire_baisse: "pire baisse", objectif: "objectif", concentration: "concentration",
  diversification: "diversification", paris_reels: "paris réels" };
export function inhabituel(p: number): string {
  return p >= 99.95 ? "plus inhabituelle que tous les jours passés de ce titre" : `plus inhabituelle que ${p.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} % des jours passés`;
}
