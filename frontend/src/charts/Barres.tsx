import { useState } from "react";
import * as f from "../format";
import { Segmented } from "../components/motion";
import { Source } from "../components/base";

/** Horizontal bars (AEGIS style: thin, rounded, cobalt), value at the tip, a table view for every chart. */
export function Barres({ titre, donnees, limite, source, unite = "%" }: { titre: string; donnees: { cle: string; libelle: string; valeur: number }[]; limite?: number; source: string; unite?: string }) {
  const [vue, setVue] = useState<"barres" | "tableau">("barres");
  const max = Math.max(limite ?? 0, ...donnees.map((d) => d.valeur), 1);
  const val = (v: number) => (unite === "%" ? f.pct(v) : f.nombre(v));
  return (
    <figure className="m-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="font-display text-lg font-medium tracking-[-0.02em]">{titre}</figcaption>
        <Segmented size="sm" label={`Affichage : ${titre}`} value={vue} onChange={setVue} options={[["barres", "Barres"], ["tableau", "Tableau"]]} />
      </div>
      {vue === "tableau" ? (
        <table className="mt-3 w-full text-sm"><thead><tr className="text-left text-xs text-ink-muted"><th className="py-2 font-medium">Élément</th><th className="py-2 text-right font-medium">Valeur</th></tr></thead>
          <tbody>{donnees.map((d) => <tr key={d.cle} className="border-t border-line"><td className="py-2">{d.libelle}</td><td className="tabular py-2 text-right">{val(d.valeur)}</td></tr>)}</tbody></table>
      ) : (
        <ul className="mt-4 space-y-3">
          {donnees.map((d) => {
            const alerte = limite != null && d.valeur > limite;
            return (
              <li key={d.cle} className="grid grid-cols-[minmax(0,40%)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate text-ink-soft" title={d.libelle}>{d.libelle}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-ink/[0.05]" aria-hidden="true">
                  <span className={`block h-full rounded-full ${alerte ? "bg-loss-600" : "bg-primary-500"}`} style={{ width: `${(Math.max(d.valeur, 0) / max) * 100}%` }} />
                </span>
                <span className="tabular font-semibold text-ink">{val(d.valeur)}{alerte && <span className="visuellement-cache"> (au-delà de la limite)</span>}</span>
              </li>
            );
          })}
        </ul>
      )}
      {limite != null && <p className="mt-2 text-xs text-ink-muted">Ta limite : {f.pct(limite, 0)} — une barre rouge signale un dépassement (repère aussi écrit dans le tableau).</p>}
      <Source>{source}</Source>
    </figure>
  );
}
