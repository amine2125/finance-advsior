import clsx from "clsx";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock, Lightbulb } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Meter, PageIn, Segmented, Stagger, StaggerItem } from "../components/motion";
import { Button } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { cad } from "../lib/format";
import { lessonById, LESSONS, Visual } from "../lib/lessons";
import { api } from "../services/api";

/** « Apprendre » : the lessons, with the reader's progress (kept with the account). */
export default function Learn() {
  const { me } = useApp();
  const done = new Set<string>(me?.guide?.lessons || []);
  return (
    <PageIn className="mx-auto max-w-3xl px-5 pb-16 pt-10">
      <div className="flex items-center gap-2 text-sm font-medium text-primary-600"><BookOpen className="h-4 w-4" /> Apprendre</div>
      <h1 className="mt-2 font-display text-[40px] font-semibold leading-[1.02] tracking-tightest text-ink sm:text-[48px]">Investir, expliqué simplement</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-soft">Sept leçons de 2 minutes, sans jargon. Commencez par le début : chacune s'appuie sur la précédente.</p>
      <div className="mt-6 flex items-center gap-3">
        <Meter value={done.size / LESSONS.length} tone="primary" className="w-48" />
        <span className="tabular-nums text-sm text-ink-muted">{done.size} sur {LESSONS.length} lues</span>
      </div>
      <Stagger as="div" className="mt-8 space-y-2.5" >
        {LESSONS.map((l, i) => (
          <StaggerItem as="div" key={l.id}>
            <Link to={`/apprendre/${l.id}`} className="flex items-center gap-4 rounded-[20px] bg-surface/80 p-4 transition-colors hairline hover:bg-white sm:p-5" data-testid={`lesson-${l.id}`}>
              <span className={clsx("tabular-nums grid h-10 w-10 shrink-0 place-items-center rounded-full font-display font-semibold",
                done.has(l.id) ? "bg-gain-600 text-white" : "bg-ink/[0.05] text-ink")}>
                {done.has(l.id) ? <Check className="h-5 w-5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{l.title}</span>
                <span className="block text-sm text-ink-muted">{l.short}</span>
              </span>
              <span className="hidden shrink-0 items-center gap-1 text-xs text-ink-muted sm:flex"><Clock className="h-3.5 w-3.5" />{l.minutes} min</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </PageIn>
  );
}

/** One lesson: text, a visual that shows the idea, the one thing to remember, then the next lesson. */
export function LessonPage() {
  const { id = "" } = useParams();
  const { me, reload } = useApp();
  const nav = useNavigate();
  const l = lessonById(id);
  const idx = LESSONS.findIndex((x) => x.id === id);
  const next = LESSONS[idx + 1];
  useEffect(() => {
    if (l && !(me?.guide?.lessons || []).includes(l.id)) api.post("/guide", { lecon_lue: l.id }).then(() => reload()).catch(() => undefined);
    window.scrollTo({ top: 0 });
  }, [id]); // eslint-disable-line
  if (!l) return <div className="mx-auto max-w-2xl px-5 py-10"><Link to="/apprendre" className="text-ink-muted">← Apprendre</Link></div>;
  return (
    <PageIn className="mx-auto max-w-2xl px-5 pb-16 pt-8" testid="lesson">
      <Link to="/apprendre" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Toutes les leçons</Link>
      <p className="mt-8 text-sm text-ink-muted">Leçon {idx + 1} sur {LESSONS.length} · {l.minutes} min</p>
      <h1 className="mt-2 font-display text-[36px] font-semibold leading-[1.05] tracking-tightest text-ink sm:text-[44px]">{l.title}</h1>
      <div className="mt-6 space-y-4 text-[17px] leading-relaxed text-ink-soft">
        {l.paragraphs.slice(0, 2).map((p) => <p key={p}>{p}</p>)}
      </div>
      <div className="my-8"><LessonVisual v={l.visual} /></div>
      <div className="space-y-4 text-[17px] leading-relaxed text-ink-soft">
        {l.paragraphs.slice(2).map((p) => <p key={p}>{p}</p>)}
      </div>
      <div className="mt-8 flex gap-3 rounded-[20px] bg-primary-50 p-5">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
        <p className="text-[15px] leading-relaxed text-ink"><span className="font-semibold">À retenir · </span>{l.takeaway}</p>
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        {next ? (
          <Button size="lg" onClick={() => nav(`/apprendre/${next.id}`)} data-testid="next-lesson">Leçon suivante : {next.title} <ArrowRight className="h-4 w-4" /></Button>
        ) : (
          <Button size="lg" variant="gold" onClick={() => nav("/")}>Prendre ma première décision <ArrowRight className="h-4 w-4" /></Button>
        )}
      </div>
    </PageIn>
  );
}

// ------------------------------------------------------------------------------------------------ visuals
function LessonVisual({ v }: { v: Visual }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[24px] bg-surface/80 p-5 hairline sm:p-6">
      {v === "inflation" && <Inflation />}
      {v === "bricks" && <Bricks />}
      {v === "riskReturn" && <RiskReturn />}
      {v === "diversify" && <Diversify />}
      {v === "compound" && <Compound />}
      {v === "fees" && <Fees />}
      {v === "agents" && <Agents />}
    </motion.div>
  );
}

function Bar({ label, value, max, tone, text }: { label: string; value: number; max: number; tone: string; text: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-ink-soft">{label}</span><span className="tabular-nums font-semibold text-ink">{text}</span></div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-ink/[0.05]">
        <motion.div className={clsx("h-full rounded-full", tone)} initial={{ width: 0 }} animate={{ width: `${(value / max) * 100}%` }} transition={{ type: "spring", stiffness: 80, damping: 18 }} />
      </div>
    </div>
  );
}

function Inflation() {
  const saved = 1000 * 1.01 ** 10, prices = 1000 * 1.03 ** 10;
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-ink">1 000 $ laissés 10 ans dans un compte à 1 %, avec des prix qui montent de 3 % par année</p>
      <Bar label="Votre argent après 10 ans" value={saved} max={prices} tone="bg-primary-500" text={cad(saved)} />
      <Bar label="Ce que coûte alors ce qui valait 1 000 $" value={prices} max={prices} tone="bg-accent-600" text={cad(prices)} />
      <p className="text-xs text-ink-muted">Illustration calculée (taux fixes, hypothétiques) : votre argent a grandi, mais il achète moins qu'avant.</p>
    </div>
  );
}

function Bricks() {
  const items: [string, string, number, string][] = [
    ["Obligation", "Un prêt qui verse des intérêts", 1, "Ex. XBB : obligations canadiennes"],
    ["FNB d'actions", "Un panier de dizaines d'entreprises", 2, "Ex. XIU : 60 grandes entreprises canadiennes"],
    ["Action", "Une part d'une seule entreprise", 3, "Ex. Banque Royale, Apple"],
    ["Cryptoactif", "Très spéculatif", 4, "Ex. Bitcoin"],
  ];
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {items.map(([t, d, r, ex]) => (
        <div key={t} className="rounded-2xl bg-ink/[0.03] p-4">
          <div className="flex items-center justify-between"><span className="font-medium text-ink">{t}</span>
            <span className="flex gap-0.5" title="Niveau de risque">{[1, 2, 3, 4].map((n) => <span key={n} className={clsx("h-1.5 w-4 rounded-full", n <= r ? (r >= 3 ? "bg-accent-600" : "bg-primary-500") : "bg-ink/[0.08]")} />)}</span>
          </div>
          <div className="mt-1 text-sm text-ink-soft">{d}</div>
          <div className="mt-1 text-xs text-ink-muted">{ex}</div>
        </div>
      ))}
    </div>
  );
}

function RiskReturn() {
  const rows: [string, number, number][] = [["A", 6, -3], ["B", 12, -9], ["C", 20, -18], ["D", 30, -32]];
  return (
    <div>
      <p className="text-sm font-medium text-ink">Quatre placements de 10 000 $ : leur meilleure et leur pire année</p>
      <div className="mt-4 space-y-2.5">
        {rows.map(([n, best, worst]) => (
          <div key={n} className="flex items-center gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{n}</span>
            <div className="grid flex-1 grid-cols-2">
              <div className="flex justify-end pr-0.5"><motion.div className="h-3 rounded-l-full bg-accent-600" initial={{ width: 0 }} animate={{ width: `${(-worst / 32) * 100}%` }} /></div>
              <div className="flex border-l-2 border-ink/20 pl-0.5"><motion.div className="h-3 rounded-r-full bg-gain-600" initial={{ width: 0 }} animate={{ width: `${(best / 32) * 100}%` }} /></div>
            </div>
            <span className="tabular-nums w-28 shrink-0 text-right text-xs text-ink-muted">{worst} % / +{best} %</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">Exemples illustratifs, les mêmes que dans le questionnaire : plus la barre verte est longue, plus la rouge l'est aussi.</p>
    </div>
  );
}

function Diversify() {
  const [hit, setHit] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">Une entreprise perd 50 % de sa valeur</p>
        <Button size="sm" variant="secondary" onClick={() => setHit(!hit)}>{hit ? "Revenir" : "Simuler la mauvaise nouvelle"}</Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-ink/[0.03] p-4 text-center">
          <div className="text-xs text-ink-muted">Tout dans 1 entreprise</div>
          <motion.div className="mx-auto mt-3 h-14 w-14 rounded-full bg-primary-500" animate={{ scale: hit ? 0.7 : 1, opacity: hit ? 0.5 : 1 }} />
          <div className={clsx("tabular-nums mt-3 font-display text-2xl font-semibold", hit ? "text-accent-700" : "text-ink")}>{hit ? "−50 %" : "10 000 $"}</div>
        </div>
        <div className="rounded-2xl bg-ink/[0.03] p-4 text-center">
          <div className="text-xs text-ink-muted">Réparti sur 20 entreprises</div>
          <div className="mx-auto mt-3 grid w-fit grid-cols-5 gap-1.5">
            {Array.from({ length: 20 }).map((_, i) => <motion.span key={i} className="h-3 w-3 rounded-full bg-primary-500" animate={{ opacity: hit && i === 7 ? 0.25 : 1, scale: hit && i === 7 ? 0.6 : 1 }} />)}
          </div>
          <div className={clsx("tabular-nums mt-3 font-display text-2xl font-semibold", hit ? "text-ink" : "text-ink")}>{hit ? "−2,5 %" : "10 000 $"}</div>
        </div>
      </div>
    </div>
  );
}

const fv = (monthly: number, years: number, r: number) => (r === 0 ? monthly * 12 * years : monthly * (((1 + r / 12) ** (12 * years) - 1) / (r / 12)));

function Compound() {
  const [monthly, setMonthly] = useState(100);
  const [years, setYears] = useState(20);
  const [rate, setRate] = useState(0.04);
  const paid = monthly * 12 * years;
  const end = fv(monthly, years, rate);
  return (
    <div>
      <p className="text-sm font-medium text-ink">Essayez : un montant chaque mois, pendant des années</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-ink-soft">Chaque mois : <b className="tabular-nums text-ink">{cad(monthly)}</b>
          <input type="range" min={25} max={1000} step={25} value={monthly} onChange={(e) => setMonthly(+e.target.value)} className="mt-2 w-full accent-[#3350ff]" />
        </label>
        <label className="block text-sm text-ink-soft">Pendant : <b className="tabular-nums text-ink">{years} ans</b>
          <input type="range" min={1} max={40} value={years} onChange={(e) => setYears(+e.target.value)} className="mt-2 w-full accent-[#3350ff]" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">Rendement annuel supposé :
        <Segmented value={rate} onChange={setRate} options={[[0.02, "2 %"], [0.04, "4 %"], [0.06, "6 %"]]} size="sm" />
      </div>
      <div className="mt-5 space-y-3">
        <Bar label="Ce que vous avez versé" value={paid} max={end} tone="bg-ink/30" text={cad(paid)} />
        <Bar label="Valeur à la fin" value={end} max={end} tone="bg-primary-500" text={cad(end)} />
      </div>
      <p className="mt-3 text-xs text-ink-muted">Calcul avec un rendement constant hypothétique : dans la réalité, il varie chaque année et peut être négatif. Ce n'est pas une promesse.</p>
    </div>
  );
}

function Fees() {
  const years = 25, gross = 0.05;
  const low = 10000 * (1 + gross - 0.002) ** years, high = 10000 * (1 + gross - 0.02) ** years;
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-ink">10 000 $ pendant 25 ans, rendement supposé de 5 % par année avant frais</p>
      <Bar label="Avec 0,2 % de frais (un FNB indiciel)" value={low} max={low} tone="bg-gain-600" text={cad(low)} />
      <Bar label="Avec 2 % de frais" value={high} max={low} tone="bg-accent-600" text={cad(high)} />
      <p className="text-xs text-ink-muted">Illustration calculée : la différence, {cad(low - high)}, vient uniquement des frais.</p>
    </div>
  );
}

function Agents() {
  const steps = ["Votre profil", "Plan d'analyse", "Calculs", "Vos règles", "Niveau du signal", "Pour et contre", "Explication", "Vérification"];
  const ids = useMemo(() => steps.map((_, i) => i), []); // eslint-disable-line
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {ids.map((i) => (
          <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1.5 text-xs font-medium text-ink">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-primary-500 text-[9px] text-white">{i + 1}</span>{steps[i]}
          </motion.span>
        ))}
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="inline-flex items-center gap-1.5 rounded-full bg-gain-600 px-3 py-1.5 text-xs font-semibold text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} /> Vous décidez
        </motion.span>
      </div>
      <p className="mt-3 text-xs text-ink-muted">Ces étapes s'affichent en direct quand vous faites une demande depuis l'accueil.</p>
    </div>
  );
}
