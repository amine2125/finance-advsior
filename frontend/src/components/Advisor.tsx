import clsx from "clsx";
import { ArrowRight, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../hooks/useApp";
import { useLaunch } from "../lib/launch";
import { vous } from "../lib/ulysse";
import { api, ApiError } from "../services/api";
import { openSearch } from "./AssetSearch";

export const ADVISOR_NAME = "Léa";

export function AdvisorAvatar({ size = 40 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-gold-500 font-semibold text-ink" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {ADVISOR_NAME[0]}
    </span>
  );
}

type Action = { code: string; libelle: string; lien?: string; params?: Record<string, string>; intention?: any };
type Msg = { role: "user" | "assistant"; text: string; lines?: string[]; frame?: string[]; actions?: Action[]; error?: boolean };
type Ctx = { open: boolean; setOpen: (v: boolean) => void; ask: (q?: string) => void };
const AdvisorCtx = createContext<Ctx | null>(null);

function suggestions(path: string): string[] {
  if (path.startsWith("/mandats")) return ["Mon portefeuille respecte-t-il mes règles ?", "Et si j'en mettais 1 000 $ ?", "Est-ce que Tesla me convient ?"];
  if (path.startsWith("/placements")) return ["Mon portefeuille respecte-t-il mes règles ?", "Je veux 1 000 $ de XBB", "Et Bitcoin ?"];
  if (path.startsWith("/placement/")) return ["Et si j'en mettais 2 000 $ ?", "Est-ce que je devrais en acheter ?", "Mon portefeuille respecte-t-il mes règles ?"];
  return ["Est-ce que je devrais investir 1 000 $ dans NVIDIA ?", "Tout le monde parle du Bitcoin. Est-ce pour moi ?", "Mon portefeuille respecte-t-il mes règles ?"];
}

export function AdvisorProvider({ children }: { children: ReactNode }) {
  const { me, asOf } = useApp();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [running, setRunning] = useState(false);

  const send = useCallback(async (text: string) => {
    const m = text.trim();
    if (!m || running || !me?.pid) return;
    setMsgs((x) => [...x, { role: "user", text: m }]);
    setRunning(true);
    // On a security page, « et si j'en mettais 2 000 $ ? » is about that security.
    const here = loc.pathname.match(/^\/placement\/([^/]+)/);
    try {
      const r = await api.post<any>(`/profils/${encodeURIComponent(me.pid)}/assistant`, { message: m, as_of: asOf, contexte: here ? { ticker: decodeURIComponent(here[1]) } : {} });
      setMsgs((x) => [...x, {
        role: "assistant", text: "", lines: (r.phrases || []).map((p: any) => vous(p.texte)),
        frame: (r.cadre || []).map(vous), actions: r.actions || [],
      }]);
    } catch (e) {
      setMsgs((x) => [...x, { role: "assistant", text: (e as ApiError).status === 429 ? "Beaucoup de questions d'un coup : réessayez dans quelques secondes." : "Désolé, je n'ai pas pu répondre cette fois-ci. Réessayez dans un instant.", error: true }]);
    } finally {
      setRunning(false);
    }
  }, [running, me?.pid, asOf, loc.pathname]);

  const ask = useCallback((q?: string) => { setOpen(true); if (q) send(q); }, [send]);
  const reset = () => setMsgs([]);

  return (
    <AdvisorCtx.Provider value={{ open, setOpen, ask }}>
      {children}
      <AdvisorPanel open={open} setOpen={setOpen} msgs={msgs} running={running} send={send} reset={reset} />
    </AdvisorCtx.Provider>
  );
}

export function useAdvisor() {
  const c = useContext(AdvisorCtx);
  if (!c) throw new Error("AdvisorProvider manquant");
  return c;
}

/** The engine's links point at its own pages; each one opens the matching screen of this interface. */
function target(a: Action): string | null {
  const l = a.lien || "";
  const t = l.match(/^\/titre\/([^?]+)/);
  if (t) return `/placement/${t[1]}`;
  if (l.startsWith("/portefeuille")) return "/placements";
  if (l.startsWith("/contrat")) return "/profil";
  return null;
}

function AdvisorPanel({ open, setOpen, msgs, running, send, reset }:
  { open: boolean; setOpen: (v: boolean) => void; msgs: Msg[]; running: boolean; send: (t: string) => void; reset: () => void }) {
  const { me } = useApp();
  const loc = useLocation();
  const nav = useNavigate();
  const launch = useLaunch();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, running]);
  useEffect(() => { if (open) setTimeout(() => field.current?.focus(), 50); }, [open]);
  const name = me?.profile?.display_name || "";
  const submit = () => { if (input.trim()) { send(input); setInput(""); } };
  const act = async (a: Action, question: string) => {
    if (a.code === "dossier" && a.intention) {
      setBusy(a.libelle);
      try { await launch(question, a.intention); setOpen(false); } catch { /* the run page reports */ } finally { setBusy(null); }
      return;
    }
    if (a.lien === "/marche") { setOpen(false); openSearch(); return; }
    const to = target(a);
    if (to) { setOpen(false); nav(to); }
  };
  const label = (a: Action) => (a.code === "dossier" ? "Demander l'analyse complète des agents" : a.code === "contrat" ? "Voir mes règles" : a.lien === "/marche" ? "Chercher un titre" : a.lien?.startsWith("/portefeuille") ? "Voir mes placements" : vous(a.libelle).replace(/^Ouvrir la fiche de /, "Voir ").replace(/^Ouvrir /, "Voir "));

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} data-testid="advisor-open" data-tour="lea" aria-label={`Parler à ${ADVISOR_NAME}, votre assistante`}
          title={`Une question ? Parlez à ${ADVISOR_NAME}`}
          className="fixed bottom-20 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-ink text-white shadow-lift transition hover:scale-105 hover:bg-black md:bottom-6 md:right-6">
          <MessageCircle className="h-6 w-6" />
          {msgs.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-primary-500 ring-2 ring-white" />}
        </button>
      )}
      {open && (
        <div className="animate-pop fixed inset-0 z-50 flex flex-col overflow-hidden bg-white shadow-lift sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100vh-48px))] sm:w-[400px] sm:rounded-3xl sm:border sm:border-line"
          role="dialog" aria-label={`${ADVISOR_NAME}, votre assistante`} data-testid="advisor-panel">
          <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3.5 text-ink">
            <AdvisorAvatar />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{ADVISOR_NAME} <span className="text-xs font-normal text-ink-muted">· assistante pédagogique</span></div>
              <div className="truncate text-xs text-ink-muted">Me connaît : profil {me?.profile?.risk_profile_label?.toLowerCase()}, vos règles, vos placements</div>
            </div>
            {msgs.length > 0 && <button onClick={reset} className="rounded-full p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Nouvelle conversation" title="Nouvelle conversation"><RotateCcw className="h-4 w-4" /></button>}
            <button onClick={() => setOpen(false)} className="rounded-full p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Fermer"><X className="h-5 w-5" /></button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-canvas px-4 py-4">
            <Bubble role="assistant">
              <p>Bonjour{name ? ` ${name}` : ""}, ici {ADVISOR_NAME}. Dites-moi ce que vous envisagez, par exemple <i>« Est-ce que je devrais investir 2 000 $ dans Apple ? »</i>. Je vérifie si c'est <b>compatible ou non</b> avec vos règles, et pourquoi. Je ne donne pas de conseil personnalisé.</p>
            </Bubble>
            {msgs.map((m, i) => (
              <Bubble key={i} role={m.role} error={m.error}>
                {m.role === "user" || m.error ? m.text : (
                  <div className="space-y-1.5">
                    {(m.frame || []).map((f, k) => <p key={`f${k}`} className="text-ink-soft">{f}</p>)}
                    {(m.lines || []).map((l, k) => <p key={k}>{l}</p>)}
                    {(m.actions || []).length > 0 && (
                      <div className="flex flex-col items-start gap-1.5 pt-1.5">
                        {m.actions!.map((a) => (
                          <button key={a.code + (a.lien || "")} onClick={() => act(a, msgs[i - 1]?.text || "")} disabled={!!busy}
                            className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1.5 text-left text-xs font-medium text-primary-600 hover:bg-primary-100 disabled:opacity-50">
                            {busy === a.libelle ? "Les agents démarrent…" : label(a)} <ArrowRight className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Bubble>
            ))}
            {running && (
              <Bubble role="assistant">
                <div className="flex items-center gap-2 text-ink-soft">
                  <span className="flex gap-1"><span className="dot h-1.5 w-1.5 rounded-full bg-ink" /><span className="dot h-1.5 w-1.5 rounded-full bg-ink" /><span className="dot h-1.5 w-1.5 rounded-full bg-ink" /></span>
                  <span className="text-xs">Je compare avec vos règles…</span>
                </div>
              </Bubble>
            )}
            {!msgs.length && !running && (
              <div className="flex flex-col items-start gap-2 pt-1">
                {suggestions(loc.pathname).map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-white px-3.5 py-2 text-left text-sm text-ink hover:border-ink/30">{s}</button>
                ))}
              </div>
            )}
            <div ref={end} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2 border-t border-line bg-white p-3">
            <textarea ref={field} rows={1} value={input} onChange={(e) => setInput(e.target.value)} data-testid="chat-input"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Écrivez votre question…" className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-canvas px-4 py-2.5 text-sm focus:border-primary-500 focus:bg-white focus:outline-none" />
            <button type="submit" disabled={running || !input.trim()} aria-label="Envoyer"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-black disabled:opacity-30"><Send className="h-4 w-4" /></button>
          </form>
          <p className="bg-white px-4 pb-2 text-center text-[10px] text-ink-muted">Simulation éducative · le code comprend et calcule, chaque chiffre est vérifié avant affichage</p>
        </div>
      )}
    </>
  );
}

function Bubble({ role, children, error }: { role: "user" | "assistant"; children: ReactNode; error?: boolean }) {
  return (
    <div className={role === "user" ? "flex justify-end" : "flex justify-start"}>
      <div className={clsx("text-sm leading-relaxed",
        role === "user" ? "max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-white"
          : clsx("max-w-[92%] rounded-2xl rounded-bl-md px-3.5 py-3 shadow-card", error ? "bg-accent-50 text-accent-700" : "bg-white text-ink"))}>
        {children}
      </div>
    </div>
  );
}
