import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { KycResume } from "../components/Kyc";
import { Meter, softSpring } from "../components/motion";
import { Button, Choice, Field, Notice, PageTitle, Panel, inputCls } from "../components/ui";
import { useApp } from "../state";
import type { Adaptation, Contrat, Profil } from "../types";

const ETAPES = ["Toi", "Ton risque", "Ta situation", "Tes connaissances", "Ton objectif", "Tes préférences"] as const;
const QUIZ: { cle: "qd" | "qo" | "qi"; question: string; choix: [string, string][] }[] = [
  { cle: "qd", question: "Répartir son argent entre plusieurs placements sert surtout à…", choix: [["a", "garantir un gain"], ["b", "réduire l'effet d'une seule mauvaise surprise"], ["c", "payer moins d'impôt"]] },
  { cle: "qo", question: "Quand les taux d'intérêt montent, le prix des obligations déjà émises…", choix: [["a", "baisse"], ["b", "monte"], ["c", "ne change pas"]] },
  { cle: "qi", question: "Avec 2 % d'intérêt et 3 % d'inflation, dans un an ton argent achète…", choix: [["a", "plus qu'aujourd'hui"], ["b", "autant"], ["c", "moins qu'aujourd'hui"]] },
];
const PRODUITS: [string, string][] = [["epargne", "Compte épargne"], ["cpg", "CPG"], ["fonds", "Fonds communs"], ["fnb", "FNB"], ["actions", "Actions"], ["crypto", "Cryptoactifs"], ["options", "Options"]];

