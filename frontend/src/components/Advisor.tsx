import clsx from "clsx";
import { MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { api, ApiError, Job, pollJob } from "../services/api";
import Markdown from "./Markdown";

export const ADVISOR_NAME = "Léa";

export function AdvisorAvatar({ size = 40 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-gold-500 font-semibold text-ink" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {ADVISOR_NAME[0]}
    </span>
  );
}

type Msg = { role: "user" | "assistant"; text: string; meta?: any; error?: boolean };
type Ctx = { open: boolean; setOpen: (v: boolean) => void; ask: (q?: string) => void };
const AdvisorCtx = createContext<Ctx | null>(null);

/** Technical metric ids are kept for the audit trail, never shown to the client. */
const clean = (t: string) => t.replace(/\s*\[(?:[a-z]+\.[A-Za-z0-9_.\-]+)(?:\s*[,;]\s*[a-z]+\.[A-Za-z0-9_.\-]+)*\]/g, "").replace(/\(\s*\)/g, "");

const STEP_FR: [RegExp, string][] = [
  [/check_investment/, "Je vérifie ce placement avec votre profil…"],
  [/recommended_plan/, "Je prépare un plan adapté à votre profil…"],
  [/portfolio_xray|compare_alternatives|what_changed/, "J'analyse vos placements…"],
  [/hype_research/, "Je vérifie les nouvelles et les sources officielles…"],
  [/asset_analysis|hypothetical_addition|run_scenario/, "J'étudie ce placement…"],
  [/Audit/i, "Je vérifie chaque chiffre de ma réponse…"],
  [/Compréhension/i, "Je lis votre question…"],
];
function stepText(job: Job | null): string {
  const s = [...(job?.steps || [])].reverse().find((x) => x.status === "running") || job?.steps?.[job.steps.length - 1];
  if (!s) return "Je regarde votre profil et vos placements…";
  for (const [rx, t] of STEP_FR) if (rx.test(s.label)) return t;
  return "Je réfléchis à votre question…";
}

function suggestions(path: string): string[] {
  if (path.startsWith("/mandats")) return ["Pourquoi cette proposition ?", "Que veut dire « pire baisse historique » ?", "Que se passe-t-il si j'approuve ?"];
  if (path.startsWith("/placements")) return ["Mon portefeuille est-il adapté à mon profil ?", "Pourquoi mon portefeuille est-il risqué ?", "Que me conseilles-tu de changer ?"];
  return ["Est-ce que je devrais investir 1 000 $ dans NVIDIA ?", "Tout le monde parle du Bitcoin. Est-ce pour moi ?", "J'ai 5 000 $, comment je devrais investir ?"];
}

export function AdvisorProvider({ children }: { children: ReactNode }) {
  const { me, portfolio } = useApp();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conv, setConv] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [running, setRunning] = useState(false);

  const send = useCallback(async (text: string) => {
    const m = text.trim();
    if (!m || running) return;
    setMsgs((x) => [...x, { role: "user", text: m }]);
    setRunning(true);
    setJob(null);
    try {
      const j = await api.post<{ job_id: string }>("/agents/chat", { message: m, portfolio_id: portfolio?.portfolio_id, persona_id: me?.profile?.persona_id, conversation_id: conv });
      const final = await pollJob(j.job_id, setJob, 1000);
      if (final.status === "done" && final.result) {
        setConv(final.result.conversation_id);
        setMsgs((x) => [...x, { role: "assistant", text: clean(final.result.answer), meta: final.result }]);
      } else {
        setMsgs((x) => [...x, { role: "assistant", text: "Désolé, je n'ai pas pu répondre cette fois-ci. " + (final.error || ""), error: true }]);
      }
    } catch (e) {
      setMsgs((x) => [...x, { role: "assistant", text: (e as ApiError).message, error: true }]);
    } finally {
      setRunning(false);
    }
  }, [running, portfolio, me, conv]);

  const ask = useCallback((q?: string) => { setOpen(true); if (q) send(q); }, [send]);
  const reset = () => { setMsgs([]); setConv(null); };

  return (
    <AdvisorCtx.Provider value={{ open, setOpen, ask }}>
      {children}
      <AdvisorPanel open={open} setOpen={setOpen} msgs={msgs} running={running} job={job} send={send} reset={reset} />
    </AdvisorCtx.Provider>
  );
}

