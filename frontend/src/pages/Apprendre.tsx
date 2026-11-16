import { ArrowLeft, ArrowRight, BookOpen, Check, Clock, Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Meter, Stagger, StaggerItem } from "../components/motion";
import { Field, LinkButton, Notice, PageTitle, Panel, inputCls } from "../components/ui";
import * as f from "../format";
import { leconParId, LECONS } from "../lecons";
import { useApp } from "../state";

/** « Apprendre » : seven short lessons, with the reader's progress kept with the account. */
export function Apprendre() {
  const { compte, profil } = useApp();
  const lues = new Set(compte?.guide?.lecons ?? []);
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle eyebrow={<span className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Apprendre</span>} title="Investir, expliqué simplement"
        subtitle="Sept leçons de 2 minutes, sans jargon. Commence par le début : chacune s'appuie sur la précédente." />
      <div className="mb-6 flex items-center gap-3"><Meter value={lues.size / LECONS.length} tone="primary" className="w-48" />
        <span className="tabular text-sm text-ink-muted">{lues.size} sur {LECONS.length} lues</span></div>
      <Stagger as="div" className="space-y-2.5">{LECONS.map((l, i) => (
        <StaggerItem as="div" key={l.id}>
          <Link to={`/apprendre/${l.id}?p=${profil}`} className="flex items-center gap-4 rounded-[20px] bg-white p-4 shadow-card hover:shadow-lift sm:p-5">
            <span className={`tabular grid h-10 w-10 shrink-0 place-items-center rounded-full font-display font-semibold ${lues.has(l.id) ? "bg-gain-600 text-white" : "bg-ink/[0.05] text-ink"}`}>
              {lues.has(l.id) ? <Check className="h-5 w-5" strokeWidth={3} aria-label="lue" /> : i + 1}</span>
            <span className="min-w-0 flex-1"><span className="block font-medium text-ink">{l.titre}</span><span className="block text-sm text-ink-muted">{l.court}</span></span>
            <span className="hidden shrink-0 items-center gap-1 text-xs text-ink-muted sm:flex"><Clock className="h-3.5 w-3.5" />{l.minutes} min</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" />
          </Link>
        </StaggerItem>))}</Stagger>
    </div>
  );
}

export function Lecon() {
  const { id = "" } = useParams();
  const { compte, rechargerCompte, profil } = useApp();
  const l = leconParId(id);
  const i = LECONS.findIndex((x) => x.id === id);
  const suivante = LECONS[i + 1];
  useEffect(() => {
    if (l && !(compte?.guide?.lecons ?? []).includes(l.id)) api("/guide", { body: { lecon_lue: l.id } }).then(() => rechargerCompte()).catch(() => undefined);
    window.scrollTo({ top: 0 });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!l) return <p><Link to={`/apprendre?p=${profil}`} className="text-primary-600 underline">Retour aux leçons</Link></p>;
  return (
    <article className="mx-auto max-w-2xl">
      <Link to={`/apprendre?p=${profil}`} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Toutes les leçons</Link>
      <p className="mt-6 text-sm text-ink-muted">Leçon {i + 1} sur {LECONS.length} · {l.minutes} min</p>
      <h1 className="mt-1 font-display text-[34px] font-medium leading-tight tracking-[-0.03em] sm:text-[40px]">{l.titre}</h1>
      <div className="mt-6 space-y-4 text-[17px] leading-relaxed text-ink-soft">{l.paragraphes.map((p) => <p key={p}>{p}</p>)}</div>
      {l.calculateur && <Calculateur />}
      <Notice tone="good" className="mt-8" title={<span className="flex items-center gap-2"><Lightbulb className="h-4 w-4" /> À retenir</span>}>{l.retenir}</Notice>
      <div className="mt-8 flex justify-end">{suivante
        ? <LinkButton to={`/apprendre/${suivante.id}?p=${profil}`} variant="primary">Leçon suivante : {suivante.titre}</LinkButton>
        : <LinkButton to={`/?p=${profil}`} variant="primary">Revenir à l'accueil</LinkButton>}</div>
    </article>
  );
}

/** Compound interest with a rate the reader chooses: an illustration, never a forecast (PDF p. 18). */
function Calculateur() {
  const [mensuel, setMensuel] = useState("200");
  const [annees, setAnnees] = useState("20");
  const [taux, setTaux] = useState("4");
  const m = Math.max(0, Number(mensuel) || 0), n = Math.min(60, Math.max(1, Number(annees) || 1)), r = Math.min(15, Math.max(0, Number(taux) || 0)) / 100;
  const mois = n * 12, rm = Math.pow(1 + r, 1 / 12) - 1;
  const valeur = rm === 0 ? m * mois : m * ((Math.pow(1 + rm, mois) - 1) / rm);
  const verse = m * mois;
  return (
    <Panel className="mt-8">
      <h2 className="font-display text-lg font-medium">Calculateur d'intérêts composés</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Versement par mois ($)" htmlFor="cm"><input id="cm" inputMode="numeric" className={inputCls} value={mensuel} onChange={(e) => setMensuel(e.target.value)} /></Field>
        <Field label="Durée (années)" htmlFor="ca"><input id="ca" inputMode="numeric" className={inputCls} value={annees} onChange={(e) => setAnnees(e.target.value)} /></Field>
        <Field label="Taux annuel supposé (%)" htmlFor="ct"><input id="ct" inputMode="decimal" className={inputCls} value={taux} onChange={(e) => setTaux(e.target.value)} /></Field>
      </div>
      <p className="mt-4 text-sm text-ink-soft">Tu aurais versé <strong className="tabular text-ink">{f.cad(verse)}</strong>. Avec un taux constant de {f.nombre(r * 100, 1)} % par an, la valeur serait de <strong className="tabular text-ink">{f.cad(valeur)}</strong>, dont <strong className="tabular text-ink">{f.cad(valeur - verse)}</strong> d'intérêts composés.</p>
      <p className="mt-2 text-xs text-ink-muted">Hypothèse que tu choisis, pas une prévision : un vrai placement ne rapporte jamais un taux constant, et il peut baisser. Frais et impôts non inclus.</p>
    </Panel>
  );
}
