import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useApp } from "../state";
import * as f from "../format";
import { softSpring } from "./motion";

const LIBELLES: [string, string][] = [
  ["mesure", "Mesure"], ["sujet", "Sujet"], ["unite", "Unité"], ["devise", "Devise"], ["as_of", "Date de simulation"],
  ["date_de_calcul", "Dernière donnée utilisée"], ["methode", "Méthode"], ["version_du_code", "Version du code"],
];

function Ligne({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(110px,38%)_1fr] gap-3 border-b border-line py-2.5 text-sm"><dt className="text-ink-muted">{k}</dt><dd className="min-w-0 break-words text-ink">{children}</dd></div>;
}

/** Evidence drawer: where a number comes from (source, date, period, currency, method, parameters, code version). */
export function TiroirPreuve() {
  const { preuve, ouvrirPreuve } = useApp();
  const fermer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!preuve) return;
    fermer.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") ouvrirPreuve(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [preuve, ouvrirPreuve]);
  const p = preuve;
  const aff = p?.affichage ?? {};
  return (
    <AnimatePresence>
      {p && (
        <motion.div className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-[2px]" onClick={() => ouvrirPreuve(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.aside role="dialog" aria-modal="true" aria-labelledby="titre-preuve" onClick={(e) => e.stopPropagation()}
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={softSpring}
            className="absolute inset-y-0 right-0 flex w-[min(520px,100vw)] flex-col overflow-y-auto bg-white shadow-lift sm:inset-y-3 sm:right-3 sm:rounded-[28px]">
            <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-600">Preuve</p>
                <h2 id="titre-preuve" className="mt-1 font-display text-xl font-medium tracking-[-0.02em]">{p.libelle}</h2>
                <p className="mt-1 text-xs text-ink-muted">Identifiant <code>{p.id}</code> · calculé par le code, jamais par le LLM</p>
              </div>
              <button ref={fermer} onClick={() => ouvrirPreuve(null)} className="rounded-full p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label="Fermer"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-6 px-6 py-5">
              {p.statut !== "ok" && <p className="rounded-xl bg-canvas p-3 text-sm text-ink-soft">{p.statut === "donnees_insuffisantes" ? "Données insuffisantes" : "Non applicable"}{p.note ? ` : ${p.note}` : ""}</p>}
              {Object.keys(aff).length > 0 && (
                <div><h3 className="text-sm font-semibold">Valeurs</h3>
                  <dl className="mt-1">{Object.entries(aff).map(([k, v]) => <Ligne key={k} k={k.replaceAll("_", " ").replaceAll(".", " · ")}><span className="tabular">{v}</span></Ligne>)}</dl></div>
              )}
              {p.mesure.startsWith("esg_") && p.valeur?.extrait && (
                <blockquote className="border-l-2 border-primary-500 pl-4 text-sm leading-relaxed">
                  « {p.valeur.extrait} »<br /><span className="text-xs text-ink-muted">{p.valeur.source} — publié le {f.date(p.valeur.publie_le)}, consulté le {f.date(p.valeur.consulte_le)}. <a className="text-primary-600 underline" href={p.valeur.url} target="_blank" rel="noreferrer">Ouvrir la source</a></span>
                </blockquote>
              )}
              <div><h3 className="text-sm font-semibold">Origine et méthode</h3>
                <dl className="mt-1">
                  {p.periode && <Ligne k="Période">{f.date(p.periode.debut)} → {f.date(p.periode.fin)}</Ligne>}
                  {LIBELLES.map(([k, l]) => (p as any)[k] ? <Ligne key={k} k={l}>{String((p as any)[k])}</Ligne> : null)}
                  <Ligne k="Données sources">{p.donnees_source.join(" ; ")}</Ligne>
                  {Object.keys(p.parametres ?? {}).length > 0 && <Ligne k="Paramètres"><code className="whitespace-pre-wrap text-xs">{JSON.stringify(p.parametres, null, 1)}</code></Ligne>}
                  {p.reference && <Ligne k="Référence">{p.reference}</Ligne>}
                </dl></div>
              <p className="text-xs text-ink-muted">Catalogue des sources : docs/donnees.md (S1 kit, S2 prolongation Yahoo, S3 Banque du Canada, S4 FRED, S5 Wikipedia, S7 SSGA, S8 iShares Canada).</p>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
