import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronRight, Pencil, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageIn, softSpring, spring, Stagger, StaggerItem } from "../components/motion";
import { Button, ErrorBox } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { cad } from "../lib/format";
import { api, ApiError } from "../services/api";
import { A, EMPTY, payload, Result, SECTIONS, StepView } from "./Onboarding";

// What each answer looks like in one line, so the client can spot what changed in their life and edit just that.
const L: Record<string, Record<string, string>> = {
  household: { single: "Seul(e)", couple: "En couple", couple_kids: "En couple avec enfant(s)", single_parent: "Parent seul(e)" },
  employment: { permanent: "Emploi permanent", contract: "Contrat ou temporaire", self_employed: "Travailleur autonome", student: "Aux études", unemployed: "Sans emploi", retired: "À la retraite" },
  income_outlook: { up: "revenu en hausse", stable: "revenu stable", down: "revenu en baisse", uncertain: "revenu incertain" },
  knowledge_self: { none: "Aucune", basic: "De base", good: "Bonnes", expert: "Très bonnes" },
  objective: { preserve: "Le protéger", income: "Le protéger avec un peu de croissance", balanced: "Croissance équilibrée", growth: "Le faire croître à long terme" },
  horizon_years: { 2: "Dans moins de 3 ans", 5: "Dans 3 à 7 ans", 10: "Dans 7 à 12 ans", 20: "Dans plus de 12 ans" },
  liquidity_needs: { low: "retrait imprévu peu probable", moderate: "retrait imprévu possible", high: "retrait imprévu probable" },
  gamble: { sure: "1 000 $ garantis", small_risk: "90 % de chances de 1 200 $", big_risk: "50 % de chances de 2 500 $" },
  drop_reaction: { sell_all: "Je vends tout", sell_some: "Je vends une partie", hold: "J'attends", buy_more: "J'investis davantage" },
  volatility_feeling: { anxious: "Très stressé(e)", uneasy: "Mal à l'aise", ok: "Serein(e)", excited: "Enthousiaste" },
  past_behavior: { sold: "J'ai vendu", held: "J'ai attendu", bought: "J'ai acheté davantage", none: "Pas de placements à l'époque" },
  crypto_interest: { no: "Pas de cryptos", maybe: "Cryptos : un peu", yes: "Cryptos : oui" },
};
const v = (k: string, x: any) => L[k]?.[String(x)] ?? "—";
const money = (x: any) => (x === null || x === undefined || x === "" ? "—" : cad(+x));

