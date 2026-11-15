import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, resetUser } from "../services/api";
import { AuthConfig, loadAuthConfig, signedIn, signIn as cognitoSignIn, signOut as cognitoSignOut, signUp as cognitoSignUp } from "../services/auth";

export type Me = {
  onboarded: boolean;
  profile: any | null;
  profiles: { persona_id: string; display_name: string; is_official: boolean }[];
  answers: any | null;
  portfolios: any[];
  data_as_of: string;
  data_start: string;
  dataset_origin: string;
  email?: string | null;
};

export type AuthState = "loading" | "signedOut" | "signedIn";

type Ctx = {
  me: Me | null;
  error: ApiError | null;
  reload: () => Promise<Me | null>;
  portfolio: any | null;
  setPortfolioId: (id: string) => void;
  restart: () => Promise<void>;
  auth: AuthState;
  authConfig: AuthConfig | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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
  const [auth, setAuth] = useState<AuthState>("loading");
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  useEffect(() => {
    loadAuthConfig()
      .then((c) => { setAuthConfig(c); setAuth(c.mode !== "cognito" || signedIn() ? "signedIn" : "signedOut"); })
      .catch(() => { setError(new ApiError(0, "network", "Le serveur ne répond pas. Vérifiez que le backend est démarré.")); setAuth("signedOut"); });
    const out = () => { setMe(null); setAuth("signedOut"); };
    window.addEventListener("aegis:signedout", out);
    return () => window.removeEventListener("aegis:signedout", out);
  }, []);
  useEffect(() => { if (auth === "signedIn") reload(); }, [auth, reload]);

  const setPortfolioId = (id: string) => { setPid(id); localStorage.setItem("aegis.portfolio", id); };
  const portfolio = me?.portfolios.find((p) => p.portfolio_id === pid) || me?.portfolios[0] || null;
  const cognito = authConfig?.mode === "cognito";
  /** « Tout effacer et recommencer » : with an account, erase its data on the server and start the questionnaire again. */
  const restart = async () => {
    localStorage.removeItem("aegis.portfolio");
    if (cognito) await api.del("/me"); else resetUser();
    window.location.href = "/";
  };
  const signIn = async (email: string, password: string) => { await cognitoSignIn(email, password); setMe(null); setPid(null); setAuth("signedIn"); };
  const signUp = async (email: string, password: string) => { await cognitoSignUp(email, password); setMe(null); setPid(null); setAuth("signedIn"); };
  const signOut = async () => { await cognitoSignOut(); setMe(null); setPid(null); setAuth("signedOut"); window.history.replaceState(null, "", "/"); };

  return <AppCtx.Provider value={{ me, error, reload, portfolio, setPortfolioId, restart, auth, authConfig, signIn, signUp, signOut }}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppProvider manquant");
  return c;
}
