// What the ULYSSE engine returns, and how the interface names it. Every number shown comes from the engine; this file only
// translates codes into words and maps the questionnaire's answers onto the engine's « Connaître son client ».

export type Niveau = "aucun" | "ok" | "attention" | "pause";
export type Statut = "respectee" | "approchee" | "depassee" | "donnees_insuffisantes" | "non_applicable";

export interface Preuve {
  id: string; mesure: string; libelle: string; sujet: string; valeur: any; unite: string; devise: string | null;
  periode: { debut: string; fin: string } | [string, string] | null; as_of: string; date_de_calcul: string; donnees_source: string[];
  methode: string; parametres: Record<string, unknown>; statut: "ok" | "donnees_insuffisantes" | "non_applicable";
  note: string | null; reference: string | null; affichage?: Record<string, string>;
}
export interface StatutClause {
  clause_id: string; type: string; libelle: string; origine: "dit" | "defaut"; importante: boolean; statut: Statut;
  valeur_avant: number | null; valeur_apres: number | null; limite: number | null; unite: string; explication: string;
  preuves: string[]; incertain: boolean; cause_par_intention: boolean; deja_depassee_avant: boolean;
}
export interface Option { code: string; libelle: string; details: Record<string, any>; preuves: string[] }
export interface Signal {
  niveau: Niveau; afficher: boolean; mode: string; gravite: number; titre: string; regles_declenchees: string[];
  clauses: StatutClause[]; options: Option[]; preuves: Preuve[]; as_of: string; latence_ms: number | null;
}
export interface Clause { id: string; type: string; parametres: Record<string, any>; libelle: string; origine: "dit" | "defaut"; justification: string | null; importante: boolean }
export interface Contrat { profil_id: string; version: number; cree_le: string; clauses: Clause[]; historique: any[] }
export interface Kyc {
  tolerance_retenue: string; niveau: string; mesure_determinante: string; raisons: string[]; ecart: string | null; cadre: string; crypto_permise: boolean;
  tolerance: { niveau: string; raisons: string[]; contradiction: boolean; note: string | null };
  capacite: { niveau: string; raisons: string[]; situation: { mois_epargne: number | null; marge_mensuelle: number | null; dettes_cad: number; dette_revenu?: number | null } };
  connaissances: { niveau: string; quiz_bonnes: number; quiz_total: number };
  avant_d_investir: { type: string; titre: string; texte: string; montant_cad?: number }[];
}
export interface Profil {
  id: string; nom: string; age: number | null; experience: string; tolerance: string; description: string;
  objectifs: { id: string; libelle: string; horizon_annees: number; part_pct: number; montant_cible_cad: number | null }[];
  preferences: { esg_important: boolean; interet_crypto: boolean; interet_techno: boolean; notifications_min: string };
  allocation: { capital_cad: number; poids: Record<string, number>; constitue_le: string }; fictif: boolean;
  kyc?: Kyc | null; questionnaire?: Record<string, any> | null;
}
export interface Actif { ticker: string; name: string; asset_class: string; market: string; currency: string; sector: string; first_date: string }

// ------------------------------------------------------------------------------------------------ risk levels
export const LEVELS = ["faible", "faible_modere", "modere", "eleve"] as const;
/** The four levels as the interface shows them (« faible » reads « Prudent », as in the questionnaire). */
export const LEVEL_LABEL: Record<string, string> = { faible: "Prudent", faible_modere: "Faible à modéré", modere: "Modéré", eleve: "Élevé" };
/** The engine's level names (kyc.niveau, kyc.tolerance.niveau…) → index 0..3. */
const KYC_NAME: Record<string, number> = { Faible: 0, "Faible à modéré": 1, Modéré: 2, Élevé: 3 };
export const levelIndexFromName = (n?: string | null) => (n && n in KYC_NAME ? KYC_NAME[n] : 0);
export const levelLabel = (tolerance?: string | null) => (tolerance ? LEVEL_LABEL[tolerance] || tolerance : "");

// ------------------------------------------------------------------------------------------------ signals
/** How each signal level reads, in the interface's three tones (green yes, cobalt « yes, but », red no). */
export const NIVEAU: Record<Niveau, { label: string; short: string; tone: "good" | "mid" | "bad" | "neutral" }> = {
  ok: { label: "Compatible avec vos règles", short: "Compatible", tone: "good" },
  attention: { label: "À regarder de près", short: "À regarder", tone: "mid" },
  pause: { label: "Pause de réflexion", short: "Hors de vos règles", tone: "bad" },
  aucun: { label: "Rien à signaler", short: "Rien à signaler", tone: "neutral" },
};

