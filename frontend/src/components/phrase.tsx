import type { ReactElement } from "react";
import type { Preuve } from "../types";
import { Etiquette } from "./base";

const NUM = /[-−]?\d{1,3}(?:[\s  ]\d{3})+(?:,\d+)?|[-−]?\d+(?:,\d+)?/g;

/** One verified sentence: its label, every number clickable to the evidence it comes from, then the evidence links. */
export function Phrase({ texte, etiquette, ids, preuves, ouvrir, className }: { texte: string; etiquette: string; ids: string[]; preuves: Record<string, Preuve>; ouvrir: (p: Preuve) => void; className?: string }) {
  const cites = ids.map((i) => preuves[i]).filter(Boolean);
  const parts: (string | ReactElement)[] = [];
  let last = 0;
  for (const m of texte.matchAll(NUM)) {
    const idx = m.index ?? 0;
    if (/\d{4}-\d{2}-\d{2}/.test(texte.slice(Math.max(0, idx - 5), idx + 10))) continue;
    if (/[A-Za-z]$/.test(texte.slice(0, idx))) continue;           // rule names such as P1, A2
    if (/^(19|20)\d\d$/.test(m[0])) continue;                       // a year in a label, not a measured number
    parts.push(texte.slice(last, idx));
    const tok = m[0];
    const cible = cites.find((p) => Object.values(p.affichage ?? {}).some((v) => v.includes(tok.replace(/\s/g, " ")) || v.replace(/\s/g, "").includes(tok.replace(/\s/g, "")))) ?? cites[0];
    parts.push(cible ? <button key={idx} type="button" className="prouve" onClick={() => ouvrir(cible)}>{tok}<span className="visuellement-cache"> (voir la preuve)</span></button> : tok);
    last = idx + tok.length;
  }
  parts.push(texte.slice(last));
  return <p className={className ?? "leading-relaxed"}><Etiquette e={etiquette} />{parts}{" "}
    {cites.length > 0 && <span className="whitespace-nowrap text-xs text-ink-muted">[{cites.map((p, i) => <button key={p.id} type="button" className="mx-0.5 text-primary-600 hover:underline" onClick={() => ouvrir(p)}>preuve {i + 1}</button>)}]</span>}</p>;
}
