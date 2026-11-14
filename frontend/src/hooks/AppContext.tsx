import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

type Ctx = {
  personaId: string;
  setPersonaId: (p: string) => void;
  portfolioId: string;
  setPortfolioId: (p: string) => void;
  personas: any[];
  portfolios: any[];
  refresh: () => Promise<void>;
  system: any;
  ready: boolean;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [personaId, setPersonaIdState] = useState(localStorage.getItem("aegis.persona") || "robert");
  const [portfolioId, setPortfolioIdState] = useState(localStorage.getItem("aegis.portfolio") || "demo1_tech");
  const [personas, setPersonas] = useState<any[]>([]);
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [system, setSystem] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const refresh = async () => {
    const [p, f, s] = await Promise.all([api.get("/personas"), api.get("/portfolios"), api.get("/system/info").catch(() => null)]);
    setPersonas(p.personas);
    setPortfolios(f.portfolios);
    setSystem(s);
    if (!f.portfolios.find((x: any) => x.portfolio_id === portfolioId) && f.portfolios[0]) setPortfolioIdState(f.portfolios[0].portfolio_id);
    setReady(true);
  };
  useEffect(() => {
    refresh().catch(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const value = useMemo(
    () => ({
      personaId,
      setPersonaId: (p: string) => {
        localStorage.setItem("aegis.persona", p);
        setPersonaIdState(p);
      },
      portfolioId,
      setPortfolioId: (p: string) => {
        localStorage.setItem("aegis.portfolio", p);
        setPortfolioIdState(p);
      },
      personas,
      portfolios,
      refresh,
      system,
      ready,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personaId, portfolioId, personas, portfolios, system, ready],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const c = useContext(AppContext);
  if (!c) throw new Error("AppContext missing");
  return c;
}
