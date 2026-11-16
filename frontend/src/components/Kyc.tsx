import { Notice, Panel } from "./ui";
import type { Kyc } from "../types";

/** « Connaître son client »: the three measures side by side, the lowest one highlighted, every rule that fired. */
export function KycResume({ kyc }: { kyc: Kyc }) {
  const mesures: [string, string, string[]][] = [
    ["tolérance", kyc.tolerance.niveau, kyc.tolerance.raisons],
    ["capacité", kyc.capacite.niveau, kyc.capacite.raisons],
    ["connaissances", kyc.connaissances.niveau, [`Quiz : ${kyc.connaissances.quiz_bonnes} bonne(s) réponse(s) sur ${kyc.connaissances.quiz_total}`]],
  ];
  return (
    <Panel>
      <h2 className="font-display text-lg font-medium tracking-[-0.02em]">Connaître son client : niveau retenu « {kyc.niveau} »</h2>
      <p className="mt-1 text-sm text-ink-muted">Trois mesures séparées ; la plus basse fixe le profil (ici : {kyc.mesure_determinante}).</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{mesures.map(([nom, niveau, raisons]) => {
        const determinante = kyc.mesure_determinante.includes(nom);
        return (
          <div key={nom} className={`rounded-2xl p-4 ${determinante ? "bg-ink text-white" : "bg-canvas"}`}>
            <p className={`text-xs font-semibold uppercase tracking-[0.08em] ${determinante ? "text-white/70" : "text-ink-muted"}`}>{nom}</p>
            <p className="mt-1 font-display text-xl font-medium">{niveau}</p>
            <ul className={`mt-2 space-y-1 text-xs leading-relaxed ${determinante ? "text-white/80" : "text-ink-soft"}`}>{raisons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>);
      })}</div>
      {kyc.tolerance.note && <Notice tone="warn" className="mt-4">{kyc.tolerance.note}</Notice>}
      {kyc.ecart && <Notice className="mt-4">{kyc.ecart}</Notice>}
      {kyc.avant_d_investir.length > 0 && <div className="mt-4">
        <h3 className="text-sm font-semibold">Avant d'investir</h3>
        <ul className="mt-2 space-y-2 text-sm text-ink-soft">{kyc.avant_d_investir.map((e) => <li key={e.type}><strong className="text-ink">{e.titre}.</strong> {e.texte}</li>)}</ul>
      </div>}
      <p className="mt-4 text-xs text-ink-muted">{kyc.cadre}</p>
    </Panel>
  );
}
