import { useMemo, useRef, useState } from "react";
import { scaleLinear, scaleUtc } from "d3-scale";
import { area, line } from "d3-shape";
import { api } from "../api";
import { Segmented } from "../components/motion";
import { Source } from "../components/base";
import { useApp } from "../state";
import * as f from "../format";
import type { Preuve } from "../types";

interface Serie { dates: string[]; local: number[]; cad: number[]; devise: string; source: string }
const C = { ligne: "#3350ff", texte: "#76736c", grille: "rgba(21,20,19,0.06)", bande: "rgba(229,154,0,0.12)", bandeActive: "rgba(229,154,0,0.24)" };

/** Price as a cobalt area (AEGIS look); historical episodes as bands — hovering a band shows what that fall meant FOR THIS PROFILE. */
export function GraphiqueCours({ ticker, serie, titre }: { ticker: string; serie: Serie; titre: string }) {
  const { config, profil, asOf, ouvrirPreuve } = useApp();
  const [enCad, setEnCad] = useState(serie.devise === "CAD");
  const [survol, setSurvol] = useState<number | null>(null);
  const [impact, setImpact] = useState<{ cle: string; p?: Preuve; err?: string } | null>(null);
  const [vue, setVue] = useState<"graphique" | "tableau">("graphique");
  const cache = useRef<Record<string, Preuve>>({});
  const W = 760, H = 280, m = { t: 12, r: 60, b: 28, l: 8 };
  const d = useMemo(() => serie.dates.map((x) => new Date(x + "T00:00:00Z")), [serie]);
  const y = enCad ? serie.cad : serie.local;
  const x = scaleUtc().domain([d[0], d[d.length - 1]]).range([m.l, W - m.r]);
  const ys = scaleLinear().domain([Math.min(...y) * 0.95, Math.max(...y) * 1.05]).nice().range([H - m.b, m.t]);
  const chemin = line<number>().x((_, i) => x(d[i])).y((v) => ys(v))(y) ?? "";
  const aire = area<number>().x((_, i) => x(d[i])).y0(H - m.b).y1((v) => ys(v))(y) ?? "";
  const episodes = Object.entries(config?.episodes ?? {}).filter(([, e]) => e.fin <= asOf && e.debut >= serie.dates[0]);
  const montrerImpact = async (cle: string, debut: string, fin: string) => {
    const k = `${profil}|${ticker}|${cle}|${asOf}`;
    if (cache.current[k]) { setImpact({ cle, p: cache.current[k] }); return; }
    setImpact({ cle });
    try {
      const p = await api<Preuve>(`/marche/${encodeURIComponent(ticker)}/impact`, { params: { profil, as_of: asOf, debut, fin } });
      cache.current[k] = p; setImpact({ cle, p });
    } catch (e) { setImpact({ cle, err: (e as Error).message }); }
  };
  const devise = enCad ? "CAD" : serie.devise;
  return (
    <figure className="m-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption><span className="font-display text-lg font-medium tracking-[-0.02em]">{titre}</span> <span className="text-sm text-ink-muted">({devise}, clôtures quotidiennes)</span></figcaption>
        <div className="flex flex-wrap gap-2">
          {serie.devise !== "CAD" && <Segmented size="sm" label="Devise" value={enCad ? "CAD" : serie.devise} onChange={(v) => setEnCad(v === "CAD")} options={[[serie.devise, serie.devise], ["CAD", "CAD"]]} />}
          <Segmented size="sm" label="Affichage du cours" value={vue} onChange={setVue} options={[["graphique", "Graphique"], ["tableau", "Tableau"]]} />
        </div>
      </div>
      {vue === "graphique" ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="group" aria-label={`${titre}, du ${f.date(serie.dates[0])} au ${f.date(serie.dates[serie.dates.length - 1])}`}
          onMouseLeave={() => setSurvol(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const t = x.invert(((e.clientX - r.left) / r.width) * W).getTime();
            let lo = 0, hi = d.length - 1;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (d[mid].getTime() < t) lo = mid + 1; else hi = mid; }
            setSurvol(lo);
          }}>
          <defs><linearGradient id="aire-cours" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.ligne} stopOpacity={0.2} /><stop offset="100%" stopColor={C.ligne} stopOpacity={0} /></linearGradient></defs>
          {ys.ticks(4).map((v) => <line key={v} x1={m.l} x2={W - m.r} y1={ys(v)} y2={ys(v)} stroke={C.grille} />)}
          {episodes.map(([cle, e]) => {
            const x0 = x(new Date(e.debut + "T00:00:00Z")), x1 = x(new Date(e.fin + "T00:00:00Z"));
            return <rect key={cle} x={x0} y={m.t} width={Math.max(4, x1 - x0)} height={H - m.b - m.t} rx={4} tabIndex={0} role="button" style={{ cursor: "pointer", outline: "none" }}
              fill={impact?.cle === cle ? C.bandeActive : C.bande}
              aria-label={`${e.libelle} : voir ce que cette baisse aurait représenté pour ton portefeuille`}
              onMouseEnter={() => montrerImpact(cle, e.debut, e.fin)} onFocus={() => montrerImpact(cle, e.debut, e.fin)} onClick={() => montrerImpact(cle, e.debut, e.fin)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); montrerImpact(cle, e.debut, e.fin); } }} />;
          })}
          <path d={aire} fill="url(#aire-cours)" />
          <path d={chemin} fill="none" stroke={C.ligne} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {ys.ticks(4).map((v) => <text key={v} x={W - m.r + 8} y={ys(v) + 4} fontSize={11} fill={C.texte}>{f.nombre(v, v < 10 ? 1 : 0)}</text>)}
          {x.ticks(6).map((tk) => <text key={tk.toISOString()} x={x(tk)} y={H - 8} textAnchor="middle" fontSize={11} fill={C.texte}>{f.dateCourte(tk.toISOString().slice(0, 10))}</text>)}
          {survol != null && (
            <g pointerEvents="none">
              <line x1={x(d[survol])} x2={x(d[survol])} y1={m.t} y2={H - m.b} stroke="#151413" strokeDasharray="3 3" strokeWidth={1} />
              <circle cx={x(d[survol])} cy={ys(y[survol])} r={4} fill={C.ligne} stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
      ) : (
        <div className="mt-3 max-h-[280px] overflow-auto">
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-ink-muted"><th className="py-2 font-medium">Date</th><th className="py-2 text-right font-medium">Clôture ({devise})</th></tr></thead>
            <tbody>{serie.dates.slice().reverse().slice(0, 120).map((dt, i) => <tr key={dt} className="border-t border-line"><td className="py-1.5">{f.date(dt)}</td><td className="tabular py-1.5 text-right">{f.nombre(y[y.length - 1 - i], 2)}</td></tr>)}</tbody></table>
        </div>
      )}
      <div aria-live="polite" className="min-h-[48px]">
        {survol != null && vue === "graphique" && <p className="tabular text-sm text-ink-soft">{f.date(serie.dates[survol])} : <b className="text-ink">{f.devise(y[survol], devise)}</b></p>}
        {impact && (impact.p ? (
          <p className="mt-2 rounded-2xl bg-warn-50 p-4 text-sm leading-relaxed text-ink">
            <strong>Pour toi, {config?.episodes[impact.cle]?.libelle} :</strong> {ticker} a baissé de <button className="prouve" onClick={() => ouvrirPreuve(impact.p!)}>{f.pct(impact.p.valeur.baisse_pct)}</button>.
            {" "}{impact.p.valeur.position_hypothetique ? "Pour une position de référence de 5 % de ton portefeuille" : `Avec ton exposition actuelle (${f.pct(impact.p.valeur.exposition_pct)}, FNB compris)`}, cela aurait représenté
            {" "}<button className="prouve" onClick={() => ouvrirPreuve(impact.p!)}>{f.cad(impact.p.valeur.impact_cad)}</button>
            {" "}(soit {f.pct(impact.p.valeur.impact_pct_portefeuille)} du portefeuille{impact.p.valeur.impact_pct_objectif != null ? `, ${f.pct(impact.p.valeur.impact_pct_objectif)} de ton objectif « ${impact.p.valeur.objectif} »` : ""}). Fait passé, pas une prévision.
          </p>) : impact.err ? <p className="mt-2 text-sm text-ink-muted">{impact.err}</p> : <p className="mt-2 text-sm text-ink-muted">Calcul de l'impact pour ton profil…</p>)}
      </div>
      <Source>{serie.source}. Bandes ambre : épisodes historiques ; survole ou sélectionne une bande au clavier.</Source>
    </figure>
  );
}
