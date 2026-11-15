import { useMemo, useRef, useState } from "react";
import { scaleLinear, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import { api } from "../api";
import { useApp } from "../state";
import * as f from "../format";
import type { Preuve } from "../types";

interface Serie { dates: string[]; local: number[]; cad: number[]; devise: string; source: string }

/** Price line (2 px), historical episodes as bands; hovering a band shows what that fall meant FOR THIS PROFILE. */
export function GraphiqueCours({ ticker, serie, titre }: { ticker: string; serie: Serie; titre: string }) {
  const { config, profil, asOf, ouvrirPreuve } = useApp();
  const [enCad, setEnCad] = useState(serie.devise !== "CAD" ? false : true);
  const [survol, setSurvol] = useState<number | null>(null);
  const [impact, setImpact] = useState<{ cle: string; p?: Preuve; err?: string } | null>(null);
  const [tableau, setTableau] = useState(false);
  const cache = useRef<Record<string, Preuve>>({});
  const W = 760, H = 280, m = { t: 12, r: 16, b: 28, l: 56 };
  const d = useMemo(() => serie.dates.map((x) => new Date(x + "T00:00:00Z")), [serie]);
  const y = enCad ? serie.cad : serie.local;
  const x = scaleUtc().domain([d[0], d[d.length - 1]]).range([m.l, W - m.r]);
  const ys = scaleLinear().domain([0, Math.max(...y) * 1.05]).nice().range([H - m.b, m.t]);
  const path = line<number>().x((_, i) => x(d[i])).y((v) => ys(v))(y) ?? "";
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
  const iSurvol = survol;
  const devise = enCad ? "CAD" : serie.devise;
  return (
    <figure className="graphique" style={{ margin: 0 }}>
      <div className="ligne entre">
        <figcaption><strong>{titre}</strong> <span className="discret">({devise}, clôtures quotidiennes)</span></figcaption>
        <div className="ligne">
          {serie.devise !== "CAD" && <button className="bouton" onClick={() => setEnCad((v) => !v)} aria-pressed={enCad}>{enCad ? "Voir en " + serie.devise : "Voir en CAD"}</button>}
          <button className="bouton" onClick={() => setTableau((v) => !v)} aria-pressed={tableau}>{tableau ? "Voir le graphique" : "Voir le tableau"}</button>
        </div>
      </div>
      {!tableau ? (
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${titre}, du ${f.date(serie.dates[0])} au ${f.date(serie.dates[serie.dates.length - 1])}`}
          onMouseLeave={() => setSurvol(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const t = x.invert(px).getTime();
            let lo = 0, hi = d.length - 1;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (d[mid].getTime() < t) lo = mid + 1; else hi = mid; }
            setSurvol(lo);
          }}>
          <g className="grille">{ys.ticks(5).map((v) => <line key={v} x1={m.l} x2={W - m.r} y1={ys(v)} y2={ys(v)} />)}</g>
          {episodes.map(([cle, e]) => {
            const x0 = x(new Date(e.debut + "T00:00:00Z")), x1 = x(new Date(e.fin + "T00:00:00Z"));
            return <rect key={cle} className="bande" x={x0} y={m.t} width={Math.max(4, x1 - x0)} height={H - m.b - m.t} tabIndex={0} role="button"
              aria-label={`${e.libelle} : voir ce que cette baisse aurait représenté pour ton portefeuille`}
              onMouseEnter={() => montrerImpact(cle, e.debut, e.fin)} onFocus={() => montrerImpact(cle, e.debut, e.fin)}
              onClick={() => montrerImpact(cle, e.debut, e.fin)}
              onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); montrerImpact(cle, e.debut, e.fin); } }} />;
          })}
          <path d={path} fill="none" stroke="var(--serie-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <g className="axe">
            {ys.ticks(5).map((v) => <text key={v} x={m.l - 8} y={ys(v) + 4} textAnchor="end">{v === 0 ? "0" : f.nombre(v, v < 10 ? 1 : 0)}</text>)}
            {x.ticks(6).map((tk) => <text key={tk.toISOString()} x={x(tk)} y={H - 8} textAnchor="middle">{f.dateCourte(tk.toISOString().slice(0, 10))}</text>)}
          </g>
          {iSurvol != null && (
            <g pointerEvents="none">
              <line x1={x(d[iSurvol])} x2={x(d[iSurvol])} y1={m.t} y2={H - m.b} stroke="var(--attenue)" strokeWidth={1} />
              <circle cx={x(d[iSurvol])} cy={ys(y[iSurvol])} r={4} fill="var(--serie-1)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
      ) : (
        <div style={{ maxHeight: 280, overflow: "auto" }}>
          <table className="donnees"><thead><tr><th>Date</th><th className="n">Clôture ({devise})</th></tr></thead>
            <tbody>{serie.dates.slice().reverse().slice(0, 120).map((dt, i) => <tr key={dt}><td>{f.date(dt)}</td><td className="n">{f.nombre(y[y.length - 1 - i], 2)}</td></tr>)}</tbody></table>
        </div>
      )}
      <div aria-live="polite" style={{ minHeight: 48 }}>
        {iSurvol != null && !tableau && <p className="discret num">{f.date(serie.dates[iSurvol])} : {f.devise(y[iSurvol], devise)}</p>}
        {impact && (impact.p ? (
          <p className="panneau" style={{ marginTop: 8 }}>
            <strong>Pour toi, {config?.episodes[impact.cle]?.libelle} :</strong> {ticker} a baissé de <button className="prouve" onClick={() => ouvrirPreuve(impact.p!)}>{f.pct(impact.p.valeur.baisse_pct)}</button>.
            {" "}{impact.p.valeur.position_hypothetique ? "Pour une position de référence de 5 % de ton portefeuille" : `Avec ton exposition actuelle (${f.pct(impact.p.valeur.exposition_pct)}, FNB compris)`}, cela aurait représenté
            {" "}<button className="prouve" onClick={() => ouvrirPreuve(impact.p!)}>{f.cad(impact.p.valeur.impact_cad)}</button>
            {" "}(soit {f.pct(impact.p.valeur.impact_pct_portefeuille)} du portefeuille{impact.p.valeur.impact_pct_objectif != null ? `, ${f.pct(impact.p.valeur.impact_pct_objectif)} de ton objectif « ${impact.p.valeur.objectif} »` : ""}). Fait passé, pas une prévision.
          </p>) : impact.err ? <p className="discret">{impact.err}</p> : <p className="discret">Calcul de l'impact pour ton profil…</p>)}
      </div>
      <p className="source">Source : {serie.source}. Bandes : épisodes historiques ; survole ou sélectionne une bande au clavier.</p>
    </figure>
  );
}
