import { fr, type Cle } from "./fr";
import { en } from "./en";

export type Langue = "fr" | "en";
export function traduire(langue: Langue, cle: Cle, vars?: Record<string, string>): string {
  let s: string = (langue === "en" ? en[cle] : undefined) ?? fr[cle];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
