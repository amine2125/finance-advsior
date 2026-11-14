import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, resetUser } from "../services/api";

export type Me = {
  onboarded: boolean;
  profile: any | null;
  profiles: { persona_id: string; display_name: string; is_official: boolean }[];
  answers: any | null;
  portfolios: any[];
  data_as_of: string;
  data_start: string;
  dataset_origin: string;
};

type Ctx = {
  me: Me | null;
  error: ApiError | null;
  reload: () => Promise<Me | null>;
  portfolio: any | null;
  setPortfolioId: (id: string) => void;
  restart: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pid, setPid] = useState<string | null>(() => localStorage.getItem("aegis.portfolio"));

  const reload = useCallback(async () => {
    try {
      const m = await api.get<Me>("/me");
      setMe(m);
      setError(null);
      return m;
    } catch (e) {
      setError(e as ApiError);
      return null;
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const setPortfolioId = (id: string) => { setPid(id); localStorage.setItem("aegis.portfolio", id); };
  const portfolio = me?.portfolios.find((p) => p.portfolio_id === pid) || me?.portfolios[0] || null;
  const restart = () => { resetUser(); localStorage.removeItem("aegis.portfolio"); window.location.href = "/"; };

  return <AppCtx.Provider value={{ me, error, reload, portfolio, setPortfolioId, restart }}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppProvider manquant");
  return c;
}
