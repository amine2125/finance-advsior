export const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "n/d" : `${(v * 100).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
export const cad = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "n/d" : `${v.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d })} $`;
export const num = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "n/d" : v.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
export const date = (s?: string | null) => (s ? new Date(s.length <= 10 ? s + "T12:00:00Z" : s).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "n/d");
export const dateTime = (s?: string | null) => (s ? new Date(s).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "n/d");

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
  Diversified: "FNB diversifiés (non reclassés)",
  "Fixed Income": "Revenu fixe",
  Commodities: "Matières premières (or)",
  Cryptoassets: "Cryptoactifs",
};
export const sector = (s: string) => SECTOR_FR[s] || s;

export const CLASS_FR: Record<string, string> = { equity: "Actions", etf: "FNB", crypto: "Cryptoactifs" };
export const TIER_FR: Record<string, string> = { LOW: "Faible", MEDIUM: "Moyen", HIGH: "Élevé", UNKNOWN: "Inconnu" };
export const STATUS_FR: Record<string, string> = {
  "research-supported": "Étayé par la recherche",
  "research-inconclusive": "Recherche non concluante",
  "conflicts-with-persona-constraints": "En conflit avec les contraintes du profil",
  "additional-scenario-worth-testing": "Scénario supplémentaire à tester",
  "insufficient-data": "Données insuffisantes (abstention)",
};
export const CLAIM_FR: Record<string, string> = {
  VERIFIED: "Vérifiée",
  CORROBORATED: "Corroborée",
  DISPUTED: "Contestée",
  UNVERIFIED: "Non vérifiée",
  FALSE_AS_SUPPORTED_BY_EVIDENCE: "Contredite par les preuves",
  UNKNOWN: "Inconnue / non testable",
  REPORTED: "Rapportée (couverture)",
};
export const AGENT_FR: Record<string, string> = {
  supervisor: "Superviseur",
  data_agent: "Agent Données",
  quant_agent: "Agent Quantitatif",
  hypothesis_agent: "Agent Validation historique",
  market_intelligence_agent: "Agent Intelligence de marché",
  opportunity_agent: "Agent Opportunité",
  risk_agent: "Agent Risque",
  audit_agent: "Agent Preuves & Gouvernance",
  persona_agent: "Agent Profil",
  copilot: "Copilote",
  guardian: "Guardian",
};