/** Step-by-step onboarding; « Connaître son client » sets the tolerance (lowest of three measures), the result is a ULYSSE contract. */
export function NouveauProfil() {
  const { setProfil, toucher, rechargerCompte } = useApp();
  const [etape, setEtape] = useState(0);
  const [v, setV] = useState({ nom: "Profil prudent", age: "34", tolerance: "faible", baisse: "15", reaction: "attendre", ressenti: "mal_a_l_aise",
    revenu: "4500", depenses: "3200", epargne: "12000", carte: "0", dettes: "0", emploi: "permanent", charge: "0", liquidites: "modere",
    savoir: "base", qd: "", qo: "", qi: "", produits: ["epargne"] as string[],
    objectif: "Mise de fonds pour un achat", horizon: "1.5", part: "70", cible: "60000", capital: "70000", esg: false, crypto: false, techno: false, perte: "" });
  const [res, setRes] = useState<{ profil: Profil; contrat: Contrat; contradictions: { code: string; message: string }[]; adaptation: Adaptation } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const set = (k: keyof typeof v, x: string | boolean | string[]) => setV((o) => ({ ...o, [k]: x }));
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\s/g, "").replace(",", ".")));
  const champ = (k: keyof typeof v) => ({ value: String(v[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value), className: inputCls });
  const choix = (k: keyof typeof v, options: [string, string, string?][]) => <div className="mt-2 grid gap-2">{options.map(([cle, t, d]) =>
    <Choice key={cle} selected={v[k] === cle} onClick={() => set(k, cle)} title={t} desc={d} />)}</div>;
  const creer = async () => {
    setErr(null); setOccupe(true);
    try {
      const r = await api<typeof res>("/profils", { body: { nom: v.nom, age: Number(v.age) || null, tolerance: v.tolerance, capital_cad: Number(v.capital),
        objectifs: [{ libelle: v.objectif, horizon_annees: Number(v.horizon.replace(",", ".")), part_pct: Number(v.part), montant_cible_cad: Number(v.cible) || null }],
        esg_important: v.esg, eviter_controverses: v.esg, interet_crypto: v.crypto, interet_techno: v.techno, limites: v.perte ? { perte_max: Number(v.perte) } : {},
        description: "Profil créé en direct",
        kyc: { baisse_max_pct: n(v.baisse) ?? 10, reaction_baisse: v.reaction, ressenti: v.ressenti, revenu_mensuel: n(v.revenu), depenses_mensuelles: n(v.depenses),
          epargne_cad: n(v.epargne), dette_carte_cad: n(v.carte), autres_dettes_cad: n(v.dettes), emploi: v.emploi, personnes_a_charge: n(v.charge),
          besoin_liquidites: v.liquidites, connaissances_declarees: v.savoir, quiz_diversification: v.qd || null, quiz_obligations: v.qo || null,
          quiz_inflation: v.qi || null, produits_detenus: v.produits } } });
      setRes(r); toucher(); await rechargerCompte();
    } catch (x) { setErr((x as Error).message); } finally { setOccupe(false); }
  };
  if (res) return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageTitle eyebrow="Profil créé" title={`Contrat de « ${res.profil.nom} »`} subtitle={`Version ${res.contrat.version}. Chaque règle dit d'où elle vient : ce que tu as dit, ou une valeur par défaut documentée.`} />
      {res.profil.kyc && <KycResume kyc={res.profil.kyc} />}
      {res.contradictions.length > 0 && <Notice tone="warn" title="Contradictions relevées"><ul className="mt-1 list-disc pl-5">{res.contradictions.map((k) => <li key={k.code}>{k.message}</li>)}</ul></Notice>}
      <Panel><ul className="divide-y divide-line text-sm">{res.contrat.clauses.map((c) => <li key={c.id} className="flex items-start justify-between gap-3 py-3"><span>{c.libelle}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.origine === "dit" ? "bg-primary-50 text-primary-700" : "bg-ink/[0.04] text-ink-soft"}`}>{c.origine === "dit" ? "tu l'as dit" : "par défaut"}</span></li>)}</ul></Panel>
      <p className="text-sm text-ink-soft">L'app s'adapte tout de suite : vocabulaire {res.adaptation.vocabulaire}, priorité {res.adaptation.priorite_modules.slice(0, 3).join(", ")}, module crypto {res.adaptation.module_crypto}.</p>
      <Button variant="accent" size="lg" onClick={() => setProfil(res.profil.id)}>Utiliser ce profil</Button>
    </div>
  );
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle eyebrow={`Étape ${etape + 1} sur ${ETAPES.length} · ${ETAPES[etape]}`} title="Créer un profil en direct"
        subtitle="Comme le questionnaire « Connaître son client » d'une banque : ce que tu es prêt à risquer, ce que ta situation permet et ce que tu connais. La plus basse des trois mesures fixe ton profil." />
      <Meter value={(etape + 1) / ETAPES.length} tone="primary" className="mb-6" />
      <AnimatePresence mode="wait">
        <motion.div key={etape} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={softSpring} className="space-y-5">
          {etape === 0 && <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom du profil" htmlFor="nom"><input id="nom" autoComplete="off" {...champ("nom")} /></Field>
            <Field label="Âge" htmlFor="age" hint="Jamais utilisé pour déduire ta tolérance au risque."><input id="age" inputMode="numeric" {...champ("age")} /></Field>
          </div>}
          {etape === 1 && <>
            <fieldset><legend className="text-sm font-semibold">Ta tolérance au risque, selon toi</legend>
              {choix("tolerance", [["faible", "Faible", "Préserver le capital avant tout"], ["faible_modere", "Faible à modérée", "Stabilité, un peu de croissance"], ["modere", "Modérée", "Équilibre croissance et stabilité"], ["eleve", "Élevée", "Croissance, en acceptant de fortes variations"]])}</fieldset>
            <Field label="Baisse temporaire que tu pourrais traverser sans vendre (%)" htmlFor="baisse"><input id="baisse" inputMode="decimal" {...champ("baisse")} /></Field>
            <fieldset><legend className="text-sm font-semibold">Tes placements perdent 20 % en un mois. Tu…</legend>
              {choix("reaction", [["vendre_tout", "Vends tout"], ["vendre_partie", "Vends une partie"], ["attendre", "Attends que ça remonte"], ["acheter_plus", "En profites pour investir plus"]])}</fieldset>
            <fieldset><legend className="text-sm font-semibold">Voir la valeur de tes placements varier, ça te rend…</legend>
              {choix("ressenti", [["stresse", "Très stressé"], ["mal_a_l_aise", "Mal à l'aise"], ["serein", "Serein"], ["enthousiaste", "Enthousiaste"]])}</fieldset>
            <Field label="Perte maximale acceptée en crise (%) — facultatif" htmlFor="perte" hint="Sinon : valeur par défaut selon le niveau retenu, hypothèse documentée."><input id="perte" inputMode="decimal" placeholder="ex. 15" {...champ("perte")} /></Field>
          </>}
          {etape === 2 && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Revenu net par mois ($)" htmlFor="rev"><input id="rev" inputMode="numeric" {...champ("revenu")} /></Field>
              <Field label="Dépenses par mois ($)" htmlFor="dep"><input id="dep" inputMode="numeric" {...champ("depenses")} /></Field>
              <Field label="Épargne disponible ($)" htmlFor="epa"><input id="epa" inputMode="numeric" {...champ("epargne")} /></Field>
              <Field label="Dette de carte de crédit ($)" htmlFor="carte"><input id="carte" inputMode="numeric" {...champ("carte")} /></Field>
              <Field label="Autres dettes, hors hypothèque ($)" htmlFor="det"><input id="det" inputMode="numeric" {...champ("dettes")} /></Field>
              <Field label="Personnes à charge" htmlFor="charge"><input id="charge" inputMode="numeric" {...champ("charge")} /></Field>
            </div>
            <fieldset><legend className="text-sm font-semibold">Emploi</legend>
              {choix("emploi", [["permanent", "Permanent"], ["contrat", "Contrat ou temporaire"], ["autonome", "Travailleur autonome"], ["etudiant", "Étudiant"], ["sans_emploi", "Sans emploi"], ["retraite", "Retraité"]])}</fieldset>
            <fieldset><legend className="text-sm font-semibold">Pourrais-tu avoir besoin de cet argent rapidement ?</legend>
              {choix("liquidites", [["faible", "Peu probable"], ["modere", "Peut-être"], ["eleve", "Oui, probablement"]])}</fieldset>
          </>}
          {etape === 3 && <>
            <fieldset><legend className="text-sm font-semibold">Tes connaissances en placement</legend>
              {choix("savoir", [["aucune", "Aucune", "Je débute complètement"], ["base", "De base"], ["bonnes", "Bonnes"], ["expert", "Expert"]])}</fieldset>
            {QUIZ.map((q) => <fieldset key={q.cle}><legend className="text-sm font-semibold">{q.question}</legend>
              {choix(q.cle, q.choix.map(([k, t]) => [k, t]))}</fieldset>)}
            <fieldset><legend className="text-sm font-semibold">Produits que tu as déjà détenus</legend>
              <div className="mt-2 flex flex-wrap gap-2">{PRODUITS.map(([k, t]) => {
                const on = v.produits.includes(k);
                return <button key={k} type="button" aria-pressed={on} onClick={() => set("produits", on ? v.produits.filter((x) => x !== k) : [...v.produits, k])}
                  className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{t}</button>;
              })}</div></fieldset>
          </>}
          {etape === 4 && <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Objectif" htmlFor="obj" className="sm:col-span-2"><input id="obj" {...champ("objectif")} /></Field>
            <Field label="Dans combien d'années ?" htmlFor="hz"><input id="hz" inputMode="decimal" {...champ("horizon")} /></Field>
            <Field label="Part du portefeuille (%)" htmlFor="part"><input id="part" inputMode="numeric" {...champ("part")} /></Field>
            <Field label="Montant visé (CAD)" htmlFor="cible"><input id="cible" inputMode="numeric" {...champ("cible")} /></Field>
            <Field label="Capital fictif (CAD)" htmlFor="cap"><input id="cap" inputMode="numeric" {...champ("capital")} /></Field>
          </div>}
          {etape === 5 && <div className="grid gap-2">
            <Choice selected={v.esg} onClick={() => set("esg", !v.esg)} title="L'ESG compte pour moi" desc="Éviter les controverses environnementales ou sociales importantes (preuves citées)" />
            <Choice selected={v.crypto} onClick={() => set("crypto", !v.crypto)} title="Intérêt pour les cryptoactifs" desc="Sinon, aucune part spéculative en crypto ; jamais pour un débutant" />
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
