import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../state";
import type { Niveau, Preuve } from "../types";
import { PuceNiveau } from "./base";
import { softSpring } from "./motion";
import { Phrase } from "./phrase";

/* Chatbot kept inside ULYSSE's rules (backend: ulysse/assistant.py). The code understands the question, computes with the
   same tools as the rest of the app and verifies every sentence; the LLM may only rephrase. It never recommends or predicts. */

interface Reponse {
  question: string; cadre: string[]; phrases: { texte: string; etiquette: string; preuves: string[] }[]; redige_par: string;
  verification: { accepte: boolean; defauts: string[]; essais: unknown[] }; signal: { niveau: Niveau; titre: string; regles_declenchees: string[] } | null;
  preuves: Record<string, Preuve>; actions: { code: string; libelle: string; lien?: string; params?: Record<string, string>; intention?: Record<string, unknown> }[];
  latence_ms: number;
}
type Msg = { role: "user"; text: string } | { role: "assistant"; r: Reponse } | { role: "erreur"; text: string };

interface Ctx { ouvert: boolean; setOuvert: (v: boolean) => void; envoyer: (t: string) => void }
const AssistantCtx = createContext<Ctx | null>(null);
export function useAssistant() { const c = useContext(AssistantCtx); if (!c) throw new Error("AssistantProvider manquant"); return c; }

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { profil, asOf } = useApp();
  const loc = useLocation();
  const [ouvert, setOuvert] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { setMsgs([]); }, [profil]);
  const ticker = decodeURIComponent(loc.pathname.match(/^\/titre\/([^/]+)/)?.[1] ?? "") || undefined;
  const envoyer = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || occupe) return;
    setOuvert(true);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setOccupe(true);
    try {
      const r = await api<Reponse>(`/profils/${profil}/assistant`, { body: { message: q, as_of: asOf, contexte: { ticker } } });
      setMsgs((m) => [...m, { role: "assistant", r }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "erreur", text: (e as Error).message }]);
    } finally { setOccupe(false); }
  }, [profil, asOf, ticker, occupe]);
  const value = useMemo(() => ({ ouvert, setOuvert, envoyer }), [ouvert, envoyer]);
  return <AssistantCtx.Provider value={value}>{children}
    <Panneau ouvert={ouvert} setOuvert={setOuvert} msgs={msgs} occupe={occupe} envoyer={envoyer} reset={() => setMsgs([])} ticker={ticker} />
  </AssistantCtx.Provider>;
}

export function AvatarAssistant({ size = 36 }: { size?: number }) {
  return <span className="grid shrink-0 place-items-center rounded-full bg-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" style={{ width: size, height: size }} aria-hidden>
    <ShieldCheck className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} /></span>;
}

function suggestions(ticker?: string): string[] {
  if (ticker) return [`Et si j'en mettais 5 000 $ ?`, `Que disent mes règles sur ${ticker} ?`, "Mon portefeuille respecte-t-il mes règles ?"];
  return ["Je veux mettre 20 000 $ dans NVIDIA", "Mon portefeuille respecte-t-il mes règles ?", "Et Tesla ?"];
}