const ROWS: { id: string; section: string; label: string; show: (a: A) => string }[] = [
  { id: "name", section: "vous", label: "Prénom et âge", show: (a) => `${a.display_name || "—"}${a.age ? `, ${a.age} ans` : ""}` },
  { id: "household", section: "vous", label: "Famille", show: (a) => `${v("household", a.household)}${a.dependants_count ? ` · ${a.dependants_count} à charge` : ""}` },
  { id: "work", section: "vous", label: "Travail", show: (a) => `${v("employment", a.employment)} · ${v("income_outlook", a.income_outlook)}` },
  { id: "budget", section: "finances", label: "Budget mensuel", show: (a) => `${money(a.income_net_monthly)} gagnés · ${money(a.expenses_monthly)} dépensés` },
  { id: "savings", section: "finances", label: "Épargne disponible", show: (a) => money(a.savings_cad) },
  { id: "debts", section: "finances", label: "Dettes", show: (a) => `Carte ${money(a.credit_card_debt_cad)} · autres ${money(a.other_debt_cad)}${a.home_owner ? " · propriétaire" : ""}` },
  { id: "assets", section: "finances", label: "Placements actuels", show: (a) => money(a.investments_cad) },
  { id: "knowledge", section: "savoir", label: "Connaissances", show: (a) => v("knowledge_self", a.knowledge_self) },
  { id: "objective", section: "risque", label: "Objectif", show: (a) => v("objective", a.objective) },
  { id: "horizon", section: "risque", label: "Quand retirer l'argent", show: (a) => `${v("horizon_years", a.horizon_years)} · ${v("liquidity_needs", a.liquidity_needs)}` },
  { id: "portfolio", section: "risque", label: "Portefeuille préféré", show: (a) => (a.portfolio_choice ? `Portefeuille ${a.portfolio_choice}` : "—") },
  { id: "decline", section: "risque", label: "Baisse acceptable", show: (a) => (a.max_decline ? `−${Math.round(a.max_decline * 100)} %` : "—") },
  { id: "gamble", section: "risque", label: "Le petit pari", show: (a) => v("gamble", a.gamble) },
  { id: "reaction", section: "risque", label: "Si ça baisse de 20 %", show: (a) => v("drop_reaction", a.drop_reaction) },
  { id: "feeling", section: "risque", label: "Face aux variations", show: (a) => v("volatility_feeling", a.volatility_feeling) },
  { id: "past", section: "risque", label: "En 2020 et 2022", show: (a) => v("past_behavior", a.past_behavior) },
  { id: "prefs", section: "prefs", label: "Préférences", show: (a) => `${v("crypto_interest", a.crypto_interest)}${a.esg_preference ? " · ESG" : ""}${a.excluded_sectors?.length ? ` · ${a.excluded_sectors.length} secteur(s) évité(s)` : ""}` },
];

