import clsx from "clsx";
import { motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Chargement, Erreur, Note, PuceNiveau, PuceStatut } from "../components/base";
import { Stagger, StaggerItem, spring } from "../components/motion";
import { Phrase } from "../components/phrase";
import { Hero, Notice, Panel, Section } from "../components/ui";
import * as f from "../format";
import { useApp } from "../state";
import type { Preuve, Signal } from "../types";

const ETAPES: Record<string, string> = { donnees: "Données", constats: "Constats", analyse: "Analyse", options: "Options", explication: "Explication" };
const NOMS: Record<string, [string, string]> = {
  contexte: ["Contexte", "code"], planification: ["Planification", "LLM, validé par le code"], outils: ["Outils d'analyse", "code"], gouvernance: ["Gouvernance", "code"],
  signal: ["Politique de signal", "code"], debat: ["Débat Pour / Contre", "LLM, vérifié par le code"], redaction: ["Rédaction", "LLM"], verification: ["Vérification", "code"], publication: ["Publication", "code"],
};

export function DossierPage() {
  const { id = "" } = useParams();
  const { profil, ouvrirPreuve } = useApp();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try { const x = await api<any>(`/dossiers/${id}`); if (stop) return; setD(x); if (x.etat === "en_cours") window.setTimeout(tick, 400); }
      catch (e) { if (!stop) setErr((e as Error).message); }
    };
    tick();
    return () => { stop = true; };
  }, [id]);
  const preuves: Record<string, Preuve> = useMemo(() => d?.preuves ?? {}, [d]);
  if (err) return <Erreur message={err} />;
  if (!d) return <Chargement lignes={5} />;
  const etapes = d.etapes as { etape: string; statut: string; details?: any; duree_ms?: number }[];
  const outils = (etapes.find((e) => e.etape === "outils")?.details?.appels ?? d.progression_outils ?? []) as { libelle: string; statut: string }[];
  const it = d.intention;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-ink-muted">Dossier de décision · date simulée {f.date(d.as_of)} · <code className="text-xs">{d.id}</code></p>
        <h1 className="mt-1 font-display text-[34px] font-medium leading-tight tracking-[-0.03em] sm:text-[40px]">{it.type === "ordre" ? `Ordre simulé de ${f.cad(it.montant_cad)} sur ${it.ticker}` : it.ticker ? `Titre ${it.ticker}` : "Portefeuille"}</h1>
      </div>
      <Panel className="p-5">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Étapes du dossier">
          {etapes.map((e) => {
            const [nom, qui] = NOMS[e.etape] ?? [e.etape, ""];
            const fait = e.statut === "termine", enCours = e.statut === "en_cours", rejet = e.statut === "rejet" || e.statut === "echec";
            return (
              <motion.li key={e.etape} layout transition={spring} className={clsx("rounded-xl p-2.5 text-xs", fait ? "bg-gain-50" : enCours ? "bg-primary-50" : rejet ? "bg-loss-50" : "bg-canvas")}>
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  {fait ? <Check className="h-3.5 w-3.5 text-gain-700" aria-hidden /> : enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-600" aria-hidden /> : rejet ? <X className="h-3.5 w-3.5 text-loss-700" aria-hidden /> : <span className="h-3.5 w-3.5 rounded-full border border-ink/20" aria-hidden />}
                  {nom}<span className="visuellement-cache"> : {fait ? "terminé" : enCours ? "en cours" : rejet ? "rejeté" : "à faire"}</span></span>
                <span className="mt-0.5 block text-ink-muted">{qui}{e.duree_ms != null ? ` · ${f.nombre(e.duree_ms, 0)} ms` : ""}</span>
              </motion.li>);
          })}
        </ol>
        {outils.length > 0 && <p className="mt-3 text-xs text-ink-muted" aria-live="polite">{outils.map((o) => `${o.libelle} ${o.statut === "echec" ? "✕" : "✓"}`).join(" · ")}</p>}
      </Panel>
      {d.etat === "en_cours" && <Chargement lignes={3} />}
      {d.etat === "echec" && <Notice tone="bad" title="Le dossier n'a pas pu être produit">{d.erreur}</Notice>}
      {d.etat === "termine" && <>
        <Hero>
          <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-white p-0.5"><PuceNiveau niveau={d.signal.niveau} /></span></div>
          <p className="mt-3 font-display text-[26px] font-medium leading-snug tracking-[-0.02em] sm:text-[30px]">{d.signal.titre}</p>
          <p className="mt-2 text-sm text-white/70">Niveau décidé par la politique écrite (règles {d.signal.regles_declenchees.join(", ")}). Texte rédigé par : {d.redaction.redige_par === "gabarit" ? "gabarit sans LLM" : d.redaction.redige_par}, puis vérifié phrase par phrase.</p>
        </Hero>
        <Stagger as="div" className="space-y-2">
          {d.redaction.sections.map((s: any) => (
            <StaggerItem as="div" key={s.etape}>
              <Section title={ETAPES[s.etape]} id={`s-${s.etape}`}>
                <div className="space-y-3 text-[15px] text-ink">{s.phrases.map((ph: any, i: number) => <Phrase key={i} texte={ph.texte} etiquette={ph.etiquette} ids={ph.preuves} preuves={preuves} ouvrir={ouvrirPreuve} />)}</div>
              </Section>
            </StaggerItem>))}
        </Stagger>
        {d.debat && <Debat debat={d.debat} preuves={preuves} ouvrir={ouvrirPreuve} />}
        {it.type === "ordre" && <Sensibilite intention={it} asOf={d.as_of} profilId={d.profil_id} />}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel><h2 className="font-display text-lg font-medium">Contrôles visibles</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">{d.gouvernance.controles.map((c: any) => <li key={c.code} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-gain-700" aria-hidden />{c.libelle}</li>)}</ul>
            {d.gouvernance.informations_manquantes.length > 0 && <><h3 className="mt-4 text-sm font-semibold">Informations manquantes</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">{d.gouvernance.informations_manquantes.map((m: any, i: number) => <li key={i}>{m.message}</li>)}</ul></>}
            {d.gouvernance.conflits.length > 0 && <><h3 className="mt-4 text-sm font-semibold">Conflits entre règles</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">{d.gouvernance.conflits.map((c: any) => <li key={c.code}>{c.message}</li>)}</ul></>}
          </Panel>
          <Panel><h2 className="font-display text-lg font-medium">Vérificateur</h2>
            <ul className="mt-3 space-y-2 text-sm">{d.essais_verification.map((e: any) => <li key={String(e.essai)}><span className="flex flex-wrap items-center gap-2"><strong>Essai {e.essai}</strong> <span className="text-ink-muted">({e.redige_par})</span>
              <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", e.resultat === "accepte" ? "bg-gain-50 text-gain-700" : "bg-loss-50 text-loss-700")}>{e.resultat === "accepte" ? "accepté" : "rejeté"}</span></span>
              {e.defauts_nommes?.length > 0 && <ul className="mt-1.5 space-y-1">{e.defauts_nommes.map((x: string, i: number) => <li key={i}><code className="block whitespace-pre-wrap rounded-lg bg-canvas p-2 text-xs">{x}</code></li>)}</ul>}</li>)}</ul>
            <Note>Durée : {f.nombre(d.duree_totale_ms / 1000, 1)} s · coût LLM estimé : {d.cout_estime_usd > 0 ? `${f.nombre(d.cout_estime_usd, 4)} $ US` : "nul (LLM simulé ou gabarit)"} · <Link className="text-primary-600 hover:underline" to={`/journal?p=${profil}`}>Journal</Link></Note>
            <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Trace complète (étapes, modules choisis, appels d'outils, preuves)</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-3 text-xs">{JSON.stringify(d.etapes, null, 1)}</pre></details>
          </Panel>
        </div>
      </>}
    </div>
  );
}

