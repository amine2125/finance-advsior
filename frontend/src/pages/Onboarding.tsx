import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, Leaf, Rocket, Scale, Shield, Sprout } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import HoldingsEditor from "../components/HoldingsEditor";
import { Logo } from "../components/Layout";
import { Badge, Button, Choice, ErrorBox, Field, inputCls, Notice, Spinner, YesNo } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { cad, pct } from "../lib/format";
import { api, ApiError } from "../services/api";

type Answers = {
  display_name: string; age: number | null; objective: string; horizon_years: number | null; max_decline: number | null;
  drop_reaction: string; stable_income: boolean | null; emergency_reserve: boolean | null; liquidity_needs: string | null;
  dependants: boolean | null; experience: string | null; crypto_interest: string; esg_preference: boolean;
  interests: string[]; excluded_sectors: string[]; capital_cad: number | null;
};
const EMPTY: Answers = {
  display_name: "", age: null, objective: "", horizon_years: null, max_decline: null, drop_reaction: "", stable_income: null,
  emergency_reserve: null, liquidity_needs: null, dependants: null, experience: null, crypto_interest: "", esg_preference: false,
  interests: [], excluded_sectors: [], capital_cad: null,
};
const INTERESTS = ["Technologie et IA", "Entreprises canadiennes", "Dividendes stables", "Énergie", "Santé", "Or"];
const SECTORS = [["Energy", "Énergie (pétrole, gaz)"], ["Information Technology", "Technologies"], ["Cryptoassets", "Cryptoactifs"], ["Financials", "Banques et assurances"]];
const TITLES = ["Faisons connaissance", "Votre objectif", "Votre horizon", "Les baisses", "Votre réaction", "Votre situation", "Vos préférences", "Votre profil", "Vos placements"];

