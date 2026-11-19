import { useNavigate } from "react-router-dom";
import { sym } from "../components/Ticker";
import { useApp } from "../hooks/useApp";
import { api, ApiError, qs } from "../services/api";
import { cad } from "./format";

export type Intention = { type: "ordre"; ticker: string; montant_cad: number } | { type: "titre"; ticker: string } | { type: "portefeuille" };

export const REVIEW = "Mon portefeuille respecte-t-il mes règles ?";
const KEY = "ulysse.demandes";

/** The request as the person wrote it, kept on this device next to the dossier id (the engine keeps the structured intention). */
export function requestOf(id: string, intention?: any): string {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (m[id]) return m[id];
  } catch { /* private mode */ }
  return intention ? describe(intention) : "";
}
function remember(id: string, text: string) {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || "{}");
    m[id] = text;
    const keys = Object.keys(m);
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete m[k];
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch { /* private mode */ }
}

/** A dossier's intention in the person's words. */
export function describe(it: any): string {
  if (it?.type === "ordre") return `Je veux ${cad(it.montant_cad)} de ${sym(it.ticker)}`;
  if (it?.type === "titre") return `Est-ce que ${sym(it.ticker)} me convient ?`;
  return REVIEW;
}

/**
 * Starts the agents on a request and opens the live run. Plain words are first understood by the engine's assistant
 * (deterministic parsing, no LLM: security, amount or share, intent); a structured intention skips that step.
 */
export function useLaunch() {
  const nav = useNavigate();
  const { me, asOf } = useApp();
  return async (request: string, intention?: Intention) => {
    const pid = me?.pid;
    if (!pid) return;
    let it: any = intention;
    if (!it) {
      const r = await api.post<any>(`/profils/${encodeURIComponent(pid)}/assistant`, { message: request, as_of: asOf });
      it = (r.actions || []).find((a: any) => a.code === "dossier")?.intention;
      if (!it) {
        throw new ApiError(400, "incompris", r.comprehension?.type === "sans_titre"
          ? "De quel titre parlez-vous ? Le simulateur couvre les 31 placements du jeu de données, par exemple NVDA, RY.TO, XBB.TO ou BTC-USD."
          : "Je n'ai pas compris la demande. Essayez par exemple « Je veux 2 000 $ de NVIDIA », « Et Tesla ? » ou « Mon portefeuille respecte-t-il mes règles ? ».");
      }
    }
    const d = await api.post<{ id: string }>(`/dossiers${qs({})}`, { profil: pid, as_of: asOf, intention: it });
    remember(d.id, request || describe(it));
    nav(`/mandats/en-cours/${d.id}?q=${encodeURIComponent(request || describe(it))}`);
  };
}
