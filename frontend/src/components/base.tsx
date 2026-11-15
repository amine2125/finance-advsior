import { useState, useId, type ReactNode } from "react";
import { useApp } from "../state";
import type { Niveau, Preuve, Statut } from "../types";

const ICONES: Record<Niveau, string> = { ok: "✅", attention: "⚠", pause: "⛔", aucun: "–" };

export function PuceNiveau({ niveau, texte }: { niveau: Niveau; texte?: string }) {
  const { t } = useApp();
  return <span className={`puce ${niveau}`}><span className="ic" aria-hidden="true">{ICONES[niveau]}</span>{texte ?? t(`niveau.${niveau}`)}</span>;
}

const CLASSE_STATUT: Record<Statut, Niveau | "inconnu"> = { respectee: "ok", approchee: "attention", depassee: "pause", donnees_insuffisantes: "inconnu" as any, non_applicable: "aucun" };
const ICONE_STATUT: Record<Statut, string> = { respectee: "✓", approchee: "◐", depassee: "✕", donnees_insuffisantes: "?", non_applicable: "–" };
export function PuceStatut({ statut }: { statut: Statut }) {
  const { t } = useApp();
  return <span className={`puce ${CLASSE_STATUT[statut]}`}><span className="ic" aria-hidden="true">{ICONE_STATUT[statut]}</span>{t(`statut.${statut}`)}</span>;
}

const FORMES: Record<string, string> = { MESURE: "●", DOCUMENTE: "▤", HYPOTHESE: "◌", INCERTAIN: "?" };
export function Etiquette({ e }: { e: string }) {
  const { t } = useApp();
  return <span className="etiquette"><span aria-hidden="true">{FORMES[e] ?? "•"}</span>{t(`etiquette.${e}` as any)}</span>;
}

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
    <span className="porteur-terme" onMouseEnter={() => setVu(true)} onMouseLeave={() => setVu(false)}>
      <span className="terme" tabIndex={0} aria-describedby={id} onFocus={() => setVu(true)} onBlur={() => setVu(false)}>{children}</span>
      <span id={id} role="tooltip" className="infobulle" hidden={!vu} style={{ left: 0, top: "1.6em" }}>
        <strong>{g.terme}</strong> : {g.definition}
      </span>
    </span>
  );
}

export function Chargement({ lignes = 3 }: { lignes?: number }) {
  const { t } = useApp();
  return <div aria-busy="true" aria-live="polite"><span className="visuellement-cache">{t("chargement")}</span>
    {Array.from({ length: lignes }).map((_, i) => <div key={i} className="squelette" style={{ width: `${90 - i * 15}%`, margin: "10px 0", height: 18 }} />)}</div>;
}

export function Erreur({ message, recharger }: { message: string; recharger?: () => void }) {
  const { t } = useApp();
  return <div className="erreur" role="alert"><strong>{t("erreur.generique")}</strong> {message}{" "}
    {recharger && <button className="bouton lien" onClick={recharger}>{t("action.reessayer")}</button>}</div>;
}

export function Vide({ children }: { children: ReactNode }) { return <div className="vide">{children}</div>; }

export function Source({ children }: { children: ReactNode }) { return <p className="source">Source : {children}</p>; }
