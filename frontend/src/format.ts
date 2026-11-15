const LOCALE = "fr-CA";
const nf = (d: number) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });

export const nombre = (x: number | null | undefined, d = 1) => (x == null || Number.isNaN(x) ? "?" : nf(d).format(x));
export const pct = (x: number | null | undefined, d = 1) => (x == null || Number.isNaN(x) ? "?" : `${nf(d).format(x)} %`);
export const cad = (x: number | null | undefined, d = 0) =>
  x == null || Number.isNaN(x) ? "?" : new Intl.NumberFormat(LOCALE, { style: "currency", currency: "CAD", maximumFractionDigits: d, minimumFractionDigits: d }).format(x);
export const devise = (x: number | null | undefined, c: string, d = 2) =>
  x == null || Number.isNaN(x) ? "?" : new Intl.NumberFormat(LOCALE, { style: "currency", currency: c, maximumFractionDigits: d, minimumFractionDigits: d }).format(x);
export const date = (iso: string | null | undefined) =>
  !iso ? "?" : new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
export const dateCourte = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
