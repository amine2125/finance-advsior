import { Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct } from "../lib/format";

// Categorical palette (validated with the dataviz validator, light mode): BNC blue first, then the reference hues.
// Assigned in fixed order to entities, never by rank.
export const SERIES = ["#1572c5", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6", "#008300"];
const INK = { primary: "#1f2a33", secondary: "#565656", muted: "#7a858c", grid: "#eef1f3" };
const tooltip = {
  contentStyle: { background: "#fff", border: "1px solid #e1e4e6", borderRadius: 12, fontSize: 12, boxShadow: "0 12px 32px -12px rgba(0,49,77,.28)" },
  labelStyle: { color: INK.secondary, marginBottom: 4 },
  itemStyle: { color: INK.primary },
};
const fullDate = (d: any) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-CA", { dateStyle: "medium" });
const tickDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-CA", { month: "short", year: "2-digit" });
const money = (v: number) => `${Math.round(v).toLocaleString("fr-CA")} $`;

export type Slice = { id: string; label: string; value: number; color: string };

/** 100 % bar split in segments (2px gaps), with a legend that always carries the values. */
export function SplitBar({ slices, height = 14, legend = true }: { slices: Slice[]; height?: number; legend?: boolean }) {
  const shown = slices.filter((s) => s.value > 0.0005);
  return (
    <div>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-full bg-white" style={{ height }}>
        {shown.map((s) => (
          <div key={s.id} title={`${s.label} : ${pct(s.value, 0)}`} style={{ width: `${s.value * 100}%`, background: s.color }} className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      {legend && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {shown.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="text-ink-soft">{s.label}</span>
              <span className="tabular font-semibold text-ink">{pct(s.value, 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Where a share sits against the band the profile allows (e.g. growth share 100 % vs 10–30 %). */
export function BandGauge({ value, min, max, label }: { value: number; min: number; max: number; label: string }) {
  const inside = value >= min - 1e-9 && value <= max + 1e-9;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular text-ink-soft"><b className="text-ink">{pct(value, 0)}</b> · votre profil : {pct(min, 0)} à {pct(max, 0)}</span>
      </div>
      <div className="relative h-3 rounded-full bg-canvas">
        <div className="absolute inset-y-0 rounded-full bg-gain-50 ring-1 ring-gain-600" style={{ left: `${min * 100}%`, width: `${Math.max(0.5, (max - min) * 100)}%` }} title="Zone prévue par votre profil" />
        <div className="absolute -top-1 h-5 w-1.5 -translate-x-1/2 rounded-full ring-2 ring-white" style={{ left: `${Math.min(100, Math.max(0, value * 100))}%`, background: inside ? "#00314d" : "#c4161c" }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-muted"><span>0 %</span><span>100 %</span></div>
    </div>
  );
}

/** Value over time (single series: the title names it). Gold area, Wealthsimple-like: no grid, light axis. */
export function ValueChart({ series, height = 220, compact, color = "#3350ff" }: { series: { date: string; value: number }[]; height?: number; compact?: boolean; color?: string }) {
  const id = "vfill" + color.replace("#", "");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={80} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} hide={compact} />
        <YAxis orientation="right" tickFormatter={(v) => `${Math.round((v as number) / (Math.abs(v as number) >= 10000 ? 1000 : 1)).toLocaleString("fr-CA")}${Math.abs(v as number) >= 10000 ? " k" : ""} $`}
          stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} width={64} domain={["auto", "auto"]} hide={compact} tickCount={4} />
        <Tooltip {...tooltip} cursor={{ stroke: "#1a1a19", strokeWidth: 1, strokeDasharray: "3 3" }} labelFormatter={fullDate} formatter={(v: any) => [money(v as number), "Valeur"]} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: color }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Portfolio vs comparison index, both scaled to the same starting amount (one axis, same units). */
export function GrowthChart({ series, amount, benchmarkLabel }: { series: { date: string; portfolio: number; benchmark?: number | null }[]; amount: number; benchmarkLabel?: string }) {
  const data = series.map((s) => ({ date: s.date, portfolio: s.portfolio * amount, benchmark: s.benchmark != null ? s.benchmark * amount : null }));
  const hasB = data.some((s) => s.benchmark != null);
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={56} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => money(v as number)} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} width={72} domain={["auto", "auto"]} />
          <Tooltip {...tooltip} labelFormatter={fullDate} formatter={(v: any, n: any) => [money(v as number), n === "portfolio" ? "Vos placements" : "Portefeuille type de votre profil"]} />
          <Line type="monotone" dataKey="portfolio" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
          {hasB && <Line type="monotone" dataKey="benchmark" stroke={SERIES[1]} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES[0] }} /> Vos placements</span>
        {hasB && <span className="flex items-center gap-1.5" title={benchmarkLabel}><span className="h-0.5 w-4 rounded" style={{ background: SERIES[1] }} /> Portefeuille type de votre profil</span>}
      </div>
    </div>
  );
}

/** Price line for one investment (single series). */
export function PriceChart({ series, currency }: { series: { date: string; close: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={series} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
        <defs>
          <linearGradient id="pfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.16} />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={56} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} width={56} domain={["auto", "auto"]} />
        <Tooltip {...tooltip} labelFormatter={fullDate} formatter={(v: any) => [`${(v as number).toFixed(2)} ${currency}`, "Cours de clôture"]} />
        <Area type="monotone" dataKey="close" stroke={SERIES[0]} strokeWidth={2} fill="url(#pfill)" activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Goal projection: median path, 10–90 % range of simulated paths, money paid in, and the target (one axis, $). */
export function ProjectionChart({ points, target, height = 260 }: { points: { year: number; p10: number; p50: number; p90: number; contributed: number }[]; target?: number | null; height?: number }) {
  const data = points.map((p) => ({ ...p, band: [p.p10, p.p90] }));
  const label = (y: number) => (y === 0 ? "Aujourd'hui" : `${Math.round(y * 10) / 10} an${y >= 2 ? "s" : ""}`);
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 12, right: 8, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="year" tickFormatter={label} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v) => money(v as number)} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} width={80} />
          <Tooltip {...tooltip} labelFormatter={(y) => label(y as number)}
            formatter={(v: any, n: any) => n === "band" ? [`${money(v[0])} à ${money(v[1])}`, "Fourchette (8 scénarios sur 10)"] : [money(v as number), n === "p50" ? "Scénario médian" : "Ce que vous aurez versé"]} />
          <Area dataKey="band" stroke="none" fill={SERIES[0]} fillOpacity={0.14} isAnimationActive={false} />
          <Line dataKey="contributed" stroke={INK.muted} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          <Line dataKey="p50" stroke={SERIES[0]} strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
          {target ? <ReferenceLine y={target} stroke="#00314d" strokeDasharray="6 4" label={{ value: `Objectif ${money(target)}`, position: "insideTopLeft", fill: "#00314d", fontSize: 11, fontWeight: 700 }} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES[0] }} /> Scénario médian</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: SERIES[0], opacity: 0.2 }} /> Fourchette (8 scénarios sur 10)</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: INK.muted }} /> Ce que vous aurez versé</span>
        {target ? <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-brand-800" /> Votre objectif</span> : null}
      </div>
    </div>
  );
}
