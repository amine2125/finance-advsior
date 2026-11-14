import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, sector } from "../lib/format";

export const PALETTE = ["#2dd4bf", "#818cf8", "#f472b6", "#fbbf24", "#60a5fa", "#a3e635", "#fb7185", "#c084fc", "#34d399", "#f97316", "#22d3ee", "#e879f9"];
const tt = { contentStyle: { background: "#0f172a", border: "1px solid #2a3a5f", borderRadius: 12, fontSize: 12 }, labelStyle: { color: "#cbd5e1" } };

export function AllocationDonut({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2} stroke="none">
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip {...tt} formatter={(v: any) => pct(v as number)} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SectorBars({ data, limit }: { data: Record<string, number>; limit?: number }) {
  const rows = Object.entries(data).map(([k, v]) => ({ name: sector(k), value: v })).sort((a, b) => b.value - a.value);
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 30 }}>
        <CartesianGrid horizontal={false} stroke="#1e2a47" />
        <XAxis type="number" tickFormatter={(v) => pct(v, 0)} stroke="#64748b" fontSize={11} domain={[0, 1]} />
        <YAxis type="category" dataKey="name" width={190} stroke="#94a3b8" fontSize={11} />
        <Tooltip {...tt} formatter={(v: any) => pct(v as number)} />
        {limit !== undefined && <ReferenceLine x={limit} stroke="#fb7185" strokeDasharray="4 4" label={{ value: `plafond ${pct(limit, 0)}`, fill: "#fb7185", fontSize: 10, position: "top" }} />}
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>{rows.map((r, i) => <Cell key={i} fill={r.name.startsWith("FNB") ? "#64748b" : PALETTE[i % PALETTE.length]} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CorrelationHeatmap({ assets, matrix }: { assets: string[]; matrix: (number | null)[][] }) {
  const color = (c: number | null) => {
    if (c === null || c === undefined || Number.isNaN(c)) return "#1e293b";
    if (c >= 0) return `rgba(244,63,94,${0.15 + 0.85 * c})`;
    return `rgba(56,189,248,${0.15 + 0.85 * -c})`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-[10px]">
        <thead><tr><th />{assets.map((a) => <th key={a} className="px-1 font-medium text-slate-400 [writing-mode:vertical-rl] rotate-180">{a}</th>)}</tr></thead>
        <tbody>
          {assets.map((a, i) => (
            <tr key={a}>
              <th className="pr-2 text-right font-medium text-slate-400">{a}</th>
              {matrix[i].map((c, j) => (
                <td key={j} title={`${a} / ${assets[j]} : ${c === null ? "n/d" : c.toFixed(2)}`} className="h-9 w-11 rounded-md text-center font-semibold tabular-nums text-white/90" style={{ background: color(c) }}>
                  {c === null ? "–" : c.toFixed(2).replace(".", ",")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContributionBars({ data }: { data: { name: string; weight: number; risk: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid horizontal={false} stroke="#1e2a47" />
        <XAxis type="number" tickFormatter={(v) => pct(v, 0)} stroke="#64748b" fontSize={11} />
        <YAxis type="category" dataKey="name" width={70} stroke="#94a3b8" fontSize={11} />
        <Tooltip {...tt} formatter={(v: any) => pct(v as number)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="weight" name="Poids" fill="#64748b" radius={[0, 4, 4, 0]} />
        <Bar dataKey="risk" name="Contribution au risque" fill="#fb7185" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PerformanceChart({ series, benchLabel }: { series: any[]; benchLabel?: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={series} margin={{ left: 0, right: 10 }}>
        <CartesianGrid stroke="#1e2a47" vertical={false} />
        <XAxis dataKey="date" stroke="#64748b" fontSize={10} minTickGap={50} />
        <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => v.toFixed(2)} domain={["auto", "auto"]} />
        <Tooltip {...tt} formatter={(v: any) => (typeof v === "number" ? v.toFixed(3) : v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="portfolio" name="Portefeuille (pondérations actuelles)" stroke="#2dd4bf" dot={false} strokeWidth={2} />
        {series.some((s) => s.benchmark !== undefined) && <Line type="monotone" dataKey="benchmark" name={benchLabel || "Indice de référence"} stroke="#818cf8" dot={false} strokeWidth={1.6} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({ series }: { series: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={series} margin={{ left: 0, right: 10 }}>
        <defs><linearGradient id="dd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fb7185" stopOpacity={0.05} /><stop offset="100%" stopColor="#fb7185" stopOpacity={0.5} /></linearGradient></defs>
        <CartesianGrid stroke="#1e2a47" vertical={false} />
        <XAxis dataKey="date" stroke="#64748b" fontSize={10} minTickGap={50} />
        <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => pct(v, 0)} />
        <Tooltip {...tt} formatter={(v: any) => pct(v as number)} />
        <Area type="monotone" dataKey="drawdown" name="Recul depuis le sommet" stroke="#fb7185" fill="url(#dd)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MultiLine({ data, lines, height = 260, yFmt }: { data: any[]; lines: { key: string; name: string; color?: string }[]; height?: number; yFmt?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 10 }}>
        <CartesianGrid stroke="#1e2a47" vertical={false} />
        <XAxis dataKey="date" stroke="#64748b" fontSize={10} minTickGap={50} />
        <YAxis stroke="#64748b" fontSize={10} tickFormatter={yFmt || ((v) => String(Math.round(v)))} domain={["auto", "auto"]} />
        <Tooltip {...tt} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {lines.map((l, i) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color || PALETTE[i]} dot={false} strokeWidth={1.8} connectNulls />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Gauge({ value, max = 1, label, danger = 0.25 }: { value: number; max?: number; label: string; danger?: number }) {
  const ratio = Math.min(1, value / max);
  const color = value >= danger ? "#fb7185" : value >= danger * 0.6 ? "#fbbf24" : "#34d399";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 110" className="w-44">
        <path d="M10 100 A90 90 0 0 1 190 100" fill="none" stroke="#1e2a47" strokeWidth="16" strokeLinecap="round" />
        <path d="M10 100 A90 90 0 0 1 190 100" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${ratio * 283} 283`} />
        <line x1="100" y1="100" x2={100 + 70 * Math.cos(Math.PI - ratio * Math.PI)} y2={100 - 70 * Math.sin(Math.PI - ratio * Math.PI)} stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="100" r="5" fill="#e2e8f0" />
      </svg>
      <div className="-mt-2 text-xs text-slate-400">{label}</div>
    </div>
  );
}
