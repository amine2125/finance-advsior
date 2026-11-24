import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Actif, Contrat, levelLabel, Profil } from "../lib/ulysse";
import { api, ApiError, qs } from "../services/api";
import { AuthConfig, configureAuth, ServerAuth, signedIn, signedInEmail, signIn as cognitoSignIn, signOut as cognitoSignOut, signUp as cognitoSignUp } from "../services/auth";

/** The signed-in person as the screens need it: the chosen ULYSSE profile, its contract, its cash, the newcomer guidance. */
export type Me = {
  onboarded: boolean;
  pid: string | null;
  profile: (Profil & { display_name: string; risk_profile_label: string }) | null;
  contrat: Contrat | null;
  adaptation: any | null;
  contradictions: { code: string; message: string }[];
  profiles: { id: string; nom: string; tolerance: string; fictif?: boolean; description?: string }[];
  email: string | null;
  cash: number;
  guide: { tour_done: boolean; lessons: string[] };
};

export type Config = {
  as_of_defaut: string; donnees_debut: string; donnees_jusqu_au: string; llm: string; univers: Actif[];
  episodes: Record<string, { debut: string; fin: string; libelle: string }>; chocs?: Record<string, { libelle: string }>; auth?: ServerAuth;
};
export type AuthState = "loading" | "signedOut" | "signedIn";

type Ctx = {
  me: Me | null;
  error: ApiError | null;
  reload: () => Promise<Me | null>;
  config: Config | null;
  asOf: string;
  inPast: boolean;
  setAsOf: (d: string | null) => void;
  setProfileId: (id: string | null) => void;
  restart: () => Promise<void>;
  auth: AuthState;
  authConfig: AuthConfig | null;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signUp: (email: string, password: string, remember?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);
const PID_KEY = "ulysse.profil";
const DATE_KEY = "ulysse.date";
const get = (s: Storage, k: string) => { try { return s.getItem(k); } catch { return null; } };
const set = (s: Storage, k: string, v: string | null) => { try { if (v === null) s.removeItem(k); else s.setItem(k, v); } catch { /* private mode */ } };

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [auth, setAuth] = useState<AuthState>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pid, setPid] = useState<string | null>(() => get(localStorage, PID_KEY));
  const [date, setDate] = useState<string | null>(() => get(sessionStorage, DATE_KEY));
  const asOf = date || config?.as_of_defaut || "";
  const inPast = !!config && !!date && date < config.as_of_defaut;

  useEffect(() => {
    api.get<Config>("/config")
      .then((c) => { const a = configureAuth(c.auth); setConfig(c); setAuthConfig(a); setAuth(a.mode !== "cognito" || signedIn() ? "signedIn" : "signedOut"); })
      .catch(() => { setError(new ApiError(0, "network", "Le serveur ne répond pas. Vérifiez que le backend est démarré.")); setAuth("signedOut"); });
    const out = () => { setMe(null); setAuth("signedOut"); };
    window.addEventListener("ulysse:deconnecte", out);
    return () => window.removeEventListener("ulysse:deconnecte", out);
  }, []);

  const reload = useCallback(async (): Promise<Me | null> => {
    if (!config) return null;
    const day = date || config.as_of_defaut;
    try {
      const compte = await api.get<{ mode: string; email: string | null; profils: string[] | null; guide: { visite_faite?: boolean; lecons?: string[] } }>("/compte");
      const all = await api.get<Me["profiles"]>("/profils");
      const mine = compte.profils ? all.filter((p) => compte.profils!.includes(p.id)) : all;
      const stored = get(localStorage, PID_KEY);
      // With accounts, the profile is the account's own (the first one unless another was chosen). Without accounts (local
      // sandbox) every profile is visible: the person is « registered » once they created or chose one on this browser.
      const chosen = mine.find((p) => p.id === (pid || stored))?.id || (compte.profils ? mine[0]?.id : undefined) || null;
      const guide = { tour_done: !!compte.guide?.visite_faite, lessons: compte.guide?.lecons || [] };
      const email = compte.email || signedInEmail();
      if (!chosen) {
        const m: Me = { onboarded: false, pid: null, profile: null, contrat: null, adaptation: null, contradictions: [], profiles: mine, email, cash: 0, guide };
        setMe(m); setError(null);
        return m;
      }
      const [p, pos] = await Promise.all([
        api.get<{ profil: Profil; contrat: Contrat; adaptation: any; contradictions: any[] }>(`/profils/${encodeURIComponent(chosen)}${qs({ as_of: day })}`),
        api.get<{ liquidites_cad: number }>(`/profils/${encodeURIComponent(chosen)}/positions${qs({ as_of: day })}`),
      ]);
      const m: Me = {
        onboarded: true, pid: chosen,
        profile: { ...p.profil, display_name: p.profil.nom, risk_profile_label: levelLabel(p.profil.tolerance) },
        contrat: p.contrat, adaptation: p.adaptation, contradictions: p.contradictions || [], profiles: mine, email, cash: pos.liquidites_cad, guide,
      };
      if (chosen !== pid) { setPid(chosen); set(localStorage, PID_KEY, chosen); }
      setMe(m); setError(null);
      return m;
    } catch (e) {
      setError(e as ApiError);
      return null;
    }
  }, [config, pid, date]);
  useEffect(() => { if (auth === "signedIn" && config) reload(); }, [auth, config, pid, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const setProfileId = (id: string | null) => { set(localStorage, PID_KEY, id); setPid(id); };
  const setAsOf = (d: string | null) => { const v = d && config && d !== config.as_of_defaut ? d : null; set(sessionStorage, DATE_KEY, v); setDate(v); };
  const cognito = authConfig?.mode === "cognito";
  /** « Tout effacer et recommencer » : with an account, erase its data on the server; locally, forget the profile on this browser. */
  const restart = async () => {
    if (cognito) await api.post("/compte/effacer", {});
    set(localStorage, PID_KEY, null);
    set(sessionStorage, DATE_KEY, null);
    window.location.href = "/";
  };
  const signIn = async (email: string, password: string, remember = false) => { await cognitoSignIn(email, password, remember); setMe(null); setProfileId(null); setAuth("signedIn"); };
  const signUp = async (email: string, password: string, remember = false) => { await cognitoSignUp(email, password, remember); setMe(null); setProfileId(null); setAuth("signedIn"); };
  const signOut = async () => { await cognitoSignOut(); setMe(null); setProfileId(null); setAuth("signedOut"); window.history.replaceState(null, "", "/"); };

  const value = useMemo<Ctx>(() => ({ me, error, reload, config, asOf, inPast, setAsOf, setProfileId, restart, auth, authConfig, signIn, signUp, signOut }),
    [me, error, reload, config, asOf, inPast, auth, authConfig]); // eslint-disable-line react-hooks/exhaustive-deps
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppProvider manquant");
  return c;
}

/** Path of a profile resource at the simulated date: `/profils/{pid}/…?as_of=…`. */
export function useProfilePath() {
  const { me, asOf } = useApp();
  return (rest = "", params: Record<string, string | number | null | undefined> = {}) =>
    me?.pid ? `/profils/${encodeURIComponent(me.pid)}${rest}${qs({ as_of: asOf, ...params })}` : null;
}