function Debat({ debat, preuves, ouvrir }: { debat: any; preuves: Record<string, Preuve>; ouvrir: (p: Preuve | null) => void }) {
  const cotes: [string, string, string][] = [["pour", "Ce qui joue en faveur", "bg-gain-50"], ["contre", "Ce qui appelle à la prudence", "bg-loss-50"]];
  return (
    <section aria-labelledby="debat">
      <h2 id="debat" className="font-display text-xl font-medium tracking-[-0.02em]">Deux agents, les mêmes preuves</h2>
      <p className="mt-1 text-sm text-ink-muted">Chacun défend un point de vue ; aucun ne décide. Chaque phrase est vérifiée comme le reste du dossier.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">{cotes.map(([c, titre, fond]) => {
        const s = debat[c];
        if (!s) return null;
        const rejets = (s.essais ?? []).filter((e: any) => e.resultat !== "accepte").length;
        return (
          <Panel key={c}>
            <p className={clsx("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-ink", fond)}>{s.agent}</p>
            <h3 className="mt-2 font-display text-lg font-medium">{titre}</h3>
            <div className="mt-3 space-y-3 text-[15px] text-ink">{s.phrases.map((ph: any, i: number) => <Phrase key={i} texte={ph.texte} etiquette={ph.etiquette} ids={ph.preuves} preuves={preuves} ouvrir={ouvrir} />)}</div>
            <Note>Rédigé par : {s.redige_par === "gabarit" ? "gabarit sans LLM" : s.redige_par}{rejets ? ` · ${rejets} version(s) rejetée(s) par le vérificateur` : ""}.</Note>
          </Panel>);
      })}</div>
    </section>
  );
}