export function useAdvisor() {
  const c = useContext(AdvisorCtx);
  if (!c) throw new Error("AdvisorProvider manquant");
  return c;
}

function AdvisorPanel({ open, setOpen, msgs, running, job, send, reset }:
  { open: boolean; setOpen: (v: boolean) => void; msgs: Msg[]; running: boolean; job: Job | null; send: (t: string) => void; reset: () => void }) {
  const { me } = useApp();
  const loc = useLocation();
  const sys = useApi<any>("/system/info");
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, running, job]);
  useEffect(() => { if (open) setTimeout(() => field.current?.focus(), 50); }, [open]);
  const name = me?.profile?.display_name || "";
  const submit = () => { if (input.trim()) { send(input); setInput(""); } };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} data-testid="advisor-open" aria-label="Parler à Léa, votre conseillère"
          title="Une question ? Parlez à Léa"
          className="fixed bottom-20 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-ink text-white shadow-lift transition hover:scale-105 hover:bg-black md:bottom-6 md:right-6">
          <MessageCircle className="h-6 w-6" />
          {msgs.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-brand-800 ring-2 ring-white" />}
        </button>
      )}
      {open && (
        <div className="animate-pop fixed inset-0 z-50 flex flex-col overflow-hidden bg-white shadow-lift sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,calc(100vh-48px))] sm:w-[400px] sm:rounded-3xl sm:border sm:border-line"
          role="dialog" aria-label="Léa, votre conseillère" data-testid="advisor-panel">
          <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3.5 text-ink">
            <AdvisorAvatar />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{ADVISOR_NAME} <span className="text-xs font-normal text-ink-muted">· conseillère virtuelle (IA)</span></div>
              <div className="truncate text-xs text-ink-muted">Me connaît : profil {me?.profile?.risk_profile_label?.toLowerCase()}, objectifs, placements</div>
            </div>
            {msgs.length > 0 && <button onClick={reset} className="rounded-full p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Nouvelle conversation" title="Nouvelle conversation"><RotateCcw className="h-4 w-4" /></button>}
            <button onClick={() => setOpen(false)} className="rounded-full p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Fermer"><X className="h-5 w-5" /></button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-canvas px-4 py-4">
            <Bubble role="assistant">
              <p>Bonjour{name ? ` ${name}` : ""}, ici {ADVISOR_NAME}. Dites-moi ce que vous envisagez, par exemple <i>« Est-ce que je devrais investir 2 000 $ dans Apple ? »</i>. Je vous dirai si je vous le <b>conseille ou non</b>, selon votre profil, et pourquoi.</p>
            </Bubble>
            {sys.data && !sys.data.llm_ready && (
              <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Le conseiller IA n'est pas connecté sur ce serveur ({sys.data.llm_status}). La vérification d'un placement dans « Investir » fonctionne sans lui.</div>
            )}
            {msgs.map((m, i) => (
              <Bubble key={i} role={m.role} error={m.error}>
                {m.role === "user" ? m.text : <Markdown text={m.text} />}
                {m.meta?.biases?.map((b: any) => (
                  <div key={b.bias} className="mt-2 rounded-lg bg-brand-50 p-2 text-xs text-brand-800"><b>Bon à savoir — {b.label.toLowerCase()} :</b> {b.educational_response}</div>
                ))}
              </Bubble>
            ))}
            {running && (
              <Bubble role="assistant">
                <div className="flex items-center gap-2 text-ink-soft">
                  <span className="flex gap-1"><span className="dot h-1.5 w-1.5 rounded-full bg-brand-800" /><span className="dot h-1.5 w-1.5 rounded-full bg-brand-800" /><span className="dot h-1.5 w-1.5 rounded-full bg-brand-800" /></span>
                  <span className="text-xs">{stepText(job)}</span>
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
              placeholder="Écrivez votre question…" className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-canvas px-4 py-2.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none" />
            <button type="submit" disabled={running || !input.trim()} aria-label="Envoyer"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-black disabled:opacity-30"><Send className="h-4 w-4" /></button>
          </form>
          <p className="bg-white px-4 pb-2 text-center text-[10px] text-ink-muted">Simulation éducative · chaque chiffre est vérifié avant affichage</p>
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
