import clsx from "clsx";
import { ArrowLeft, ArrowRight, Brain, Check, CheckCircle2, Heart, Leaf, Minus, Plus, Rocket, Scale, Shield, Sprout, UserRound, Wallet, XCircle } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdvisorAvatar, ADVISOR_NAME } from "../components/Advisor";
import { Logo } from "../components/Layout";
import { Button, Choice, ErrorBox, Explain, inputCls, Spinner } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { motion } from "framer-motion";
import { Glass, softSpring, Stagger, StaggerItem } from "../components/motion";
import { cad, pct } from "../lib/format";
import { api, ApiError } from "../services/api";

// « Connaître son client » : the interview a bank advisor would do, one question at a time.
export type A = Record<string, any>;
export const EMPTY: A = {
  display_name: "", age: null, household: null, dependants_count: 0, employment: null, income_outlook: null,
  income_net_monthly: null, expenses_monthly: null, savings_cad: null, investments_cad: null, credit_card_debt_cad: 0, other_debt_cad: 0,
  home_owner: null, capital_cad: null, knowledge_self: null, products_held: [], quiz_diversification: null, quiz_bonds: null, quiz_inflation: null,
  objective: "", horizon_years: null, liquidity_needs: null, portfolio_choice: null, max_decline: null, gamble: null, drop_reaction: "",
  volatility_feeling: null, past_behavior: null, crypto_interest: "", esg_preference: false, interests: [], excluded_sectors: [],
};

export const SECTIONS = [
  { id: "vous", label: "Vous", icon: UserRound },
  { id: "finances", label: "Vos finances", icon: Wallet },
  { id: "savoir", label: "Vos connaissances", icon: Brain },
  { id: "risque", label: "Vous et le risque", icon: Heart },
  { id: "prefs", label: "Vos préférences", icon: Leaf },
];

type Step = { section: string; id: string; valid: (a: A) => boolean };
export const STEPS: Step[] = [
  { section: "vous", id: "name", valid: (a) => a.display_name.trim().length > 0 && (a.age === null || (a.age >= 16 && a.age <= 110)) },
  { section: "vous", id: "household", valid: (a) => !!a.household },
  { section: "vous", id: "work", valid: (a) => !!a.employment && !!a.income_outlook },
  { section: "finances", id: "budget", valid: (a) => a.income_net_monthly !== null && a.expenses_monthly !== null },
  { section: "finances", id: "savings", valid: (a) => a.savings_cad !== null },
  { section: "finances", id: "debts", valid: (a) => a.home_owner !== null },
  { section: "finances", id: "assets", valid: (a) => a.investments_cad !== null },
  { section: "savoir", id: "knowledge", valid: (a) => !!a.knowledge_self },
  { section: "savoir", id: "quiz_diversification", valid: (a) => !!a.quiz_diversification },
  { section: "savoir", id: "quiz_bonds", valid: (a) => !!a.quiz_bonds },
  { section: "savoir", id: "quiz_inflation", valid: (a) => !!a.quiz_inflation },
  { section: "risque", id: "objective", valid: (a) => !!a.objective },
  { section: "risque", id: "horizon", valid: (a) => !!a.horizon_years && !!a.liquidity_needs },
  { section: "risque", id: "portfolio", valid: (a) => !!a.portfolio_choice },
  { section: "risque", id: "decline", valid: (a) => !!a.max_decline },
  { section: "risque", id: "gamble", valid: (a) => !!a.gamble },
  { section: "risque", id: "reaction", valid: (a) => !!a.drop_reaction },
  { section: "risque", id: "feeling", valid: (a) => !!a.volatility_feeling },
  { section: "risque", id: "past", valid: (a) => !!a.past_behavior },
  { section: "prefs", id: "prefs", valid: (a) => !!a.crypto_interest },
  { section: "prefs", id: "result", valid: () => true },
];

const QUIZ: Record<string, { q: string; options: [string, string][]; good: string; why: string }> = {
  quiz_diversification: { q: "Selon vous, qu'est-ce qui est le plus risqué ?", good: "b",
    options: [["a", "Un fonds qui regroupe 500 grandes entreprises"], ["b", "Les actions d'une seule entreprise"], ["c", "C'est pareil"]],
    why: "Une seule entreprise peut perdre beaucoup, voire faire faillite. Dans un fonds de 500 entreprises, une mauvaise nouvelle pèse peu : c'est la diversification." },
  quiz_bonds: { q: "Si les taux d'intérêt montent, la valeur des obligations que vous détenez déjà…", good: "a",
    options: [["a", "Baisse"], ["b", "Monte"], ["c", "Ne change pas"]],
    why: "Les nouvelles obligations paient plus d'intérêt : les anciennes, moins intéressantes, perdent de la valeur. C'est ce qui s'est passé en 2022." },
  quiz_inflation: { q: "Votre compte rapporte 1 % par année et l'inflation est de 3 %. Après un an, avec cet argent, vous pouvez acheter…", good: "c",
    options: [["a", "Plus qu'avant"], ["b", "Autant qu'avant"], ["c", "Moins qu'avant"]],
    why: "Les prix montent plus vite que votre argent : vous perdez du pouvoir d'achat. Laisser dormir son argent a aussi un coût." },
};