function Sensibilite({ intention, asOf, profilId }: { intention: any; asOf: string; profilId: string }) {
  const [montant, setMontant] = useState<number>(intention.montant_cad);
  const [horizon, setHorizon] = useState<number>(0);
  const [s, setS] = useState<Signal | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      api<Signal>("/ordres/verifier", { body: { profil: profilId, ticker: intention.ticker, montant_cad: montant, as_of: asOf, options: false, horizon_annees: horizon || undefined } }).then(setS).catch(() => setS(null));
    }, 200);
    return () => window.clearTimeout(t);
  }, [montant, horizon, intention.ticker, asOf, profilId]);
  return (
    <Panel className="p-6" aria-labelledby="sens"><h2 id="sens" className="font-display text-xl font-medium tracking-[-0.02em]">Ce qui changerait le constat</h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div><label htmlFor="sm" className="text-sm font-semibold">Taille de la position : <span className="tabular">{f.cad(montant)}</span></label>
          <input id="sm" type="range" className="mt-3 w-full" min={0} max={Math.max(intention.montant_cad * 1.5, 1000)} step={500} value={montant} onChange={(e) => setMontant(Number(e.target.value))} /></div>
        <div><label htmlFor="sh" className="text-sm font-semibold">Horizon : {horizon ? `${horizon} an(s) (hypothèse)` : "celui de ton contrat"}</label>
          <input id="sh" type="range" className="mt-3 w-full" min={0} max={10} step={1} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} /></div>
      </div>
      <div aria-live="polite" className="mt-4">{s && <><p className="flex flex-wrap items-center gap-2"><PuceNiveau niveau={s.niveau} /> <span className="text-xs text-ink-muted">recalculé en {f.nombre(s.latence_ms ?? 0, 0)} ms (règles {s.regles_declenchees.join(", ")})</span></p>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">{s.clauses.filter((c) => c.statut !== "respectee").slice(0, 4).map((c) => <li key={c.clause_id} className="flex flex-wrap items-start gap-2"><PuceStatut statut={c.statut} /> <span className="min-w-0 flex-1">{c.explication}</span></li>)}</ul></>}</div>
      <Note>Curseurs d'hypothèse : rien n'est enregistré dans ton contrat.</Note>
    </Panel>
  );
}
