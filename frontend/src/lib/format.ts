export const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "n/d" : `${(v * 100).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
export const cad = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "n/d" : `${v.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d })}\u00a0$`;
export const date = (s?: string | null) => (s ? new Date(s.length <= 10 ? s + "T12:00:00Z" : s).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "n/d");

export const SECTOR_FR: Record<string, string> = {
  "Information Technology": "Technologies de l'information",
  Financials: "Services financiers",
  Energy: "Énergie",
  "Health Care": "Santé",
  "Consumer Discretionary": "Consommation discrétionnaire",
  "Consumer Staples": "Consommation de base",
  Industrials: "Industrie",
  Utilities: "Services publics",
  "Communication Services": "Services de communication",
  Materials: "Matériaux",
  "Real Estate": "Immobilier",
  Diversified: "Fonds indiciels (FNB) diversifiés",
  "Fixed Income": "Revenu fixe",
  Commodities: "Matières premières (or)",
  Cryptoassets: "Cryptoactifs",
};
export const sector = (s: string) => SECTOR_FR[s] || s;

export const CLASS_FR: Record<string, string> = { equity: "Actions", etf: "FNB", crypto: "Cryptoactifs" };
export const TIER_FR: Record<string, string> = { LOW: "Faible", MEDIUM: "Moyen", HIGH: "Élevé", UNKNOWN: "Inconnu" };