export default function Onboarding() {
  const nav = useNavigate();
  const { me, reload } = useApp();
  const editing = !!me?.onboarded;
  const [a, setA] = useState<A>(() => ({ ...EMPTY, ...(me?.answers || {}) }));
  const [i, setI] = useState(0);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const set = (p: A) => setA((x) => ({ ...x, ...p }));
  const step = STEPS[i];
  const secIndex = SECTIONS.findIndex((s) => s.id === step.section);

  useEffect(() => {
    if (step.id !== "result") return;
    setPreview(null);
    setError(null);
    api.post("/onboarding/preview", payload(a)).then(setPreview).catch(setError);
  }, [step.id]); // eslint-disable-line

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      await api.post("/onboarding", payload(a));
      await reload();
      nav(editing ? "/profil" : "/");
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  };
  const next = () => { setI(Math.min(STEPS.length - 1, i + 1)); window.scrollTo({ top: 0 }); };
  const back = () => (i === 0 ? nav(editing ? "/profil" : "/") : setI(i - 1));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="sticky top-0 z-20 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-5">
          <Logo />
          <div className="flex items-center gap-1.5">
            {SECTIONS.map((sct, k) => <span key={sct.id} title={sct.label} className={clsx("h-1.5 rounded-full transition-all", k < secIndex ? "w-6 bg-ink" : k === secIndex ? "w-10 bg-ink" : "w-6 bg-line")} />)}
          </div>
        </div>
        <div className="h-px bg-line"><div className="h-px bg-ink transition-all" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-2xl px-5 pt-6 text-sm text-ink-muted">{SECTIONS[secIndex].label}</div>
        <div className="mx-auto w-full max-w-2xl flex-1 px-5 pb-32 pt-3">
          <StepView id={step.id} a={a} set={set} preview={preview} error={error} />
        </div>
        <div className="sticky bottom-0 border-t border-line bg-white">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
            <Button variant="ghost" onClick={back}><ArrowLeft className="h-4 w-4" /> Retour</Button>
            <span className="hidden text-xs text-ink-muted sm:block">Question {Math.min(i + 1, STEPS.length - 1)} sur {STEPS.length - 1}</span>
            {step.id !== "result" ? (
              <Button onClick={next} disabled={!step.valid(a)} data-testid="next">Continuer <ArrowRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={confirm} disabled={!preview || busy} data-testid="confirm"><Check className="h-4 w-4" /> {busy ? "Enregistrement…" : "C'est bien moi"}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function payload(a: A) {
  const n = (v: any) => (v === null || v === "" || v === undefined ? null : +v);
  return {
    ...a, age: n(a.age), dependants_count: n(a.dependants_count) ?? 0, income_net_monthly: n(a.income_net_monthly), expenses_monthly: n(a.expenses_monthly),
    savings_cad: n(a.savings_cad), investments_cad: n(a.investments_cad), credit_card_debt_cad: n(a.credit_card_debt_cad) ?? 0,
    other_debt_cad: n(a.other_debt_cad) ?? 0, capital_cad: n(a.capital_cad), horizon_years: n(a.horizon_years),
    stable_income: null, emergency_reserve: null, dependants: null, experience: null,
  };
}

// ------------------------------------------------------------------------------------------------ one question per screen
export function StepView({ id, a, set, preview, error }: { id: string; a: A; set: (p: A) => void; preview: any; error: ApiError | null }) {
  const first = a.display_name ? `, ${a.display_name}` : "";
  switch (id) {
    case "name":
      return (
        <Q title={`Bonjour ! Je suis ${ADVISOR_NAME}. Comment vous appelez-vous ?`} why="Pour vous parler normalement. Votre âge sert seulement à situer vos projets (retraite, études) : jamais à deviner le risque que vous acceptez.">
          <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
            <L label="Prénom"><input autoFocus className={inputCls} value={a.display_name} onChange={(e) => set({ display_name: e.target.value })} placeholder="Ex. Sarah" data-testid="name" /></L>
            <L label="Âge (facultatif)"><input type="number" className={inputCls} value={a.age ?? ""} onChange={(e) => set({ age: e.target.value ? +e.target.value : null })} /></L>
          </div>
        </Q>
      );
    case "household":
      return (
        <Q title={`Enchantée${first}. Quelle est votre situation familiale ?`} why="Si d'autres personnes comptent sur vous, une perte ou une dépense imprévue vous touche plus durement.">
          <Grid>{[["single", "Seul(e)"], ["couple", "En couple"], ["couple_kids", "En couple avec enfant(s)"], ["single_parent", "Parent seul(e)"]].map(([v, l]) =>
            <Choice key={v} selected={a.household === v} onClick={() => set({ household: v })} title={l} />)}</Grid>
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-line bg-white p-4">
            <div><div className="font-semibold text-ink">Personnes à votre charge</div><div className="text-sm text-ink-soft">Enfants, parent, conjoint sans revenu…</div></div>
            <Counter value={a.dependants_count ?? 0} onChange={(v) => set({ dependants_count: v })} />
          </div>
        </Q>
      );
    case "work":
      return (
        <Q title="Et côté travail ?" why="Un revenu stable vous permet de traverser une baisse des marchés sans devoir vendre vos placements pour payer vos factures.">
          <Grid>{[["permanent", "Emploi permanent"], ["contract", "Contrat ou emploi temporaire"], ["self_employed", "Travailleur autonome"], ["student", "Aux études"], ["unemployed", "Sans emploi"], ["retired", "À la retraite"]].map(([v, l]) =>
            <Choice key={v} selected={a.employment === v} onClick={() => set({ employment: v })} title={l} />)}</Grid>
          <Sub>Dans les prochaines années, votre revenu devrait…</Sub>
          <Pills value={a.income_outlook} onChange={(v) => set({ income_outlook: v })} options={[["up", "Augmenter"], ["stable", "Rester stable"], ["down", "Baisser"], ["uncertain", "Je ne sais pas"]]} />
        </Q>
      );
    case "budget": {
      const m = a.income_net_monthly !== null && a.expenses_monthly !== null ? a.income_net_monthly - a.expenses_monthly : null;
      return (
        <Q title="Parlons de votre budget mensuel" why="Ce qui reste à la fin du mois, c'est ce que vous pouvez investir régulièrement. Pas besoin d'être précis à l'unité : un ordre de grandeur suffit.">
          <div className="grid gap-4 sm:grid-cols-2">
            <L label="Ce que vous gagnez par mois, après impôts"><Money value={a.income_net_monthly} onChange={(v) => set({ income_net_monthly: v })} testid="income" /></L>
            <L label="Ce que vous dépensez par mois (loyer, épicerie, transport…)"><Money value={a.expenses_monthly} onChange={(v) => set({ expenses_monthly: v })} testid="expenses" /></L>
          </div>
          {m !== null && (
            <Insight tone={m > 0 ? "good" : "bad"}>{m > 0 ? <>Il vous reste environ <b>{cad(m)}</b> par mois. C'est votre capacité d'épargne.</> : <>Vous dépensez tout ce que vous gagnez. On en tiendra compte : il faudra d'abord dégager une marge.</>}</Insight>
          )}
        </Q>
      );
    }
    case "savings": {
      const months = a.savings_cad !== null && a.expenses_monthly ? a.savings_cad / a.expenses_monthly : null;
      return (
        <Q title="Combien avez-vous de côté, disponible rapidement ?" why="C'est votre coussin de sécurité. Sans lui, une dépense imprévue (perte d'emploi, réparation) pourrait vous forcer à vendre vos placements au pire moment.">
          <L label="Compte d'épargne, compte chèques, CELI en liquidités…"><Money value={a.savings_cad} onChange={(v) => set({ savings_cad: v })} testid="savings" /></L>
          {months !== null && (
            <Insight tone={months >= 3 ? "good" : "warn"}>Cela représente <b>{months.toFixed(1).replace(".", ",")} mois</b> de dépenses. {months >= 3 ? "Bon coussin." : "On recommande au moins 3 à 6 mois avant d'investir en bourse."}</Insight>
          )}
        </Q>
      );
    }
    case "debts":
      return (
        <Q title="Avez-vous des dettes ?" why="Une dette de carte de crédit coûte environ 20 % d'intérêt par année : aucun placement ne rapporte autant de façon sûre. La rembourser passe avant tout.">
          <div className="grid gap-4 sm:grid-cols-2">
            <L label="Solde de carte de crédit que vous ne remboursez pas chaque mois"><Money value={a.credit_card_debt_cad} onChange={(v) => set({ credit_card_debt_cad: v })} testid="cc" /></L>
            <L label="Autres dettes (auto, études, marge de crédit) — hors hypothèque"><Money value={a.other_debt_cad} onChange={(v) => set({ other_debt_cad: v })} /></L>
          </div>
          <Sub>Êtes-vous propriétaire de votre logement ?</Sub>
          <Pills value={a.home_owner} onChange={(v) => set({ home_owner: v })} options={[[true, "Oui"], [false, "Non"]]} />
        </Q>
      );
    case "assets":
      return (
        <Q title="Avez-vous déjà des placements ?" why="Pour savoir quelle part de votre argent nous parlons, et éviter de tout mettre au même endroit.">
          <div className="grid gap-4 sm:grid-cols-2">
            <L label="Valeur de vos placements actuels (REER, CELI, fonds, actions…)"><Money value={a.investments_cad} onChange={(v) => set({ investments_cad: v })} testid="investments" /></L>
            <L label="Montant que vous pensez investir bientôt (facultatif)"><Money value={a.capital_cad} onChange={(v) => set({ capital_cad: v })} /></L>
          </div>
        </Q>
      );
    case "knowledge":
      return (
        <Q title="Comment décririez-vous vos connaissances en placement ?" why="Je n'utiliserai pas de jargon avec vous, et je ne vous proposerai pas de produits complexes avant que vous soyez à l'aise.">
          <Grid>{[["none", "Aucune", "Je n'y connais rien, et c'est correct"], ["basic", "De base", "Je connais les grands principes"], ["good", "Bonnes", "Je suis les marchés, je comprends les risques"], ["expert", "Très bonnes", "C'est mon domaine"]].map(([v, l, d]) =>
            <Choice key={v} selected={a.knowledge_self === v} onClick={() => set({ knowledge_self: v })} title={l} desc={d} />)}</Grid>
          <Sub>Qu'avez-vous déjà détenu ? (plusieurs choix)</Sub>
          <Pills multi value={a.products_held} onChange={(v) => set({ products_held: v })}
            options={[["savings", "Compte épargne"], ["gic", "CPG"], ["mutual_funds", "Fonds communs"], ["etf", "FNB"], ["stocks", "Actions"], ["crypto", "Cryptos"], ["options", "Options"]]} />
        </Q>
      );
    case "quiz_diversification": case "quiz_bonds": case "quiz_inflation": {
      const qz = QUIZ[id];
      const ans = a[id];
      const n = id === "quiz_diversification" ? 1 : id === "quiz_bonds" ? 2 : 3;
      return (
        <Q kicker={`Petit quiz · ${n} sur 3`} title={qz.q} why="Pas de piège, ni de mauvaise note : ça m'aide à savoir à quel point vous expliquer les choses.">
          <div className="grid gap-3">
            {qz.options.map(([v, l]) => {
              const chosen = ans === v;
              const show = !!ans;
              return (
                <button key={v} type="button" onClick={() => set({ [id]: v })} data-testid={`${id}-${v}`}
                  className={clsx("flex items-center justify-between rounded-2xl border p-4 text-left font-semibold transition",
                    show && v === qz.good ? "border-gain-500 bg-gain-50 text-gain-700" : chosen ? "border-accent-600 bg-accent-50 text-accent-700" : "border-line bg-white text-ink hover:border-brand-300")}>
                  {l}{show && v === qz.good ? <CheckCircle2 className="h-5 w-5" /> : chosen ? <XCircle className="h-5 w-5" /> : null}
                </button>
              );
            })}
          </div>
          {ans && <Insight tone={ans === qz.good ? "good" : "info"}><b>{ans === qz.good ? "Exact ! " : "Pas tout à fait. "}</b>{qz.why}</Insight>}
        </Q>
      );
    }
    case "objective":
      return (
        <Q title="Que souhaitez-vous surtout faire de cet argent ?" why="Votre objectif fixe une limite : si vous voulez avant tout protéger votre argent, je ne vous proposerai pas un portefeuille agressif.">
          <div className="grid gap-3">
            <Choice icon={<Shield className="h-5 w-5" />} selected={a.objective === "preserve"} onClick={() => set({ objective: "preserve" })} title="Le protéger" desc="Éviter les pertes avant tout, même si ça rapporte peu." />
            <Choice icon={<Sprout className="h-5 w-5" />} selected={a.objective === "income"} onClick={() => set({ objective: "income" })} title="Le protéger avec un peu de croissance" desc="Stabilité d'abord, avec une petite part qui peut croître." />
            <Choice icon={<Scale className="h-5 w-5" />} selected={a.objective === "balanced"} onClick={() => set({ objective: "balanced" })} title="Le faire croître de façon équilibrée" desc="Un mélange de croissance et de stabilité." />
            <Choice icon={<Rocket className="h-5 w-5" />} selected={a.objective === "growth"} onClick={() => set({ objective: "growth" })} title="Le faire croître à long terme" desc="J'accepte des hauts et des bas importants pour viser plus." />
          </div>
        </Q>
      );
    case "horizon":
      return (
        <Q title="Quand allez-vous retirer cet argent ?" why="Plus vous avez de temps devant vous, plus vous pouvez accepter des hauts et des bas : après une baisse, les marchés ont le temps de remonter. Si vous en avez besoin bientôt, on reste prudent.">
          <div className="grid gap-3">{([[2, "Bientôt, dans moins de 3 ans", "Ex. une mise de fonds, une auto, un voyage · on restera prudent"],
            [5, "Dans 3 à 7 ans", "Ex. un projet à moyen terme · risque faible à modéré"],
            [10, "Dans 7 à 12 ans", "Ex. les études des enfants · risque modéré possible"],
            [20, "Dans plus de 12 ans", "Ex. la retraite, faire fructifier à long terme · risque élevé possible"]] as [number, string, string][]).map(([v, l, d]) =>
            <Choice key={v} selected={a.horizon_years === v} onClick={() => set({ horizon_years: v })} title={l} desc={d} />)}</div>
          <Sub>Pourriez-vous avoir besoin d'en retirer une partie à l'improviste ?</Sub>
          <Pills value={a.liquidity_needs} onChange={(v) => set({ liquidity_needs: v })} options={[["low", "Peu probable"], ["moderate", "Possible"], ["high", "Probable"]]} />
        </Q>
      );
    case "portfolio":
      return (
        <Q title="Vous investissez 10 000 $. Lequel de ces placements choisiriez-vous ?" why="Plus on peut gagner, plus on peut perdre : c'est toujours vrai. Choisissez celui avec lequel vous dormiriez bien.">
          <div className="grid gap-3">
            {([["A", 6, -3], ["B", 12, -9], ["C", 20, -18], ["D", 30, -32]] as [string, number, number][]).map(([v, best, worst]) => (
              <button key={v} type="button" onClick={() => set({ portfolio_choice: v })} data-testid={`portfolio-${v}`}
                className={clsx("rounded-2xl border p-4 text-left transition", a.portfolio_choice === v ? "border-brand-800 bg-brand-50 ring-2 ring-brand-800" : "border-line bg-white hover:border-brand-300")}>
                <div className="flex items-center gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-800 font-semibold text-white">{v}</span>
                  <div className="grid flex-1 grid-cols-[1fr_1fr] items-center gap-0">
                    <div className="flex justify-end pr-1"><div className="h-3 rounded-l-full bg-accent-600" style={{ width: `${(-worst / 32) * 100}%` }} /></div>
                    <div className="flex border-l-2 border-ink-muted/40 pl-1"><div className="h-3 rounded-r-full bg-gain-600" style={{ width: `${(best / 32) * 100}%` }} /></div>
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-xs sm:text-sm" style={{ paddingLeft: 52 }}>
                  <span className="text-accent-700">Pire année : <b>{cad(10000 * (1 + worst / 100))}</b> ({worst} %)</span>
                  <span className="text-gain-700">Meilleure année : <b>{cad(10000 * (1 + best / 100))}</b> (+{best} %)</span>
                </div>
              </button>
            ))}
          </div>
        </Q>
      );
    case "decline":
      return (
        <Q title="Quelle baisse temporaire pourriez-vous traverser sans paniquer ?" why="Ces baisses arrivent vraiment : en 2022, les actions et les obligations ont reculé en même temps. Ce qui compte, c'est de ne pas vendre au plus bas.">
          <Grid>{[0.1, 0.2, 0.3, 0.45].map((v) => (
            <Choice key={v} selected={a.max_decline === v} onClick={() => set({ max_decline: v })}
              title={<span>−{Math.round(v * 100)} % <span className="font-normal text-ink-soft">· il resterait {cad(10000 * (1 - v))}</span></span>}
              desc={v === 0.1 ? "Je supporte mal de voir mon argent baisser" : v === 0.2 ? "Une baisse modérée, ça va" : v === 0.3 ? "Je peux encaisser une forte baisse" : "Je peux voir mon placement presque divisé par deux"} />
          ))}</Grid>
        </Q>
      );
    case "gamble":
      return (
        <Q title="On vous propose un choix. Lequel prenez-vous ?" why="Ce petit jeu révèle votre rapport au risque mieux qu'une question directe.">
          <div className="grid gap-3">
            <Choice selected={a.gamble === "sure"} onClick={() => set({ gamble: "sure" })} title="Recevoir 1 000 $, garanti" />
            <Choice selected={a.gamble === "small_risk"} onClick={() => set({ gamble: "small_risk" })} title="90 % de chances de recevoir 1 200 $, sinon rien" />
            <Choice selected={a.gamble === "big_risk"} onClick={() => set({ gamble: "big_risk" })} title="50 % de chances de recevoir 2 500 $, sinon rien" />
          </div>
        </Q>
      );
    case "reaction":
      return (
        <Q title="Vos placements perdent 20 % en un mois. Que faites-vous ?" why="Ce que vous feriez vraiment compte plus que ce que vous dites accepter. Soyez honnête : il n'y a pas de bonne réponse.">
          <div className="grid gap-3">{[["sell_all", "Je vends tout pour arrêter les pertes"], ["sell_some", "Je vends une partie"], ["hold", "J'attends que ça remonte"], ["buy_more", "J'en profite pour investir davantage"]].map(([v, l]) =>
            <Choice key={v} selected={a.drop_reaction === v} onClick={() => set({ drop_reaction: v })} title={l} />)}</div>
        </Q>
      );
    case "feeling":
      return (
        <Q title="Vos placements montent et descendent de 5 % en une semaine. Vous vous sentez…" why="Un portefeuille qui vous empêche de dormir finit souvent par être vendu au mauvais moment.">
          <Grid>{[["anxious", "Très stressé(e)"], ["uneasy", "Mal à l'aise"], ["ok", "Serein(e), c'est normal"], ["excited", "Enthousiaste : des occasions !"]].map(([v, l]) =>
            <Choice key={v} selected={a.volatility_feeling === v} onClick={() => set({ volatility_feeling: v })} title={l} />)}</Grid>
        </Q>
      );
    case "past":
      return (
        <Q title="En mars 2020 et en 2022, les marchés ont fortement baissé. Qu'avez-vous fait ?" why="Votre comportement passé est le meilleur indice de votre comportement futur.">
          <div className="grid gap-3">{[["sold", "J'ai vendu une partie ou tout"], ["held", "J'ai attendu sans rien toucher"], ["bought", "J'ai acheté davantage"], ["none", "Je n'avais pas de placements à ce moment-là"]].map(([v, l]) =>
            <Choice key={v} selected={a.past_behavior === v} onClick={() => set({ past_behavior: v })} title={l} />)}</div>
        </Q>
      );
    case "prefs":
      return (
        <Q title="Dernière étape : vos préférences" why="Votre argent, vos valeurs. Je n'investirai jamais dans un secteur que vous voulez éviter.">
          <Sub first>Les cryptoactifs (Bitcoin, Ether) vous intéressent-ils ?</Sub>
          <Pills value={a.crypto_interest} onChange={(v) => set({ crypto_interest: v })} options={[["no", "Non"], ["maybe", "Un peu, avec prudence"], ["yes", "Oui"]]} />
          <div className="mt-5"><Choice icon={<Leaf className="h-5 w-5" />} selected={a.esg_preference} onClick={() => set({ esg_preference: !a.esg_preference })} title="Les critères environnementaux et sociaux (ESG) comptent pour moi" /></div>
          <Sub>Ce qui vous intéresse (facultatif)</Sub>
          <Pills multi value={a.interests} onChange={(v) => set({ interests: v })} options={["Technologie et IA", "Entreprises canadiennes", "Dividendes stables", "Énergie", "Santé", "Or"].map((x) => [x, x])} />
          <Sub>Secteurs à éviter (facultatif)</Sub>
          <Pills multi value={a.excluded_sectors} onChange={(v) => set({ excluded_sectors: v })} options={[["Energy", "Pétrole et gaz"], ["Information Technology", "Technologies"], ["Cryptoassets", "Cryptoactifs"], ["Financials", "Banques et assurances"]]} />
        </Q>
      );
    case "result":
      return <Result p={preview} error={error} name={a.display_name} />;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ « voici ce que je retiens de vous »
const MEANING: Record<string, string> = {
  Prudent: "Vous protégez votre argent avant tout. Vos placements bougeront peu, et rapporteront moins.",
  "Faible à modéré": "Surtout de la stabilité, avec une petite part qui peut croître.",
  Modéré: "Un équilibre entre stabilité et croissance, avec des hauts et des bas modérés.",
  Élevé: "La croissance à long terme, en acceptant de fortes baisses temporaires.",
};
const LEVEL_SCALE = ["Prudent", "Faible à modéré", "Modéré", "Élevé"];
const KNOW_SCALE = ["Débutant", "Débutant", "Intermédiaire", "Avancé"];

/** The profile as pictures: the level on its scale, the three measures (the lowest decides), the situation, what it means for the money. */
export function Result({ p, error, name, action }: { p: any; error?: ApiError | null; name?: string; action?: ReactNode }) {
  if (error) return <ErrorBox error={error} />;
  if (!p) return <Spinner label="J'analyse vos réponses…" />;
  const k = p.kyc;
  const s = k?.snapshot || {};
  const level = Math.max(0, LEVEL_SCALE.indexOf(p.risk_profile_label));
  const b = p.budget;
  const lowered = (r: string) => r.includes("→");
  const measures = k ? [
    { key: "tol", label: "Ce que vous êtes prêt à risquer", value: k.tolerance.index, text: k.tolerance.level, binding: k.binding.includes("tolérance"),
      reasons: (k.tolerance.reasons || []).filter((r: string) => r.includes("compte plus")) },
    { key: "cap", label: "Ce que votre situation permet", value: k.capacity.index, text: k.capacity.level, binding: k.binding.includes("capacité"),
      reasons: (k.capacity.reasons || []).filter(lowered) },
    ...(k.knowledge.level ? [{ key: "know", label: "Ce que vous connaissez", value: k.knowledge.index === 0 ? 1 : k.knowledge.index === 1 ? 2 : 3, text: k.knowledge.level,
      binding: k.binding === "connaissances", reasons: [], scale: KNOW_SCALE, hint: `quiz ${k.knowledge.quiz_correct}/${k.knowledge.quiz_total}` }] : []),
  ] : [];
  return (
    <div className="space-y-10" data-testid="kyc-result">
      {/* 1. the level */}
      <Glass className="p-6 sm:p-8" glow>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><AdvisorAvatar size={36} /><p className="text-sm text-ink-muted">Voici ce que je retiens de vous{name ? `, ${name}` : ""}</p></div>
          {action}
        </div>
        <h1 className="mt-6 font-display text-[40px] font-semibold leading-none tracking-tightest text-ink sm:text-[52px]">Profil <span className="text-primary-600">{p.risk_profile_label.toLowerCase()}</span></h1>
        <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-ink-soft">{MEANING[p.risk_profile_label]}</p>
        <div className="mt-7 grid grid-cols-4 gap-1.5">
          {LEVEL_SCALE.map((l, i) => (
            <div key={l}>
              <motion.div className={clsx("h-2.5 rounded-full", i <= level ? "bg-primary-500" : "bg-ink/[0.07]")} style={{ originX: 0 }}
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...softSpring, delay: 0.15 + i * 0.08 }} />
              <div className={clsx("mt-2 text-xs", i === level ? "font-semibold text-ink" : "text-ink-muted")}>{l}</div>
            </div>
          ))}
        </div>
        <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-3">
          <Rule label="En actions" value={`${Math.round(b.growth_min * 100)}–${pct(b.growth_max, 0)}`} />
          <Rule label="1 entreprise" value={`max ${pct(b.max_single_issuer, 0)}`} />
          <Rule label="Cryptoactifs" value={b.max_speculative > 0 ? `max ${pct(b.max_speculative, 0)}` : "aucun"} />
        </div>
      </Glass>

      {/* 2. why this level */}
      {k && (
        <section>
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Pourquoi ce profil</h2>
          <p className="mt-1 text-sm text-ink-muted">Trois mesures. La plus basse décide, pour vous protéger.</p>
          <Stagger as="div" className="mt-5 space-y-2.5">
            {measures.map((m: any) => (
              <StaggerItem as="div" key={m.key} className={clsx("rounded-[20px] p-4 sm:p-5", m.binding ? "bg-surface hairline shadow-glow" : "bg-ink/[0.03]")}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-[15px] font-medium text-ink">{m.label}{m.hint && <span className="ml-1.5 text-xs font-normal text-ink-muted">{m.hint}</span>}</span>
                  <span className="flex items-center gap-2">
                    {m.binding && <span className="rounded-full bg-primary-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">C'est elle qui décide</span>}
                    <span className={clsx("text-sm font-semibold", m.binding ? "text-primary-600" : "text-ink")}>{m.text}</span>
                  </span>
                </div>
                <Dots value={m.value} active={m.binding} />
                {m.reasons.map((r: string) => (
                  <p key={r} className="mt-3 flex gap-2.5 text-sm leading-snug text-ink-soft"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />{shortReason(r)}</p>
                ))}
              </StaggerItem>
            ))}
            {(k.other_caps || []).map((r: string) => <p key={r} className="flex gap-2.5 px-1 text-sm text-ink-soft"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />{r}</p>)}
          </Stagger>
          {k.tolerance.note && <p className="mt-4 text-sm leading-relaxed text-ink-muted">{k.tolerance.note}</p>}
          {k.tolerance.index > k.capacity.index && (
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">Vous êtes prêt à risquer plus. Si votre situation change (par exemple un horizon plus long), votre profil peut monter.</p>
          )}
        </section>
      )}

      {/* 3. before investing */}
      {k?.before_investing?.length > 0 && (
        <section>
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Avant d'investir</h2>
          <Stagger as="ol" className="mt-4 space-y-2.5">
            {k.before_investing.map((st: any, n: number) => (
              <StaggerItem key={st.kind} className="flex gap-4 rounded-[20px] bg-ink/[0.03] p-4">
                <span className="tabular-nums grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{n + 1}</span>
                <div><div className="font-medium text-ink">{st.title}</div><div className="mt-0.5 text-sm leading-snug text-ink-muted">{st.text}</div></div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {/* 4. situation */}
      {k && Object.keys(s).length > 1 && (
        <section>
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Votre situation</h2>
          <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-[20px] hairline sm:grid-cols-4">
            {s.monthly_margin !== undefined && <Fig label="Marge par mois" value={cad(s.monthly_margin)} bad={s.monthly_margin <= 0} />}
            {s.emergency_months !== undefined && <Fig label="Coussin de sécurité" value={`${Math.round(s.emergency_months)} mois`} bad={s.emergency_months < 3} />}
            <Fig label="Dettes" value={cad(s.debts_cad)} bad={s.debts_cad > 0} />
            {s.net_worth_excl_home !== undefined && <Fig label="Avoir net (hors maison)" value={cad(s.net_worth_excl_home)} />}
          </div>
          <Explain label="Le détail de mon raisonnement">
            <ol className="list-decimal space-y-1 pl-4">{(p.derivation || []).map((d: string, n: number) => <li key={n}>{d}</li>)}</ol>
          </Explain>
        </section>
      )}
    </div>
  );
}

/** « Horizon de 2 ans : l'argent … → au plus « Prudent » » → the plain cause, without the arrow notation. */
const shortReason = (r: string) => r.replace(/\s*→\s*au plus « [^»]+ »/, "").replace(/\s*→\s*« [^»]+ »/, "").replace("an(s)", "ans");

function Rule({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-ink/[0.04] px-3 py-3 sm:px-4"><div className="text-xs text-ink-muted">{label}</div><div className="tabular-nums mt-0.5 whitespace-nowrap font-display text-base font-semibold tracking-tight text-ink sm:text-xl">{value}</div></div>;
}

function Dots({ value, active }: { value: number; active?: boolean }) {
  return (
    <div className="mt-3 grid grid-cols-4 gap-1">
      {[0, 1, 2, 3].map((n) => (
        <motion.span key={n} className={clsx("h-1.5 rounded-full", n <= value ? (active ? "bg-primary-500" : "bg-ink") : "bg-ink/[0.07]")} style={{ originX: 0 }}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...softSpring, delay: 0.2 + n * 0.05 }} />
      ))}
    </div>
  );
}

function Fig({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return <div className="border-line bg-surface/70 p-4 [&:not(:last-child)]:border-r"><div className="text-xs text-ink-muted">{label}</div><div className={clsx("tabular-nums mt-1 font-display text-xl font-semibold tracking-tight", bad ? "text-accent-700" : "text-ink")}>{value}</div></div>;
}

// ------------------------------------------------------------------------------------------------ small building blocks
function Q({ title, why, kicker, children }: { title: string; why?: string; kicker?: string; children: ReactNode }) {
  return (
    <div>
      {kicker && <p className="mb-2 text-sm text-ink-muted">{kicker}</p>}
      <h1 className="text-[26px] font-semibold leading-snug text-ink sm:text-[30px]">{title}</h1>
      {why && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{why}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}
const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
const L = ({ label, children }: { label: string; children: ReactNode }) => <label className="block"><span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>{children}</label>;
const Sub = ({ children, first }: { children: ReactNode; first?: boolean }) => <div className={clsx("mb-2 text-sm font-bold text-ink", first ? "" : "mt-6")}>{children}</div>;

function Insight({ tone, children }: { tone: "good" | "warn" | "bad" | "info"; children: ReactNode }) {
  return <div className={clsx("mt-5 rounded-xl border-l-2 bg-canvas px-4 py-3 text-sm text-ink", tone === "good" ? "border-gain-600" : tone === "warn" ? "border-gold-500" : tone === "bad" ? "border-accent-600" : "border-ink")}>{children}</div>;
}

function Money({ value, onChange, testid }: { value: number | null; onChange: (v: number | null) => void; testid?: string }) {
  return (
    <div className="flex items-center rounded-xl border border-line bg-white px-4 focus-within:border-ink">
      <input type="number" min={0} inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, +e.target.value))} data-testid={testid}
        className="tabular w-full bg-transparent py-3 text-xl font-semibold text-ink outline-none" />
      <span className="font-bold text-ink-muted">$</span>
    </div>
  );
}

function Counter({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-canvas" aria-label="Moins"><Minus className="h-4 w-4" /></button>
      <span className="tabular w-6 text-center text-lg font-bold text-brand-800">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(15, value + 1))} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:bg-canvas" aria-label="Plus"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function Pills({ value, onChange, options, multi }: { value: any; onChange: (v: any) => void; options: [any, string][]; multi?: boolean }) {
  const on = (v: any) => (multi ? (value || []).includes(v) : value === v);
  const click = (v: any) => (multi ? onChange(on(v) ? value.filter((x: any) => x !== v) : [...(value || []), v]) : onChange(v));
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" onClick={() => click(v)}
          className={clsx("rounded-full px-4 py-2 text-sm font-medium transition", on(v) ? "bg-ink text-white" : "border border-line bg-white text-ink hover:border-ink/30")}>{l}</button>
      ))}
    </div>
  );
}
