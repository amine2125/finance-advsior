import clsx from "clsx";
import { useId, useState, type ReactNode } from "react";
import { useApp } from "../state";
import type { Niveau, Preuve, Statut } from "../types";
import { Notice, TextButton } from "./ui";

/* ULYSSE semantics (signal levels, rule statuses, sentence labels, evidence) drawn with the AEGIS visual system.
   Every level carries an icon AND a word: readable without colour. */

const NIVEAU_CLS: Record<Niveau | "inconnu", string> = {
  ok: "bg-gain-50 text-gain-700 ring-gain-100", attention: "bg-warn-50 text-warn-700 ring-warn-100",
  pause: "bg-loss-50 text-loss-700 ring-loss-100", aucun: "bg-ink/[0.04] text-ink-soft ring-transparent", inconnu: "bg-ink/[0.04] text-ink-soft ring-transparent",
};
const ICONES: Record<Niveau, string> = { ok: "✓", attention: "⚠", pause: "⛔", aucun: "–" };

function Chip({ cls, icon, children }: { cls: string; icon: string; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", cls)}>
    <span aria-hidden="true">{icon}</span>{children}</span>;
}

export function PuceNiveau({ niveau, texte }: { niveau: Niveau; texte?: string }) {
  const { t } = useApp();
  return <Chip cls={NIVEAU_CLS[niveau]} icon={ICONES[niveau]}>{texte ?? t(`niveau.${niveau}`)}</Chip>;
}

const CLASSE_STATUT: Record<Statut, Niveau | "inconnu"> = { respectee: "ok", approchee: "attention", depassee: "pause", donnees_insuffisantes: "inconnu", non_applicable: "aucun" };
const ICONE_STATUT: Record<Statut, string> = { respectee: "✓", approchee: "◐", depassee: "✕", donnees_insuffisantes: "?", non_applicable: "–" };
export function PuceStatut({ statut }: { statut: Statut }) {
  const { t } = useApp();
  return <Chip cls={NIVEAU_CLS[CLASSE_STATUT[statut]]} icon={ICONE_STATUT[statut]}>{t(`statut.${statut}`)}</Chip>;
}

const FORMES: Record<string, string> = { MESURE: "●", DOCUMENTE: "▤", HYPOTHESE: "◌", INCERTAIN: "?" };
export function Etiquette({ e }: { e: string }) {
  const { t } = useApp();
  return <span className="mr-2 inline-flex items-center gap-1 rounded-md bg-ink/[0.05] px-1.5 py-0.5 align-[2px] text-[10px] font-semibold tracking-[0.06em] text-ink-soft">
    <span aria-hidden="true">{FORMES[e] ?? "•"}</span>{t(`etiquette.${e}` as any)}</span>;
}

/** A number backed by an evidence object: dotted underline, opens the evidence drawer. */
export function Prouve({ preuve, children }: { preuve?: Preuve | null; children: ReactNode }) {
  const { ouvrirPreuve } = useApp();
  if (!preuve) return <>{children}</>;
  return <button type="button" className="prouve" onClick={() => ouvrirPreuve(preuve)}>{children}<span className="visuellement-cache"> (voir la preuve : {preuve.libelle})</span></button>;
}

export function Terme({ cle, children }: { cle: string; children: ReactNode }) {
  const { glossaire } = useApp();
  const [vu, setVu] = useState(false);
  const id = useId();
  const g = glossaire[cle];
  if (!g) return <>{children}</>;
  return (
    <span className="relative" onMouseEnter={() => setVu(true)} onMouseLeave={() => setVu(false)}>
      <span className="terme" tabIndex={0} aria-describedby={id} onFocus={() => setVu(true)} onBlur={() => setVu(false)}>{children}</span>
      <span id={id} role="tooltip" hidden={!vu}
        className="absolute left-0 top-[1.7em] z-40 w-72 rounded-xl bg-ink p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-white shadow-lift">
        <strong>{g.terme}</strong> : {g.definition}
      </span>
    </span>
  );
}

export function Chargement({ lignes = 3 }: { lignes?: number }) {
  const { t } = useApp();
  return <div aria-busy="true" aria-live="polite" className="py-2"><span className="visuellement-cache">{t("chargement")}</span>
    {Array.from({ length: lignes }).map((_, i) => <div key={i} className="squelette my-3 h-5" style={{ width: `${90 - i * 14}%` }} />)}</div>;
}

export function Erreur({ message, recharger }: { message: string; recharger?: () => void }) {
  const { t } = useApp();
  return <Notice tone="bad" role="alert" title={t("erreur.generique")}>{message}{" "}
    {recharger && <TextButton onClick={recharger} className="text-loss-700">{t("action.reessayer")}</TextButton>}</Notice>;
}

export function Vide({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-ink/15 px-6 py-10 text-center text-sm text-ink-soft">{children}</div>;
}

export function Source({ children }: { children: ReactNode }) { return <p className="mt-3 text-xs leading-relaxed text-ink-muted">Source : {children}</p>; }

/** Small grey note (method, period, provenance). */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("mt-3 text-xs leading-relaxed text-ink-muted", className)}>{children}</p>;
}
