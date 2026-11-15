import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { friendly, kind } from "../lib/assets";
import { softSpring } from "./motion";
import { TickerLogo, sym } from "./Ticker";

/** Opens the search from anywhere (top bar, home tiles): window.dispatchEvent(new Event(OPEN_SEARCH)). */
export const OPEN_SEARCH = "aegis:search";
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH));

const RISK: Record<string, [string, string]> = { LOW: ["Risque faible", "text-gain-700"], MEDIUM: ["Risque moyen", "text-primary-600"], HIGH: ["Risque élevé", "text-accent-700"] };
const GROUPS: [string, string][] = [["equity", "Actions"], ["etf", "Fonds indiciels (FNB)"], ["crypto", "Cryptoactifs"]];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** « Analyser un titre » : find any security of the universe and open its page (risk in plain words, « Est-ce pour moi ? »). */
export default function AssetSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const list = useApi<any>(open ? "/assets" : null, [open]);
  useEffect(() => {
    const show = () => { setQ(""); setI(0); setOpen(true); };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !open && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) { e.preventDefault(); show(); }
    };
    window.addEventListener(OPEN_SEARCH, show);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener(OPEN_SEARCH, show); window.removeEventListener("keydown", key); };
  }, [open]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 30); }, [open]);

  const rows = useMemo(() => {
    const all: any[] = list.data?.assets || [];
    const n = norm(q.trim());
    const hit = (a: any) => !n || [a.asset_id, sym(a.asset_id), a.name, friendly(a.asset_id, a.name)].some((s) => norm(String(s)).includes(n));
    const order = (a: any) => GROUPS.findIndex(([c]) => c === a.asset_class);
    return all.filter(hit).sort((a, b) => {
      const exact = (x: any) => (norm(sym(x.asset_id)) === n ? 0 : norm(sym(x.asset_id)).startsWith(n) ? 1 : 2);
      return (n ? exact(a) - exact(b) : 0) || order(a) - order(b) || sym(a.asset_id).localeCompare(sym(b.asset_id));
    });
  }, [list.data, q]);
  const go = (id: string) => { setOpen(false); nav(`/placement/${encodeURIComponent(id)}`); };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <motion.div role="dialog" aria-label="Rechercher un titre" data-testid="asset-search" onMouseDown={(e) => e.stopPropagation()}
            className="flex max-h-[75vh] w-full max-w-lg flex-col overflow-hidden rounded-[24px] bg-surface shadow-lift hairline"
            initial={{ y: -12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -12, scale: 0.98 }} transition={softSpring}>
            <div className="flex items-center gap-3 border-b border-line px-5">
              <Search className="h-5 w-5 shrink-0 text-ink-muted" />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} data-testid="asset-search-input"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  else if (e.key === "ArrowDown") { e.preventDefault(); setI((v) => Math.min(rows.length - 1, v + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
                  else if (e.key === "Enter" && rows[i]) go(rows[i].asset_id);
                }}
                placeholder="Apple, NVDA, Bitcoin, obligations…" aria-label="Nom ou symbole du titre"
                className="h-14 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-muted/70" />
              <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-ink-muted hover:bg-ink/[0.05]" aria-label="Fermer"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {list.loading && !list.data && <p className="px-3 py-6 text-center text-sm text-ink-muted">Chargement…</p>}
              {list.data && !rows.length && <p className="px-3 py-6 text-center text-sm text-ink-muted">Aucun titre ne correspond. Le simulateur couvre {list.data.assets.length} placements.</p>}
              {rows.map((a: any, k: number) => {
                const head = !q.trim() && (k === 0 || rows[k - 1].asset_class !== a.asset_class);
                const [risk, tone] = RISK[a.tier] || ["Risque inconnu", "text-ink-muted"];
                return (
                  <div key={a.asset_id}>
                    {head && <div className="px-3 pb-1 pt-3 text-xs font-semibold text-ink-muted">{GROUPS.find(([c]) => c === a.asset_class)?.[1]}</div>}
                    <button onMouseEnter={() => setI(k)} onClick={() => go(a.asset_id)} data-testid="asset-search-row"
                      className={clsx("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left", k === i ? "bg-ink/[0.05]" : "")}>
                      <TickerLogo id={a.asset_id} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{sym(a.asset_id)}</span>
                        <span className="block truncate text-xs text-ink-muted">{friendly(a.asset_id, a.name)} · {kind(a)}</span>
                      </span>
                      <span className={clsx("shrink-0 text-xs font-medium", tone)}>{risk}</span>
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">Ouvrez un titre pour voir son risque et demander aux agents s'il convient à votre profil.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