export default function Onboarding() {
  const nav = useNavigate();
  const { me, reload, setPortfolioId } = useApp();
  const [a, setA] = useState<Answers>(() => ({ ...EMPTY, ...(me?.answers || {}) }));
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<any>(null);
  const [saved, setSaved] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [hasPortfolio, setHasPortfolio] = useState<boolean | null>(null);
  const editing = !!me?.onboarded;
  const set = (patch: Partial<Answers>) => setA((x) => ({ ...x, ...patch }));
  const toggle = (k: "interests" | "excluded_sectors", v: string) => set({ [k]: a[k].includes(v) ? a[k].filter((x) => x !== v) : [...a[k], v] } as any);

  const valid = [
    a.display_name.trim().length > 0 && (a.age === null || (a.age >= 16 && a.age <= 110)),
    !!a.objective, !!a.horizon_years && a.horizon_years > 0, !!a.max_decline, !!a.drop_reaction, true, !!a.crypto_interest, true, true,
  ][step];

  useEffect(() => {
    if (step !== 7) return;
    setPreview(null);
    setError(null);
    api.post("/onboarding/preview", a).then(setPreview).catch((e) => setError(e));
  }, [step]); // eslint-disable-line

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await api.post("/onboarding", a);
      setSaved(p);
      if (editing && me?.portfolios.length) { await reload(); nav("/profil"); return; }
      setStep(8);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  const finish = async (pf?: any) => {
    if (pf?.portfolio_id) setPortfolioId(pf.portfolio_id);
    await reload();
    nav(pf ? "/portefeuille" : "/");
  };

  const ex = 10000;
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-6">
        <Logo />
        <span className="text-sm text-slate-400">Étape {step + 1} sur {TITLES.length}</span>
      </div>
      <div className="mx-auto max-w-2xl px-5">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((step + 1) / TITLES.length) * 100}%` }} /></div>
      </div>

      <div className="mx-auto max-w-2xl px-5 pb-28 pt-10">
        <p className="text-sm font-medium text-brand-600">{TITLES[step]}</p>

        {step === 0 && (
          <Q title="Bonjour ! Comment vous appelez-vous ?" sub="On commence votre inscription. Vos réponses servent uniquement à adapter l'analyse; tout reste fictif et dans ce navigateur.">
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <Field label="Prénom"><input autoFocus className={inputCls} value={a.display_name} onChange={(e) => set({ display_name: e.target.value })} placeholder="Ex. Sarah" data-testid="name" /></Field>
              <Field label="Âge (facultatif)"><input type="number" className={inputCls} value={a.age ?? ""} onChange={(e) => set({ age: e.target.value ? +e.target.value : null })} placeholder="Ex. 34" /></Field>
            </div>
            <p className="mt-3 text-xs text-slate-500">Votre âge n'est jamais utilisé pour deviner combien de risque vous acceptez : seules vos réponses comptent.</p>
          </Q>
        )}

        {step === 1 && (
          <Q title={`Enchanté${a.display_name ? `, ${a.display_name}` : ""}. Que souhaitez-vous faire de cet argent ?`}>
            <div className="grid gap-3">
              <Choice icon={<Shield className="h-5 w-5" />} selected={a.objective === "preserve"} onClick={() => set({ objective: "preserve" })} title="Le protéger" desc="Éviter les pertes avant tout, même si ça rapporte peu." />
              <Choice icon={<Sprout className="h-5 w-5" />} selected={a.objective === "income"} onClick={() => set({ objective: "income" })} title="Le protéger avec un peu de croissance" desc="Stabilité d'abord, avec une petite part qui peut croître." />
              <Choice icon={<Scale className="h-5 w-5" />} selected={a.objective === "balanced"} onClick={() => set({ objective: "balanced" })} title="Le faire croître de façon équilibrée" desc="Un mélange de croissance et de stabilité." />
              <Choice icon={<Rocket className="h-5 w-5" />} selected={a.objective === "growth"} onClick={() => set({ objective: "growth" })} title="Le faire croître à long terme" desc="J'accepte des hauts et des bas importants pour viser plus de croissance." />
            </div>
          </Q>
        )}

        {step === 2 && (
          <Q title="Dans combien de temps aurez-vous besoin de cet argent ?" sub="Plus l'échéance est proche, moins on peut se permettre une forte baisse juste avant.">
            <div className="grid gap-3 sm:grid-cols-2">
              {[[2, "Moins de 3 ans", "Ex. achat d'une maison bientôt"], [5, "3 à 7 ans", "Projet à moyen terme"], [10, "7 à 12 ans", "Études des enfants, projet lointain"], [20, "Plus de 12 ans", "Retraite lointaine"]].map(([v, t, d]) => (
                <Choice key={v as number} selected={a.horizon_years === v} onClick={() => set({ horizon_years: v as number })} title={t} desc={d} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">ou précisément :
              <input type="number" min={1} max={60} className={clsx(inputCls, "w-24")} value={a.horizon_years ?? ""} onChange={(e) => set({ horizon_years: e.target.value ? +e.target.value : null })} /> ans
            </div>
          </Q>
        )}

        {step === 3 && (
          <Q title="Quelle baisse temporaire pourriez-vous traverser sans paniquer ?" sub={`Exemple sur ${cad(ex)} investis. Ces baisses arrivent réellement : en 2022, les actions et les obligations ont reculé en même temps.`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[0.1, 0.2, 0.3, 0.45].map((v) => (
                <Choice key={v} selected={a.max_decline === v} onClick={() => set({ max_decline: v })}
                  title={<span>−{Math.round(v * 100)} % <span className="font-normal text-slate-500">· il resterait {cad(ex * (1 - v))}</span></span>}
                  desc={v === 0.1 ? "Je supporte mal de voir mon argent baisser" : v === 0.2 ? "Une baisse modérée, ça va" : v === 0.3 ? "Je peux encaisser une forte baisse" : "Je peux voir mon placement presque divisé par deux"} />
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">À savoir : après −20 %, il faut +25 % pour revenir au point de départ; après −50 %, il faut +100 %.</p>
          </Q>
        )}

        {step === 4 && (
          <Q title="Vos placements perdent 20 % en un mois. Que faites-vous ?">
            <div className="grid gap-3">
              {[["sell_all", "Je vends tout pour arrêter les pertes"], ["sell_some", "Je vends une partie"], ["hold", "J'attends que ça remonte"], ["buy_more", "J'en profite pour investir davantage"]].map(([v, t]) => (
                <Choice key={v} selected={a.drop_reaction === v} onClick={() => set({ drop_reaction: v })} title={t} />
              ))}
            </div>
          </Q>
        )}

        {step === 5 && (
          <Q title="Votre situation" sub="Elle détermine votre capacité à absorber une perte. Vous pouvez répondre « Je ne sais pas » : on le signalera comme une incertitude, sans rien deviner.">
            <div className="space-y-5">
              <Row label="Avez-vous un revenu stable ?"><YesNo value={a.stable_income} onChange={(v) => set({ stable_income: v })} /></Row>
              <Row label="Avez-vous une épargne d'urgence (3 à 6 mois de dépenses) à part ?"><YesNo value={a.emergency_reserve} onChange={(v) => set({ emergency_reserve: v })} /></Row>
              <Row label="Des personnes dépendent-elles de vous financièrement ?"><YesNo value={a.dependants} onChange={(v) => set({ dependants: v })} /></Row>
              <Row label="Pourriez-vous avoir besoin de retirer cet argent rapidement ?">
                <div className="flex flex-wrap gap-1.5">{[["low", "Peu probable"], ["moderate", "Possible"], ["high", "Probable"]].map(([v, l]) => <Pill key={v} on={a.liquidity_needs === v} onClick={() => set({ liquidity_needs: v })}>{l}</Pill>)}</div>
              </Row>
              <Row label="Votre expérience en placement">
                <div className="flex flex-wrap gap-1.5">{[["none", "Aucune"], ["beginner", "Débutant"], ["intermediate", "Intermédiaire"], ["advanced", "Avancée"]].map(([v, l]) => <Pill key={v} on={a.experience === v} onClick={() => set({ experience: v })}>{l}</Pill>)}</div>
              </Row>
            </div>
          </Q>
        )}

        {step === 6 && (
          <Q title="Vos préférences">
            <div className="space-y-6">
              <Row label="Les cryptoactifs (Bitcoin, Ether) vous intéressent-ils ?">
                <div className="flex flex-wrap gap-1.5">{[["no", "Non"], ["maybe", "Un peu, avec prudence"], ["yes", "Oui"]].map(([v, l]) => <Pill key={v} on={a.crypto_interest === v} onClick={() => set({ crypto_interest: v })}>{l}</Pill>)}</div>
              </Row>
              <Choice icon={<Leaf className="h-5 w-5" />} selected={a.esg_preference} onClick={() => set({ esg_preference: !a.esg_preference })} title="Les critères environnementaux et sociaux (ESG) comptent pour moi"
                desc="Nous ne qualifierons jamais une entreprise de « controversée » sans source fiable." />
              <Row label="Ce qui vous intéresse (facultatif)">
                <div className="flex flex-wrap gap-1.5">{INTERESTS.map((x) => <Pill key={x} on={a.interests.includes(x)} onClick={() => toggle("interests", x)}>{x}</Pill>)}</div>
              </Row>
              <Row label="Secteurs à éviter (facultatif)">
                <div className="flex flex-wrap gap-1.5">{SECTORS.map(([v, l]) => <Pill key={v} on={a.excluded_sectors.includes(v)} onClick={() => toggle("excluded_sectors", v)}>{l}</Pill>)}</div>
              </Row>
            </div>
          </Q>
        )}

        {step === 7 && (
          <Q title={`Voici votre profil${a.display_name ? `, ${a.display_name}` : ""}`} sub="Calculé uniquement à partir de vos réponses, avec des règles affichées ci-dessous. Vous pourrez le modifier à tout moment.">
            {!preview && !error && <Spinner label="Calcul de votre profil…" />}
            <ErrorBox error={error} />
            {preview && <ProfileSummary p={preview} />}
          </Q>
        )}

        {step === 8 && saved && (
          <Q title="Avez-vous déjà des placements ?" sub="Si oui, ajoutez-les : nous les analyserons par rapport au profil que vous venez de créer.">
            {hasPortfolio === null && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice selected={false} onClick={() => setHasPortfolio(true)} title="Oui, je les ajoute" desc="Saisie rapide ou fichier CSV" />
                <Choice selected={false} onClick={() => setHasPortfolio(false)} title="Non, je pars de zéro" desc="Construisez un portefeuille d'essai pour apprendre" />
              </div>
            )}
            {hasPortfolio === true && <HoldingsEditor personaId={saved.persona_id} submitLabel="Analyser mon portefeuille" onSaved={finish} />}
            {hasPortfolio === false && (
              <div className="space-y-4">
                <Notice>Aucun souci. Ajoutez quelques placements d'essai (montants fictifs) pour voir comment ils s'accordent avec votre profil, ou passez cette étape et explorez d'abord.</Notice>
                <HoldingsEditor personaId={saved.persona_id} name="Portefeuille d'essai" submitLabel="Analyser ce portefeuille d'essai" onSaved={finish} />
                <Button variant="ghost" onClick={() => finish()}>Passer pour l'instant</Button>
              </div>
            )}
          </Q>
        )}
      </div>

      {step < 8 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
            <Button variant="ghost" onClick={() => (step === 0 ? nav(editing ? "/profil" : "/") : setStep(step - 1))}><ArrowLeft className="h-4 w-4" /> Retour</Button>
            {step < 7 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!valid} data-testid="next">Continuer <ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={confirm} disabled={!preview || busy} data-testid="confirm"><Check className="h-4 w-4" /> {busy ? "Enregistrement…" : "C'est bien moi, continuer"}</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Q({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="mt-2 text-2xl font-semibold leading-snug tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      {sub && <p className="mt-2 text-slate-500">{sub}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="mb-2 text-sm font-medium text-slate-800">{label}</div>{children}</div>;
}
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={clsx("rounded-full px-3.5 py-1.5 text-sm font-medium transition", on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{children}</button>;
}

/** Plain-language profile: level, the rules that produced it, and the limits AEGIS will check. Reused on the profile page. */
export function ProfileSummary({ p }: { p: any }) {
  const b = p.budget;
  const limits = [
    ["Part en actions et cryptos (croissance)", `entre ${pct(b.growth_min, 0)} et ${pct(b.growth_max, 0)}`, "Le reste en placements plus stables (obligations, or…)."],
    ["Maximum dans une seule entreprise", pct(b.max_single_issuer, 0), "Une seule entreprise peut perdre beaucoup, voire tout."],
    ["Maximum dans un seul secteur", pct(b.max_single_sector, 0), "Les titres d'un même secteur chutent souvent ensemble."],
    ["Maximum en placements spéculatifs (crypto)", pct(b.max_speculative, 0), "Argent que l'on doit pouvoir perdre."],
    ["Seuil de revue si le portefeuille baisse de", pct(-b.drawdown_review, 0), "Vous serez alerté pour revoir la situation, pas pour vendre."],
  ];
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white">
        <div className="text-sm text-brand-100">Niveau de risque</div>
        <div className="mt-1 text-3xl font-semibold">{p.risk_profile_label}</div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-white/15 px-3 py-1">{p.objective}</span>
          <span className="rounded-full bg-white/15 px-3 py-1">Horizon {p.horizon_years_min} ans</span>
          <span className="rounded-full bg-white/15 px-3 py-1">Baisse tolérée {pct(p.stated_max_decline, 0)}</span>
        </div>
      </div>
      {p.derivation?.length > 0 && (
        <div className="rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900">Pourquoi ce niveau ?</h3>
          <ol className="mt-3 space-y-2">
            {p.derivation.map((d: string, i: number) => (
              <li key={i} className="flex gap-3 text-sm text-slate-700"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>{d}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900">Les limites que nous vérifierons pour vous</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {limits.map(([l, v, d]) => (
            <div key={l} className="flex items-start justify-between gap-4 py-2.5">
              <div><div className="text-sm text-slate-800">{l}</div><div className="text-xs text-slate-500">{d}</div></div>
              <Badge tone="info" className="shrink-0">{v}</Badge>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Comparé à : {p.benchmark_label}. Ces limites sont des repères pédagogiques versionnés, pas une règle réglementaire.</p>
      </div>
      {p.uncertainties?.length > 0 && <Notice tone="warn" title="Informations manquantes">{p.uncertainties.join(" · ")}</Notice>}
    </div>
  );
}