export const CLAUSE_SHORT: Record<string, string> = {
  perte_max: "Perte en crise", actions_max: "Part en actions", concentration_titre: "Une seule entreprise", concentration_secteur: "Un seul secteur",
  techno_max: "Technologies", crypto_max: "Cryptoactifs", speculatif_max: "Placements très volatils", liquidites_min: "Liquidités",
  horizon: "Votre horizon", devise_etrangere_max: "Hors dollar canadien", esg_controverses: "Controverses ESG", esg_exclusion_secteurs: "Secteurs exclus",
};
export const clauseShort = (c: { type: string; libelle?: string }) => CLAUSE_SHORT[c.type] || c.libelle || c.type;
export const STATUT_FR: Record<Statut, string> = {
  respectee: "Respectée", approchee: "Approchée", depassee: "Dépassée", donnees_insuffisantes: "Données insuffisantes", non_applicable: "Non applicable",
};

/** The value of a clause in plain words: « max 5 % », « min 3 % », « 3 ans ». */
export function clauseLimit(c: Clause): string {
  const p = c.parametres || {};
  if (p.max_pct != null) return `max ${num(p.max_pct)} %`;
  if (p.min_pct != null) return `min ${num(p.min_pct)} %`;
  if (p.annees != null) return `${num(p.annees)} an${p.annees >= 2 ? "s" : ""}`;
  if (Array.isArray(p.secteurs)) return `${p.secteurs.length} secteur${p.secteurs.length > 1 ? "s" : ""}`;
  return "";
}
const num = (x: number) => Number(x).toLocaleString("fr-CA", { maximumFractionDigits: 1 });

/**
 * The engine writes to the person with « tu »; the interface says « vous ». Only possessives and the few verbs of the engine's
 * sentence templates change (ton → votre, tes → vos, tu envisages → vous envisagez…): never a number, a name or a fact.
 */
const VOUS: [string, string][] = [
  ["Tu envisages", "Vous envisagez"], ["tu envisages", "vous envisagez"], ["Tu détiens", "Vous détenez"], ["tu détiens", "vous détenez"],
  ["Tu gardes", "Vous gardez"], ["tu gardes", "vous gardez"], ["Tu as", "Vous avez"], ["tu as", "vous avez"],
  ["Ton", "Votre"], ["ton", "votre"], ["Ta", "Votre"], ["ta", "votre"], ["Tes", "Vos"], ["tes", "vos"], ["t'aide", "vous aide"],
  ["te convient", "vous convient"], ["« faible_modere »", "« faible à modéré »"], ["« modere »", "« modéré »"], ["« eleve »", "« élevé »"],
];
// Whole words only, accented letters included (JavaScript's \b treats « è » as a boundary: « incomplètes » must stay intact).
const VOUS_RX = VOUS.map(([a, b]) => [new RegExp(`(?<![\\p{L}\\p{N}'’-])${a}(?![\\p{L}\\p{N}'’-])`, "gu"), b] as [RegExp, string]);
export function vous(t: string): string {
  return VOUS_RX.reduce((s, [rx, b]) => s.replace(rx, b), t);
}

// ------------------------------------------------------------------------------------------------ questionnaire → engine
export type A = Record<string, any>;

const OBJECTIVE_LEVEL: Record<string, number> = { preserve: 0, income: 1, balanced: 2, growth: 3 };
const PORTFOLIO_LEVEL: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
const GAMBLE_LEVEL: Record<string, number> = { sure: 0, small_risk: 1.5, big_risk: 3 };
const OBJECTIVE_LABEL: Record<string, string> = {
  preserve: "Protéger mon argent", income: "Le protéger avec un peu de croissance", balanced: "Le faire croître de façon équilibrée", growth: "Le faire croître à long terme",
};
const REACTION: Record<string, string> = { sell_all: "vendre_tout", sell_some: "vendre_partie", hold: "attendre", buy_more: "acheter_plus" };
const REACTION_ORDER = ["vendre_tout", "vendre_partie", "attendre", "acheter_plus"];
const PAST: Record<string, string | null> = { sold: "vendre_partie", held: "attendre", bought: "acheter_plus", none: null };
const FEELING: Record<string, string> = { anxious: "stresse", uneasy: "mal_a_l_aise", ok: "serein", excited: "enthousiaste" };
const EMPLOYMENT: Record<string, string> = { permanent: "permanent", contract: "contrat", self_employed: "autonome", student: "etudiant", unemployed: "sans_emploi", retired: "retraite" };
const LIQUIDITY: Record<string, string> = { low: "faible", moderate: "modere", high: "eleve" };
const KNOWLEDGE: Record<string, string> = { none: "aucune", basic: "base", good: "bonnes", expert: "expert" };
const PRODUCTS: Record<string, string> = { savings: "epargne", gic: "cpg", mutual_funds: "fonds", etf: "fnb", stocks: "actions", crypto: "crypto", options: "options" };
/** Sectors to avoid, in the names of the data set. */
const SECTORS: Record<string, string> = { Energy: "Energy", "Information Technology": "Information Technology", Cryptoassets: "Crypto asset", Financials: "Financials" };
export const DEFAULT_START_CAD = 10_000;

