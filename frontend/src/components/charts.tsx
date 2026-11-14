import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, sector } from "../lib/format";

// Validated categorical palette (dataviz reference, light mode), assigned in fixed order – never cycled by rank.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const INK = { primary: "#0f172a", secondary: "#475569", muted: "#94a3b8", grid: "#eef2f6" };
const tooltip = {
  contentStyle: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12, boxShadow: "0 8px 24px -8px rgba(16,24,40,.14)" },
  labelStyle: { color: INK.secondary, marginBottom: 4 },
  itemStyle: { color: INK.primary },
};

/** Allocation as a single 100 % bar + legend list: easier to read than a donut, values always labelled. */
export function AllocationBar({ items }: { items: { id: string; label: string; weight: number }[] }) {
  const top = items.slice(0, 7);
  const rest = items.slice(7).reduce((s, x) => s + x.weight, 0);
  const rows = rest > 0 ? [...top, { id: "_other", label: "Autres", weight: rest }] : top;
  return (
    <div>
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full">
        {rows.map((r, i) => (
          <div key={r.id} title={`${r.label} : ${pct(r.weight)}`} style={{ width: `${r.weight * 100}%`, background: r.id === "_other" ? "#cbd5e1" : SERIES[i] }} className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.id === "_other" ? "#cbd5e1" : SERIES[i] }} /><span className="truncate text-slate-700">{r.label}</span></span>
            <span className="whitespace-nowrap font-medium tabular-nums text-slate-900">{pct(r.weight)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars with the user's own limit drawn as a marker. Status colour only when the limit is exceeded. */
export function LimitBars({ data, limit, limitLabel }: { data: Record<string, number>; limit?: number; limitLabel?: string }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1e-9, ...rows.map(([, v]) => v), limit || 0);
  return (
    <div className="space-y-3">
      {rows.map(([k, v]) => {
        const over = limit !== undefined && v > limit;
        return (
          <div key={k}>
            <div className="mb-1 flex justify-between text-sm"><span className="text-slate-700">{sector(k)}</span><span className="font-medium tabular-nums text-slate-900">{pct(v)}</span></div>
            <div className="relative h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full" style={{ width: `${(v / max) * 100}%`, background: over ? "#e11d48" : SERIES[0] }} />
              {limit !== undefined && <div className="absolute -top-1 h-4 w-0.5 bg-slate-500" style={{ left: `${(limit / max) * 100}%` }} title={limitLabel} />}
            </div>
          </div>
        );
      })}
      {limit !== undefined && <p className="text-xs text-slate-500">Le trait vertical marque votre limite : {limitLabel}.</p>}
    </div>
  );
}

const tickDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-CA", { month: "short", year: "2-digit" });

/** Growth of 1 $ for the portfolio vs its comparison index (same scale: both indexed to 1). */
export function GrowthChart({ series, benchmarkLabel }: { series: { date: string; portfolio: number; benchmark?: number | null }[]; benchmarkLabel?: string }) {
  const hasB = series.some((s) => s.benchmark != null);
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={INK.grid} />
          <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={48} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => `${(v as number).toFixed(2)} $`} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} width={56} domain={["auto", "auto"]} />
          <Tooltip {...tooltip} labelFormatter={(d) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-CA", { dateStyle: "medium" })}
            formatter={(v: any, n: any) => [`${(v as number).toFixed(2)} $`, n === "portfolio" ? "Votre portefeuille" : "Indice de comparaison"]} />
          <Line type="monotone" dataKey="portfolio" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          {hasB && <Line type="monotone" dataKey="benchmark" stroke={SERIES[1]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: SERIES[0] }} /> Votre portefeuille (pondérations actuelles)</span>
        {hasB && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: SERIES[1] }} /> {benchmarkLabel || "Indice de comparaison"}</span>}
      </div>
    </div>
  );
}

/** Drawdown (distance from the previous peak). Single series: no legend, the title names it. */
export function DrawdownChart({ series }: { series: { date: string; drawdown: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={48} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => pct(v as number, 0)} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} width={48} />
        <Tooltip {...tooltip} labelFormatter={(d) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-CA", { dateStyle: "medium" })} formatter={(v: any) => [pct(v as number), "Baisse depuis le sommet"]} />
        <Area type="monotone" dataKey="drawdown" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.12} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Simple price line for an asset (single series). */
export function PriceChart({ series, currency }: { series: { date: string; close: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={series} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={48} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} width={56} domain={["auto", "auto"]} />
        <Tooltip {...tooltip} labelFormatter={(d) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-CA", { dateStyle: "medium" })} formatter={(v: any) => [`${(v as number).toFixed(2)} ${currency}`, "Cours de clôture"]} />
        <Line type="monotone" dataKey="close" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Replay value path (single series). */
export function ValueChart({ series }: { series: { date: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={series} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={INK.grid} />
        <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={40} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v) => `${Math.round(v as number).toLocaleString("fr-CA")} $`} stroke={INK.muted} fontSize={11} tickLine={false} axisLine={false} width={70} domain={["auto", "auto"]} />
        <Tooltip {...tooltip} labelFormatter={(d) => new Date(d + "T12:00:00Z").toLocaleDateString("fr-CA", { dateStyle: "medium" })} formatter={(v: any) => [`${Math.round(v as number).toLocaleString("fr-CA")} $`, "Valeur simulée"]} />
        <Area type="monotone" dataKey="value" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.1} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