function Panneau({ ouvert, setOuvert, msgs, occupe, envoyer, reset, ticker }:
  { ouvert: boolean; setOuvert: (v: boolean) => void; msgs: Msg[]; occupe: boolean; envoyer: (t: string) => void; reset: () => void; ticker?: string }) {
  const [input, setInput] = useState("");
  const fin = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, occupe]);
  useEffect(() => {
    if (!ouvert) return;
    setTimeout(() => champ.current?.focus(), 50);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ouvert, setOuvert]);
  const soumettre = () => { if (input.trim()) { envoyer(input); setInput(""); } };
  return (
    <>
      {!ouvert && (
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setOuvert(true)} aria-label="Poser une question à l'assistant"
          className="fixed bottom-20 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-ink text-white shadow-lift transition hover:bg-black md:bottom-6 md:right-6">
          <MessageCircle className="h-6 w-6" />
          {msgs.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-primary-500 ring-2 ring-white" />}
        </motion.button>
      )}
      <AnimatePresence>
        {ouvert && (
          <motion.div role="dialog" aria-label="Assistant ULYSSE" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }} transition={softSpring}
            className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white shadow-lift sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-48px))] sm:w-[420px] sm:rounded-[28px]">
            <header className="flex items-center gap-3 border-b border-line px-4 py-3.5">
              <AvatarAssistant />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Assistant ULYSSE</div>
                <div className="truncate text-xs text-ink-muted">Vérifie tes intentions contre tes règles · ne conseille pas</div>
              </div>
              {msgs.length > 0 && <button onClick={reset} className="rounded-full p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Nouvelle conversation" title="Nouvelle conversation"><RotateCcw className="h-4 w-4" /></button>}
              <button onClick={() => setOuvert(false)} className="rounded-full p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Fermer"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto bg-canvas px-4 py-4" aria-live="polite">
              <Bulle role="assistant">
                <p>Écris ce que tu envisages, par exemple <i>« 20 000 $ dans NVIDIA »</i>. Je le compare à <b>tes</b> règles, avec les preuves. Je ne dis jamais quoi acheter ou vendre, et je ne prédis pas les cours.</p>
              </Bulle>
              {msgs.map((m, i) => m.role === "user" ? <Bulle key={i} role="user">{m.text}</Bulle>
                : m.role === "erreur" ? <Bulle key={i} role="assistant" erreur>{m.text}</Bulle>
                : <Bulle key={i} role="assistant"><Reponse r={m.r} fermer={() => setOuvert(false)} /></Bulle>)}
              {occupe && <Bulle role="assistant"><span className="flex items-center gap-2 text-xs text-ink-soft"><span className="squelette h-2 w-10" />Je vérifie avec tes règles…</span></Bulle>}
              {!msgs.length && !occupe && (
                <div className="flex flex-col items-start gap-2 pt-1">
                  {suggestions(ticker).map((s) => <button key={s} onClick={() => envoyer(s)} className="rounded-full border border-line bg-white px-3.5 py-2 text-left text-sm text-ink hover:border-ink/30">{s}</button>)}
                </div>
              )}
              <div ref={fin} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); soumettre(); }} className="flex items-end gap-2 border-t border-line bg-white p-3">
              <label htmlFor="assistant-champ" className="visuellement-cache">Ta question</label>
              <textarea id="assistant-champ" ref={champ} rows={1} value={input} maxLength={500} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); soumettre(); } }}
                placeholder="Écris ta question…" className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-canvas px-4 py-2.5 text-sm focus:border-ink focus:bg-white focus:outline-none" />
              <button type="submit" disabled={occupe || !input.trim()} aria-label="Envoyer"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-black disabled:opacity-30"><Send className="h-4 w-4" /></button>
            </form>
            <p className="bg-white px-4 pb-2 text-center text-[10px] text-ink-muted">Simulation · chaque chiffre est vérifié en code avant affichage</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Bulle({ role, children, erreur }: { role: "user" | "assistant"; children: ReactNode; erreur?: boolean }) {
  return (
    <div className={role === "user" ? "flex justify-end" : "flex justify-start"}>
      <div className={clsx("text-sm leading-relaxed", role === "user" ? "max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-white"
        : clsx("max-w-[94%] rounded-2xl rounded-bl-md px-3.5 py-3 shadow-card", erreur ? "bg-loss-50 text-loss-700" : "bg-white text-ink"))}>{children}</div>
    </div>
  );
}

function Reponse({ r, fermer }: { r: Reponse; fermer: () => void }) {
  const { ouvrirPreuve, profil, asOf, enPassé } = useApp();
  const nav = useNavigate();
  const [occupe, setOccupe] = useState(false);
  const suffixe = (extra?: Record<string, string>) => {
    const q = new URLSearchParams({ p: profil, ...(enPassé ? { d: asOf } : {}), ...(extra ?? {}) });
    return `?${q}`;
  };
  const agir = async (a: Reponse["actions"][number]) => {
    if (a.code === "dossier") {
      setOccupe(true);
      try {
        const d = await api<{ id: string }>("/dossiers", { body: { profil, as_of: asOf, intention: a.intention } });
        nav(`/dossier/${d.id}?p=${profil}&d=${asOf}`); fermer();
      } finally { setOccupe(false); }
    } else if (a.lien) { nav(`${a.lien}${suffixe(a.params)}`); fermer(); }
  };
  return (
    <div className="space-y-2.5">
      {r.cadre.map((c, i) => <p key={i} className="text-ink-soft">{c}</p>)}
      {r.signal && r.signal.niveau !== "aucun" && <div><PuceNiveau niveau={r.signal.niveau} /></div>}
      {r.phrases.map((ph, i) => <Phrase key={i} texte={ph.texte} etiquette={ph.etiquette} ids={ph.preuves} preuves={r.preuves} ouvrir={ouvrirPreuve} className="leading-relaxed" />)}
      {r.actions.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{r.actions.map((a) => (
        <button key={a.code + a.libelle} disabled={occupe} onClick={() => agir(a)} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-ink/30 disabled:opacity-40">{a.libelle}</button>))}</div>}
      {r.phrases.length > 0 && <p className="text-[11px] text-ink-muted">
        {r.verification.accepte ? "✓ Vérifié en code" : "⚠ Vérification incomplète"} · rédigé par {r.redige_par === "code" ? "le code (gabarit)" : r.redige_par}{r.signal ? ` · niveau décidé par la politique écrite (règles ${r.signal.regles_declenchees.join(", ") || "—"})` : ""}</p>}
    </div>
  );
}
