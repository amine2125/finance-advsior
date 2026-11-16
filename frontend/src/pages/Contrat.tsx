import { useState } from "react";
import { api } from "../api";
import { Chargement, Erreur, PuceNiveau } from "../components/base";
import { KycResume } from "../components/Kyc";
import { Stagger, StaggerItem } from "../components/motion";
import { Button, Field, Hero, LinkButton, Notice, Section, inputCls } from "../components/ui";
import * as f from "../format";
import { EXPERIENCE, TOLERANCE } from "../libelles";
import { useApp, useData } from "../state";
import type { Adaptation, Clause, Contrat, Profil, Signal } from "../types";

interface R { profil: Profil; contrat: Contrat; contradictions: { code: string; gravite: string; message: string; clauses: string[] }[]; adaptation: Adaptation }

export function ContratPage() {
  const { profil, asOf, enPassé, toucher } = useApp();
  const { data, erreur, charge, recharger } = useData<R>(`/profils/${profil}`, { as_of: asOf });
  const [edit, setEdit] = useState<Clause | null>(null);
  const [valeur, setValeur] = useState("");
  const [contexte, setContexte] = useState("");
  const [apercu, setApercu] = useState<{ avant: Signal; apres: Signal } | null>(null);
  if (charge && !data) return <Chargement lignes={6} />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  const p = data.profil, c = data.contrat;
  const cle = (cl: Clause) => Object.keys(cl.parametres).find((k) => ["max_pct", "min_pct", "annees"].includes(k));
  const params = (cl: Clause) => { const k = cle(cl); return k ? { [k]: Number(valeur.replace(",", ".")) } : {}; };
  const voir = async () => { if (!edit) return; setApercu(await api(`/profils/${profil}/regles/${edit.id}/apercu`, { body: { parametres: params(edit) }, params: { as_of: asOf } })); };
  const valider = async () => {
    if (!edit) return;
    await api(`/profils/${profil}/regles/${edit.id}`, { body: { parametres: params(edit), contexte: contexte || "modification par l'utilisateur" }, params: { as_of: asOf } });
    setEdit(null); setApercu(null); setContexte(""); toucher();
  };
  return (
    <div className="space-y-8">
      <Hero>
        <p className="text-sm text-white/70">Mon contrat · version {c.version}</p>
        <h1 className="mt-2 font-display text-[32px] font-medium leading-tight tracking-[-0.03em] sm:text-[40px]">Les règles que {p.nom} a fixées à froid.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/75">Le mât auquel ULYSSE compare chaque intention. Profil fictif · {p.age ? `${p.age} ans · ` : ""}tolérance « {TOLERANCE[p.tolerance] ?? p.tolerance} » · expérience « {EXPERIENCE[p.experience] ?? p.experience} ». {p.description}</p>
        <div className="mt-5"><LinkButton to={`/nouveau-profil?p=${profil}${enPassé ? `&d=${asOf}` : ""}`} variant="onDark">Créer un nouveau profil</LinkButton></div>
      </Hero>
      {p.kyc && <KycResume kyc={p.kyc} />}
      {data.contradictions.length > 0 && (
        <Notice tone="warn" title="Contradictions relevées entre tes règles">
          <ul className="mt-1 list-disc space-y-1 pl-5">{data.contradictions.map((k) => <li key={k.code}>{k.message}</li>)}</ul></Notice>)}
      <Section title="Clauses" id="clauses">
        <Stagger className="grid gap-3 md:grid-cols-2">
          {c.clauses.map((cl) => (
            <StaggerItem key={cl.id} className={`rounded-2xl bg-white p-5 shadow-card ${edit?.id === cl.id ? "md:col-span-2" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium leading-snug text-ink">{cl.libelle}</p>
                {cle(cl) && edit?.id !== cl.id && <Button size="sm" variant="secondary" onClick={() => { setEdit(cl); setValeur(String(cl.parametres[cle(cl)!])); setApercu(null); }}>Modifier</Button>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${cl.origine === "dit" ? "bg-primary-50 text-primary-700" : "bg-ink/[0.04] text-ink-soft"}`}>{cl.origine === "dit" ? "Tu l'as dit" : "Valeur par défaut"}</span>
                {cl.importante && <span className="rounded-full bg-loss-50 px-2.5 py-0.5 font-semibold text-loss-700">Importante</span>}
              </div>
              {cl.origine !== "dit" && <p className="mt-2 text-xs leading-relaxed text-ink-muted">Hypothèse documentée : {cl.justification}</p>}
              {cl.importante && <p className="mt-1 text-xs text-ink-muted">Un grand écart déclenche une pause de réflexion.</p>}
              {edit?.id === cl.id && (
                <div className="mt-4 space-y-4 border-t border-line pt-4">
                  <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                    <Field label={`Nouvelle valeur (${cle(cl) === "annees" ? "années" : "%"})`} htmlFor={`v-${cl.id}`}><input id={`v-${cl.id}`} inputMode="decimal" value={valeur} onChange={(e) => setValeur(e.target.value)} className={inputCls} /></Field>
                    <Field label="Pourquoi ? (consigné avec la date)" htmlFor={`c-${cl.id}`}><input id={`c-${cl.id}`} value={contexte} onChange={(e) => setContexte(e.target.value)} placeholder="ex. après avoir revu mon objectif de retraite…" className={inputCls} /></Field>
                  </div>
                  <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={voir}>Voir l'effet avant de valider</Button><Button onClick={valider}>Valider la modification</Button><Button variant="ghost" onClick={() => { setEdit(null); setApercu(null); }}>Annuler</Button></div>
                  {apercu && <p aria-live="polite" className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-3 text-sm">Sur ton portefeuille actuel : avant <PuceNiveau niveau={apercu.avant.niveau} /> → après <PuceNiveau niveau={apercu.apres.niveau} /> <span className="text-ink-soft">{apercu.apres.clauses[0]?.explication}</span></p>}
                </div>)}
            </StaggerItem>))}
        </Stagger>
      </Section>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Objectifs">
          <ul className="space-y-2 text-sm text-ink-soft">{p.objectifs.map((o) => <li key={o.id} className="rounded-xl bg-white p-3 shadow-card"><span className="font-medium text-ink">{o.libelle}</span> : dans {f.nombre(o.horizon_annees, 1)} an(s), {f.pct(o.part_pct, 0)} du portefeuille{o.montant_cible_cad ? `, cible ${f.cad(o.montant_cible_cad)}` : ""}</li>)}</ul>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">Adaptation de l'app à ce profil : vocabulaire {data.adaptation.vocabulaire} ; lentille ESG {data.adaptation.lentille_esg ? "visible" : "masquée"} ; module crypto {data.adaptation.module_crypto} ; priorité : {data.adaptation.priorite_modules.join(", ")}.</p>
        </Section>
        {c.historique.length > 0 && <Section title="Historique des modifications">
          <ul className="space-y-2 text-sm text-ink-soft">{c.historique.map((h: any, i: number) => <li key={i} className="border-b border-line pb-2">Version {h.version}, le {h.le.slice(0, 10)} : {h.clause} {JSON.stringify(h.avant)} → {JSON.stringify(h.apres)} — « {h.contexte} »</li>)}</ul></Section>}
      </div>
    </div>
  );
}
