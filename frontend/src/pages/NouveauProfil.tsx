import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { Meter, softSpring } from "../components/motion";
import { Button, Choice, Field, Notice, PageTitle, Panel, inputCls } from "../components/ui";
import { useApp } from "../state";
import type { Adaptation, Contrat, Profil } from "../types";

const ETAPES = ["Toi", "Ton risque", "Ton objectif", "Tes préférences"] as const;

/** Step-by-step onboarding in the AEGIS style; the result is a ULYSSE contract (rules written cold, defaults documented). */
export function NouveauProfil() {
  const { setProfil, toucher } = useApp();
  const [etape, setEtape] = useState(0);
  const [v, setV] = useState({ nom: "Profil prudent", age: "34", experience: "debutant", tolerance: "faible", objectif: "Mise de fonds pour un achat", horizon: "1.5", part: "70", cible: "60000",
    capital: "70000", esg: false, crypto: false, techno: false, perte: "" });
  const [res, setRes] = useState<{ profil: Profil; contrat: Contrat; contradictions: { code: string; message: string }[]; adaptation: Adaptation } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const set = (k: keyof typeof v, x: string | boolean) => setV((o) => ({ ...o, [k]: x }));
  const champ = (k: keyof typeof v) => ({ value: String(v[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value), className: inputCls });
  const creer = async () => {
    setErr(null); setOccupe(true);
    try {
      const r = await api<typeof res>("/profils", { body: { nom: v.nom, age: Number(v.age) || null, experience: v.experience, tolerance: v.tolerance, capital_cad: Number(v.capital),
        objectifs: [{ libelle: v.objectif, horizon_annees: Number(v.horizon.replace(",", ".")), part_pct: Number(v.part), montant_cible_cad: Number(v.cible) || null }],
        esg_important: v.esg, eviter_controverses: v.esg, interet_crypto: v.crypto, interet_techno: v.techno, limites: v.perte ? { perte_max: Number(v.perte) } : {}, description: "Profil créé en direct" } });
      setRes(r); toucher();
    } catch (x) { setErr((x as Error).message); } finally { setOccupe(false); }
  };
  if (res) return (
    <div className="mx-auto max-w-2xl">
      <PageTitle eyebrow="Profil créé" title={`Contrat de « ${res.profil.nom} »`} subtitle={`Version ${res.contrat.version}. Chaque règle dit d'où elle vient : ce que tu as dit, ou une valeur par défaut documentée.`} />
      {res.contradictions.length > 0 && <Notice tone="warn" title="Contradictions relevées" className="mb-4"><ul className="mt-1 list-disc pl-5">{res.contradictions.map((k) => <li key={k.code}>{k.message}</li>)}</ul></Notice>}
      <Panel><ul className="divide-y divide-line text-sm">{res.contrat.clauses.map((c) => <li key={c.id} className="flex items-start justify-between gap-3 py-3"><span>{c.libelle}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.origine === "dit" ? "bg-primary-50 text-primary-700" : "bg-ink/[0.04] text-ink-soft"}`}>{c.origine === "dit" ? "tu l'as dit" : "par défaut"}</span></li>)}</ul></Panel>
      <p className="mt-4 text-sm text-ink-soft">L'app s'adapte tout de suite : vocabulaire {res.adaptation.vocabulaire}, priorité {res.adaptation.priorite_modules.slice(0, 3).join(", ")}, module crypto {res.adaptation.module_crypto}.</p>
      <Button variant="accent" size="lg" className="mt-6" onClick={() => setProfil(res.profil.id)}>Utiliser ce profil</Button>
    </div>
  );
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle eyebrow={`Étape ${etape + 1} sur ${ETAPES.length} · ${ETAPES[etape]}`} title="Créer un profil en direct"
        subtitle="Le moteur lit n'importe quel profil : rien n'est codé pour un persona. Exemple de l'énoncé : « profil prudent préparant un achat prochain »." />
      <Meter value={(etape + 1) / ETAPES.length} tone="primary" className="mb-6" />
      <AnimatePresence mode="wait">
        <motion.div key={etape} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={softSpring} className="space-y-5">
          {etape === 0 && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom du profil" htmlFor="nom"><input id="nom" autoComplete="off" {...champ("nom")} /></Field>
              <Field label="Âge" htmlFor="age" hint="Jamais utilisé pour déduire ta tolérance au risque."><input id="age" inputMode="numeric" {...champ("age")} /></Field>
            </div>
            <fieldset><legend className="text-sm font-semibold">Expérience en placement</legend><div className="mt-2 grid gap-2">
              {[["debutant", "Débutant", "Explications simples, sans jargon"], ["intermediaire", "Intermédiaire", "Vocabulaire standard"], ["avance", "Avancé", "Métriques détaillées visibles (CVaR, risque récent)"]].map(([k, t, d]) =>
                <Choice key={k} selected={v.experience === k} onClick={() => set("experience", k)} title={t} desc={d} />)}</div></fieldset>
          </>}
          {etape === 1 && <>
            <fieldset><legend className="text-sm font-semibold">Tolérance au risque</legend><div className="mt-2 grid gap-2">
              {[["faible", "Faible", "Préserver le capital avant tout"], ["faible_modere", "Faible à modérée", "Stabilité, un peu de croissance"], ["modere", "Modérée", "Équilibre croissance et stabilité"], ["eleve", "Élevée", "Croissance, en acceptant de fortes variations"]].map(([k, t, d]) =>
                <Choice key={k} selected={v.tolerance === k} onClick={() => set("tolerance", k)} title={t} desc={d} />)}</div></fieldset>
            <Field label="Perte maximale acceptée en crise (%) — facultatif" htmlFor="perte" hint="Sinon : valeur par défaut selon ta tolérance, hypothèse documentée."><input id="perte" inputMode="decimal" placeholder="ex. 15" {...champ("perte")} /></Field>
          </>}
          {etape === 2 && <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Objectif" htmlFor="obj" className="sm:col-span-2"><input id="obj" {...champ("objectif")} /></Field>
            <Field label="Dans combien d'années ?" htmlFor="hz"><input id="hz" inputMode="decimal" {...champ("horizon")} /></Field>
            <Field label="Part du portefeuille (%)" htmlFor="part"><input id="part" inputMode="numeric" {...champ("part")} /></Field>
            <Field label="Montant visé (CAD)" htmlFor="cible"><input id="cible" inputMode="numeric" {...champ("cible")} /></Field>
            <Field label="Capital fictif (CAD)" htmlFor="cap"><input id="cap" inputMode="numeric" {...champ("capital")} /></Field>
          </div>}
          {etape === 3 && <div className="grid gap-2">
            <Choice selected={v.esg} onClick={() => set("esg", !v.esg)} title="L'ESG compte pour moi" desc="Éviter les controverses environnementales ou sociales importantes (preuves citées)" />
            <Choice selected={v.crypto} onClick={() => set("crypto", !v.crypto)} title="Intérêt pour les cryptoactifs" desc="Sinon, aucune part spéculative en crypto" />
            <Choice selected={v.techno} onClick={() => set("techno", !v.techno)} title="Intérêt pour la techno" desc="Limite de concentration en technologies quand même appliquée" />
          </div>}
        </motion.div>
      </AnimatePresence>
      {err && <Notice tone="bad" role="alert" className="mt-4">{err}</Notice>}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setEtape((e) => Math.max(0, e - 1))} disabled={etape === 0}><ArrowLeft className="h-4 w-4" /> Retour</Button>
        {etape < ETAPES.length - 1 ? <Button onClick={() => setEtape((e) => e + 1)}>Continuer <ArrowRight className="h-4 w-4" /></Button>
          : <Button variant="accent" onClick={creer} disabled={occupe}>{occupe ? "Création…" : "Créer le profil et son contrat"}</Button>}
      </div>
    </div>
  );
}