/** The client's profile: the level and why, then every answer in one line — change only what changed in their life. */
export default function Profile() {
  const { me, restart } = useApp();
  const nav = useNavigate();
  const [editing, setEditing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const answersRef = useRef<HTMLDivElement>(null);
  const answers: A = { ...EMPTY, ...(me?.answers || {}) };
  const hasAnswers = !!me?.answers;
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  return (
    <PageIn className="mx-auto max-w-3xl px-5 pb-16 pt-8">
      <Result p={me!.profile} name={me!.profile.display_name}
        action={<Button variant="secondary" size="sm" onClick={() => (hasAnswers ? answersRef.current?.scrollIntoView({ behavior: "smooth" }) : nav("/inscription"))} data-testid="edit-answers">
          <Pencil className="h-4 w-4" /> Ma situation a changé</Button>} />

      {hasAnswers && (
        <section ref={answersRef} className="mt-10 scroll-mt-24" data-testid="answers">
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-ink">Vos réponses</h2>
          <p className="mt-1 text-sm text-ink-muted">Quelque chose a changé ? Modifiez seulement cette réponse : votre profil est recalculé aussitôt.</p>
          <div className="mt-5 space-y-6">
            {SECTIONS.map((sec) => {
              const rows = ROWS.filter((r) => r.section === sec.id);
              if (!rows.length) return null;
              return (
                <div key={sec.id}>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted"><sec.icon className="h-3.5 w-3.5" />{sec.label}</div>
                  <Stagger as="div" className="overflow-hidden rounded-[20px] bg-surface/80 hairline">
                    {rows.map((r, k) => (
                      <StaggerItem as="div" key={r.id}>
                        <motion.button type="button" whileTap={{ scale: 0.99 }} onClick={() => setEditing(r.id)} data-testid={`edit-${r.id}`}
                          className={clsx("flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.025]", k > 0 && "border-t border-line")}>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                            <span className="shrink-0 text-xs text-ink-muted sm:w-48 sm:text-sm">{r.label}</span>
                            <span className="tabular-nums min-w-0 text-[15px] text-ink sm:truncate">{r.show(answers)}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                        </motion.button>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              );
            })}
          </div>
          <button onClick={() => nav("/inscription")} className="mt-5 text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline">Ou refaire tout le questionnaire</button>
        </section>
      )}

      {!me!.profile.kyc && (
        <div className="mt-6 rounded-[20px] bg-primary-50 p-5 text-sm text-ink">
          Votre profil a été créé avec l'ancien questionnaire, plus court. <button className="font-semibold underline" onClick={() => nav("/inscription")}>Répondez au nouveau</button> pour des conseils plus justes.
        </div>
      )}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm">
        <Link to="/a-propos" className="font-medium text-ink-soft hover:text-ink">Comment ces calculs sont faits</Link>
        <button onClick={() => { if (confirm("Tout effacer (profil, objectifs, placements) et recommencer ?")) restart(); }} className="inline-flex items-center gap-1.5 font-medium text-accent-700 hover:underline">
          <RotateCcw className="h-4 w-4" /> Tout effacer et recommencer
        </button>
      </div>

      <AnimatePresence>
        {editing && <EditSheet key={editing} stepId={editing} initial={answers} current={me!.profile.risk_profile_label}
          onClose={() => setEditing(null)} onSaved={(msg) => { setEditing(null); setToast(msg); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={spring}
            className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit max-w-[90vw] items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white shadow-lift md:bottom-8" data-testid="profile-toast">
            <Check className="h-4 w-4 text-gain-50" strokeWidth={3} />{toast}
          </motion.div>
        )}
      </AnimatePresence>
    </PageIn>
  );
}

/** One question in a sheet, pre-filled. The new profile is previewed live before saving. */
function EditSheet({ stepId, initial, current, onClose, onSaved }: { stepId: string; initial: A; current: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const { reload } = useApp();
  const [draft, setDraft] = useState<A>(initial);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  useEffect(() => {
    if (!changed) { setPreview(null); return; }
    const t = setTimeout(() => { api.post<any>("/onboarding/preview", payload(draft)).then(setPreview).catch(() => setPreview(null)); }, 350);
    return () => clearTimeout(t);
  }, [draft, changed]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);
  const next = preview?.risk_profile_label as string | undefined;
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const saved = await api.post<any>("/onboarding", payload(draft));
      await reload();
      onSaved(saved.risk_profile_label !== current ? `Profil mis à jour : ${current.toLowerCase()} → ${saved.risk_profile_label.toLowerCase()}` : "Réponse enregistrée · profil inchangé");
    } catch (e) { setError(e as ApiError); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <motion.div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div initial={{ y: 60, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 60, opacity: 0, scale: 0.98 }} transition={softSpring}
        className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-lift sm:rounded-[28px]" data-testid="edit-sheet">
        <button onClick={onClose} className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-ink/[0.05] text-ink-soft hover:bg-ink/10" aria-label="Fermer"><X className="h-4 w-4" /></button>
        <div className="overflow-y-auto px-5 pb-6 pt-8 sm:px-8">
          <StepView id={stepId} a={draft} set={(p) => setDraft((x) => ({ ...x, ...p }))} preview={null} error={null} />
        </div>
        <div className="border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={!changed ? "same" : next ? next : "wait"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
              className="mb-3 flex items-center gap-2 text-sm" data-testid="edit-preview">
              {!changed ? <span className="text-ink-muted">Modifiez votre réponse ci-dessus.</span>
                : !next ? <span className="text-ink-muted">Je recalcule votre profil…</span>
                  : next === current ? <span className="text-ink-soft">Votre profil reste <b className="font-semibold text-ink">{current.toLowerCase()}</b>.</span>
                    : <span className="flex flex-wrap items-center gap-1.5 text-ink-soft">Votre profil passerait de <b className="font-semibold text-ink">{current.toLowerCase()}</b> <ArrowRight className="h-3.5 w-3.5" /> <b className="font-semibold text-primary-600">{next.toLowerCase()}</b></span>}
            </motion.div>
          </AnimatePresence>
          <ErrorBox error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annuler</Button>
            <Button onClick={save} disabled={!changed || busy} data-testid="save-answer">{busy ? "Enregistrement…" : "Enregistrer"}</Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
