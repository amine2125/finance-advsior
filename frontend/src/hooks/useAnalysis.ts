import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../services/api";

/** Runs the deterministic portfolio analysis (X-Ray) for a portfolio. Every number comes from the backend engine. */
export function useAnalysis(portfolioId: string | null | undefined, opts: { snapshot?: boolean } = {}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const run = useCallback(async () => {
    if (!portfolioId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.post("/analysis/portfolio", { portfolio_id: portfolioId, save_snapshot: !!opts.snapshot }));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }, [portfolioId, opts.snapshot]);
  useEffect(() => { setData(null); run(); }, [run]);
  return { data, error, loading, reload: run };
}

/** Plain-language meaning of each profile limit, shown before the measured numbers. */
export function checkText(c: { rule_id: string; status: string }): string {
  const over = c.status !== "OK" && c.status !== "UNKNOWN";
  switch (c.rule_id) {
    case "budget.growth_band":
      if (c.status === "ABOVE_BAND") return "Plus d'actions ou de cryptos que votre profil ne le prévoit : en cas de baisse des marchés, vous pourriez perdre plus que ce que vous avez dit pouvoir supporter.";
      if (c.status === "BELOW_BAND") return "Moins d'actions que prévu : votre argent pourrait croître moins vite que votre objectif.";
      return "La part en actions correspond à votre profil.";
    case "budget.single_issuer":
      return over ? "Trop d'argent dans un seul placement : une mauvaise nouvelle le concernant pèserait lourd." : "Aucun placement ne pèse trop lourd à lui seul.";
    case "budget.single_sector":
      return over ? "Trop concentré dans un seul secteur : ces titres ont tendance à baisser ensemble." : "Pas de secteur trop dominant.";
    case "budget.speculative":
      return over ? "Trop de placements spéculatifs (crypto) pour votre profil." : "Part spéculative dans votre limite.";
    case "budget.drawdown_review":
      return over ? "Par le passé, ces placements ont déjà baissé plus que le seuil que vous avez fixé." : c.status === "UNKNOWN" ? "Historique trop court pour vérifier." : "Les baisses passées restent sous votre seuil.";
    default:
      return "";
  }
}

export const CHECK_LABEL: Record<string, string> = {
  "budget.growth_band": "Part en actions et cryptos",
  "budget.single_issuer": "Poids d'un seul placement",
  "budget.single_sector": "Poids d'un seul secteur",
  "budget.speculative": "Part spéculative (crypto)",
  "budget.drawdown_review": "Baisses passées vs votre seuil",
};
export const checkLabel = (c: { rule_id: string; label: string }) => CHECK_LABEL[c.rule_id] || c.label;
