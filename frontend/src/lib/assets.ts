// Plain-language view of the investment universe (the 31 securities of the data set): what a client sees instead of tickers.
import { SERIES } from "../components/charts";

export type Category = "stable" | "growth" | "speculative";

export const CATEGORY: Record<Category, { label: string; desc: string; color: string }> = {
  stable: { label: "Stabilité", desc: "Obligations, or et liquidités : bougent peu, amortissent les baisses.", color: SERIES[0] },
  growth: { label: "Croissance", desc: "Actions : font fructifier l'argent à long terme, avec des hauts et des bas.", color: SERIES[1] },
  speculative: { label: "Spéculatif", desc: "Cryptoactifs : très volatils, on doit pouvoir perdre cet argent.", color: SERIES[5] },
};

const FRIENDLY: Record<string, string> = {
  "ZST.TO": "Obligations à très court terme",
  "XBB.TO": "Obligations canadiennes",
  AGG: "Obligations américaines",
  TLT: "Obligations américaines à long terme",
  "XIU.TO": "60 grandes entreprises canadiennes",
  SPY: "500 grandes entreprises américaines",
  QQQ: "100 grandes entreprises technologiques",
  ESGV: "Entreprises américaines responsables",
  GLD: "Or",
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ether",
};

/** ULYSSE asset classes: equity, etf_equity, etf_bond, etf_commodity, crypto. */
type A = { asset_class?: string; classe?: string; sector?: string };
const cls = (a: A) => a.asset_class || a.classe || "";

export function category(a: A): Category {
  const c = cls(a);
  if (c === "crypto") return "speculative";
  if (c === "etf_bond" || c === "etf_commodity") return "stable";
  return "growth";
}

/** « Royal Bank of Canada » stays as is; funds get a plain description instead of their legal name. */
export function friendly(id: string, name?: string): string {
  return FRIENDLY[id] || name || id;
}

export function kind(a: A): string {
  const c = cls(a);
  if (c === "crypto") return "Cryptoactif";
  if (c === "etf_bond") return "Fonds d'obligations";
  if (c === "etf_commodity") return "Fonds d'or";
  if (c === "etf_equity") return "Fonds indiciel (FNB)";
  return "Action d'une entreprise";
}

/** Group used by the search and the filters: stocks, funds, crypto. */
export function group(a: A): "equity" | "etf" | "crypto" {
  const c = cls(a);
  return c === "crypto" ? "crypto" : c.startsWith("etf") ? "etf" : "equity";
}

/** Shares of the portfolio by category, from holdings with a weight (fraction of the total) — cash counts as stability. */
export function byCategory(lines: { poids: number; classe?: string; asset_class?: string }[], cashWeight = 0): Record<Category, number> {
  const out: Record<Category, number> = { stable: cashWeight, growth: 0, speculative: 0 };
  for (const p of lines) out[category(p)] += p.poids;
  return out;
}

export const ORDER: Category[] = ["stable", "growth", "speculative"];

export const SECTOR_FR: Record<string, string> = {
  "Information Technology": "Technologies de l'information", "Communication Services": "Services de communication",
  Financials: "Services financiers", Energy: "Énergie", Industrials: "Industrie", Utilities: "Services publics", "Consumer Staples": "Consommation de base",
  "Consumer Discretionary": "Consommation discrétionnaire", "Health Care": "Santé", Materials: "Matériaux", "Real Estate": "Immobilier",
  "Crypto asset": "Cryptoactifs", Gold: "Or", "Broad market (Canada)": "Marché large (Canada)", "Broad market (U.S.)": "Marché large (États-Unis)",
  "Broad market (U.S. growth/tech-heavy)": "Marché large (États-Unis, forte part de techno)", "Broad market (U.S., ESG-screened)": "Marché large (États-Unis, filtré ESG)",
  "Bonds (Canada aggregate)": "Obligations canadiennes", "Bonds (Canada ultra short-term)": "Obligations canadiennes à très court terme",
  "Bonds (U.S. aggregate)": "Obligations américaines", "Bonds (U.S. long Treasury)": "Obligations du Trésor américain à long terme",
};
export const sector = (s: string) => SECTOR_FR[s] || s;