/**
 * The questionnaire's answers as the engine's « Connaître son client » (ulysse/contract/kyc.py) reads them.
 * - Declared tolerance: the three « what would you choose » questions (objective, preferred portfolio, the small bet), averaged and
 *   rounded down (prudence). The engine then confronts it with the bearable decline and what the person would actually do.
 * - What the person would do: the more prudent of « if it fell 20 % » and what they did in 2020 and 2022 (past behaviour counts).
 * - The simulated account starts with cash only: the amount the person plans to invest, or 10 000 $ of fictitious money.
 */
export function toReponses(a: A) {
  const n = (v: any) => (v === null || v === "" || v === undefined ? null : +v);
  const willing = [OBJECTIVE_LEVEL[a.objective], PORTFOLIO_LEVEL[a.portfolio_choice], GAMBLE_LEVEL[a.gamble]].filter((x) => x !== undefined) as number[];
  const declared = willing.length ? Math.floor(willing.reduce((s, x) => s + x, 0) / willing.length) : 0;
  const said = REACTION[a.drop_reaction] || "attendre";
  const past = PAST[a.past_behavior] ?? null;
  const reaction = past && REACTION_ORDER.indexOf(past) < REACTION_ORDER.indexOf(said) ? past : said;
  const start = n(a.capital_cad) && n(a.capital_cad)! > 0 ? n(a.capital_cad)! : DEFAULT_START_CAD;
  const crypto = a.crypto_interest === "yes" || a.crypto_interest === "maybe";
  return {
    nom: (a.display_name || "").trim() || "Moi",
    age: n(a.age),
    tolerance: LEVELS[Math.max(0, Math.min(3, declared))],
    objectifs: [{ libelle: OBJECTIVE_LABEL[a.objective] || "Mon objectif", horizon_annees: n(a.horizon_years) || 10, part_pct: 100 }],
    capital_cad: start,
    allocation: { CASH: 1.0 },
    esg_important: !!a.esg_preference,
    eviter_controverses: !!a.esg_preference,
    exclusions_secteurs: (a.excluded_sectors || []).map((s: string) => SECTORS[s] || s),
    interet_crypto: crypto,
    interet_techno: (a.interests || []).includes("Technologie et IA"),
    description: "Profil créé avec le questionnaire « Connaître son client ».",
    kyc: {
      baisse_max_pct: Math.round((a.max_decline || 0.1) * 100),
      reaction_baisse: reaction,
      ressenti: FEELING[a.volatility_feeling] || null,
      revenu_mensuel: n(a.income_net_monthly),
      depenses_mensuelles: n(a.expenses_monthly),
      epargne_cad: n(a.savings_cad),
      dette_carte_cad: n(a.credit_card_debt_cad) ?? 0,
      autres_dettes_cad: n(a.other_debt_cad) ?? 0,
      emploi: EMPLOYMENT[a.employment] || null,
      personnes_a_charge: n(a.dependants_count) ?? 0,
      besoin_liquidites: LIQUIDITY[a.liquidity_needs] || null,
      connaissances_declarees: KNOWLEDGE[a.knowledge_self] || null,
      quiz_diversification: a.quiz_diversification || null,
      quiz_obligations: a.quiz_bonds || null,
      quiz_inflation: a.quiz_inflation || null,
      produits_detenus: (a.products_held || []).map((p: string) => PRODUCTS[p]).filter(Boolean),
    },
    questionnaire: a,
  };
}
