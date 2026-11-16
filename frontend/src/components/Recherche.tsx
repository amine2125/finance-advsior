import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SECTEURS } from "../libelles";
import { useApp } from "../state";
import type { Actif } from "../types";
import { softSpring } from "./motion";

/** Opens the search from anywhere: window.dispatchEvent(new Event(OUVRIR_RECHERCHE)). */
export const OUVRIR_RECHERCHE = "ulysse:recherche";
export const ouvrirRecherche = () => window.dispatchEvent(new Event(OUVRIR_RECHERCHE));

const GROUPES: [string, string][] = [["equity", "Actions"], ["etf", "Fonds négociés en bourse (FNB)"], ["crypto", "Cryptoactifs"]];
const groupe = (a: Actif) => (a.asset_class.startsWith("etf") ? "etf" : a.asset_class);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Find any security of the universe and open its page (from AEGIS, Raouf). Shortcut: the « / » key. */
export function RechercheTitre() {
  const { config, profil, asOf, enPassé } = useApp();
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const montrer = () => { setQ(""); setI(0); setOuvert(true); };
    const touche = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !ouvert && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) { e.preventDefault(); montrer(); }
    };
    window.addEventListener(OUVRIR_RECHERCHE, montrer);
    window.addEventListener("keydown", touche);
    return () => { window.removeEventListener(OUVRIR_RECHERCHE, montrer); window.removeEventListener("keydown", touche); };
  }, [ouvert]);
  useEffect(() => { if (ouvert) window.setTimeout(() => input.current?.focus(), 30); }, [ouvert]);
  const lignes = useMemo(() => {
    const n = norm(q.trim());
    const tous = config?.univers ?? [];
    const exact = (a: Actif) => (norm(a.ticker) === n ? 0 : norm(a.ticker).startsWith(n) ? 1 : 2);
    return tous.filter((a) => !n || [a.ticker, a.name, SECTEURS[a.sector] ?? a.sector].some((s) => norm(String(s)).includes(n)))
      .sort((a, b) => (n ? exact(a) - exact(b) : 0) || GROUPES.findIndex(([g]) => g === groupe(a)) - GROUPES.findIndex(([g]) => g === groupe(b)) || a.ticker.localeCompare(b.ticker));
  }, [config, q]);
  const aller = (t: string) => { setOuvert(false); nav(`/titre/${encodeURIComponent(t)}?p=${profil}${enPassé ? `&d=${asOf}` : ""}`); };
  return (
    <AnimatePresence>{ouvert && (
      <motion.div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={() => setOuvert(false)}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
        <motion.div role="dialog" aria-label="Rechercher un titre" onMouseDown={(e) => e.stopPropagation()}
          className="flex max-h-[75vh] w-full max-w-lg flex-col overflow-hidden rounded-[24px] bg-surface shadow-lift hairline"
          initial={{ y: -12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -12, scale: 0.98 }} transition={softSpring}>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <Search className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
            <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} aria-label="Nom, symbole ou secteur du titre"
              onKeyDown={(e) => {
                if (e.key === "Escape") setOuvert(false);
                else if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(lignes.length - 1, v + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
                else if (e.key === "Enter" && lignes[i]) aller(lignes[i].ticker);
              }}
              placeholder="Apple, NVDA, Bitcoin, obligations…" className="h-14 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-muted" />
            <button onClick={() => setOuvert(false)} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-ink/[0.05]" aria-label="Fermer"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {!lignes.length && <p className="px-3 py-6 text-center text-sm text-ink-muted">Aucun titre ne correspond. L'univers du jeu de départ compte {config?.univers.length ?? 31} actifs.</p>}
            {lignes.map((a, k) => {
              const titre = !q.trim() && (k === 0 || groupe(lignes[k - 1]) !== groupe(a));
              return (
                <div key={a.ticker}>
                  {titre && <div className="px-3 pb-1 pt-3 text-xs font-semibold text-ink-muted">{GROUPES.find(([g]) => g === groupe(a))?.[1]}</div>}
                  <button onMouseEnter={() => setI(k)} onClick={() => aller(a.ticker)} className={clsx("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left", k === i && "bg-ink/[0.05]")}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">{a.ticker.slice(0, 2)}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{a.ticker}</span>
                      <span className="block truncate text-xs text-ink-muted">{a.name} · {SECTEURS[a.sector] ?? a.sector} · {a.currency}</span></span>
                  </button>
                </div>);
            })}
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">Ouvre un titre pour voir ses chiffres prouvés et vérifier un ordre contre tes règles.</p>
        </motion.div>
      </motion.div>)}</AnimatePresence>
  );
}
