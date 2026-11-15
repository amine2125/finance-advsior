// Plain-language view of the investment universe: what a client sees instead of tickers.
import { SERIES } from "../components/charts";

export type Category = "stable" | "growth" | "speculative";

export const CATEGORY: Record<Category, { label: string; desc: string; color: string }> = {
  stable: { label: "Stabilité", desc: "Obligations et quasi-épargne : bougent peu, amortissent les baisses.", color: SERIES[0] },
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

export function category(a: { asset_class?: string; sub_class?: string; sector?: string }): Category {
  if (a.asset_class === "crypto" || a.sector === "Cryptoassets") return "speculative";
  if (a.sub_class === "bond_etf" || a.sector === "Fixed Income") return "stable";
  return "growth";
}

/** « Royal Bank of Canada » stays as is; funds get a plain description instead of their legal name. */
export function friendly(id: string, name?: string): string {
  return FRIENDLY[id] || name || id;
}

export function kind(a: { asset_class?: string; sub_class?: string; sector?: string; region?: string }): string {
  if (a.asset_class === "crypto") return "Cryptoactif";
  if (a.sub_class === "bond_etf" || a.sector === "Fixed Income") return "Fonds d'obligations";
  if (a.sub_class === "gold_etf" || a.sector === "Commodities") return "Fonds d'or";
  if (a.asset_class === "etf") return "Fonds indiciel (FNB)";
  return "Action d'une entreprise";
}

/** Shares of the portfolio by category, from analysis positions. */
export function byCategory(positions: any[]): Record<Category, number> {
  const out: Record<Category, number> = { stable: 0, growth: 0, speculative: 0 };
  for (const p of positions) out[category(p)] += p.weight;
  return out;
}

export const ORDER: Category[] = ["stable", "growth", "speculative"];
