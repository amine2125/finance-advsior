import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";
import { traduire, type Langue } from "./i18n/i18n";
import type { Cle } from "./i18n/fr";
import type { Actif, Preuve } from "./types";

export interface Config { as_of_defaut: string; donnees_debut: string; donnees_jusqu_au: string; llm: string; univers: Actif[]; episodes: Record<string, { debut: string; fin: string; libelle: string }> }
export interface Terme { cle: string; terme: string; definition: string; technique: string }

interface Ctx {
  config: Config | null; profil: string; asOf: string; enPassé: boolean; langue: Langue;
  setProfil: (p: string) => void; setAsOf: (d: string | null) => void; setLangue: (l: Langue) => void;
  t: (k: Cle, v?: Record<string, string>) => string; preuve: Preuve | null; ouvrirPreuve: (p: Preuve | null) => void;
  glossaire: Record<string, Terme>; rafraichir: number; toucher: () => void;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [sp, setSp] = useSearchParams();
  const [config, setConfig] = useState<Config | null>(null);
  const [langue, setLangueState] = useState<Langue>(() => (localStorageGet("ulysse.langue") as Langue) || "fr");
  const [preuve, ouvrirPreuve] = useState<Preuve | null>(null);
  const [glossaire, setGlossaire] = useState<Record<string, Terme>>({});
  const [rafraichir, setRafraichir] = useState(0);
  useEffect(() => { api<Config>("/config").then(setConfig).catch(() => setConfig(null)); }, []);
  const profil = sp.get("p") || "robert";
  const asOf = sp.get("d") || config?.as_of_defaut || "2026-11-14";
  const enPassé = !!config && asOf < config.as_of_defaut;
  useEffect(() => {
    api<Terme[]>("/glossaire", { params: { niveau: "standard" } }).then((g) => setGlossaire(Object.fromEntries(g.map((x) => [x.cle, x])))).catch(() => {});
  }, []);
  useEffect(() => { document.documentElement.lang = langue === "en" ? "en-CA" : "fr-CA"; }, [langue]);
  const setParam = useCallback((k: string, v: string | null) => {
    setSp((old) => { const n = new URLSearchParams(old); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: false });
  }, [setSp]);
  const value = useMemo<Ctx>(() => ({
    config, profil, asOf, enPassé, langue,
    setProfil: (p) => setParam("p", p), setAsOf: (d) => setParam("d", d), setLangue: (l) => { setLangueState(l); localStorageSet("ulysse.langue", l); },
    t: (k, v) => traduire(langue, k, v), preuve, ouvrirPreuve, glossaire, rafraichir, toucher: () => setRafraichir((x) => x + 1),
  }), [config, profil, asOf, enPassé, langue, preuve, glossaire, rafraichir, setParam]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppProvider manquant");
  return c;
}

function localStorageGet(k: string): string | null { try { return window.localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } }

export function useData<T>(path: string | null, params?: Record<string, string | undefined>, deps: unknown[] = []) {
  const { rafraichir } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [charge, setCharge] = useState(true);
  const key = JSON.stringify([path, params, rafraichir, ...deps]);
  const recharger = useCallback(() => {
    if (!path) { setCharge(false); return; }
    setCharge(true); setErreur(null);
    api<T>(path, { params }).then((d) => setData(d)).catch((e) => setErreur(e.message)).finally(() => setCharge(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { recharger(); }, [recharger]);
  return { data, erreur, charge, recharger };
}
