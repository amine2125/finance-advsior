import { qs } from "../services/api";
import { useApi } from "./useApi";
import { useApp } from "./useApp";

export type MarketRow = {
  ticker: string; name: string; asset_class: string; sector: string; currency: string; market: string;
  prix_local: number; date_prix: string; variation_1j_pct: number;
  signal: null | { niveau: "ok" | "attention" | "pause"; regles: string[]; clauses: { type: string; statut: string; explication: string }[];
    deja_detenu_pct: number; vol_1a: number | null; pire_baisse_pct: number | null; taille_reference_pct: number };
};

/** The 31 securities at the simulated date, each with the profile's signal for a reference position (pre-computed by the Vigie). */
export function useMarket(enabled = true) {
  const { me, asOf } = useApp();
  return useApi<{ as_of: string; actifs: MarketRow[] }>(enabled && asOf ? `/marche${qs({ as_of: asOf, profil: me?.pid })}` : null);
}
