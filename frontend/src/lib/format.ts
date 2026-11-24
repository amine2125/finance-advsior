/** Formatting (fr-CA). `pct` takes a FRACTION (0.12 → « 12 % »); the engine's values in percent are divided by 100 first. */
export const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "n/d" : `${(v * 100).toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
export const cad = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "n/d" : `${v.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d })} $`;
export const date = (s?: string | null) => (s ? new Date(s.length <= 10 ? s + "T12:00:00Z" : s).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "n/d");
/** A price in its own currency: « 289,39 $ CA », « 182,10 $ US ». */
export const money = (v: number | null | undefined, currency = "CAD", d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "n/d" : `${v.toLocaleString("fr-CA", { minimumFractionDigits: d, maximumFractionDigits: d })} $${currency === "CAD" ? "" : currency === "USD" ? " US" : ` ${currency}`}`;
