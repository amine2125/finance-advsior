import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
