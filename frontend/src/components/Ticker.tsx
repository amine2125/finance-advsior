import clsx from "clsx";

// Deterministic coloured disc with the symbol, like a brokerage app (no third-party logos).
const COLORS = ["#1d1d1b", "#c4161c", "#1572c5", "#0f7b5f", "#7a4fc4", "#c26a0a", "#2f6f8f", "#8a6d3b"];
export function TickerLogo({ id, size = 40 }: { id: string; size?: number }) {
  const base = id.replace(/[-.].*$/, "");
  const h = [...base].reduce((a, c) => a + c.charCodeAt(0), 0);
  const label = id.startsWith("BTC") ? "₿" : id.startsWith("ETH") ? "Ξ" : base.slice(0, base.length > 3 ? 2 : 3);
  return (
    <span className={clsx("grid shrink-0 place-items-center rounded-full font-semibold text-white")}
      style={{ width: size, height: size, background: COLORS[h % COLORS.length], fontSize: label.length > 2 ? size * 0.27 : size * 0.34 }}>
      {label}
    </span>
  );
}

export const sym = (id: string) => id.replace(/\.TO$/, "");
