import clsx from "clsx";
import { AlertTriangle, ArrowRight, CheckCircle2, HelpCircle, MessageCircle, TrendingUp, Wallet, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Spinner, Stat } from "../components/ui";
import { checkLabel, checkText, useAnalysis, SEV_FR, SEV_TONE } from "../hooks/useAnalysis";
import { useApp } from "../hooks/useApp";
import { cad, date, pct } from "../lib/format";

export default function Home() {
  const { me, portfolio } = useApp();
  const p = me!.profile;
  const { data: xr, error, loading, reload } = useAnalysis(portfolio?.portfolio_id);
  const hour = new Date().getHours();
  const hello = hour < 5 || hour >= 18 ? "Bonsoir" : "Bonjour";
  const checks: any[] = xr?.persona_assessment?.budget_checks || [];
  const ok = checks.filter((c) => c.status === "OK").length;
  const known = checks.filter((c) => c.status !== "UNKNOWN").length;
  // Profile-limit breaches first (what matters for this person), then the most important computed findings.
  const top = [
    ...checks.filter((c) => c.status !== "OK" && c.status !== "UNKNOWN").map((c) => ({ finding_id: c.rule_id, severity: "critical", title: checkLabel(c) + " : " + c.measured + " (limite " + c.limit + ")", detail: checkText(c) })),
    ...(xr?.findings || []).filter((f: any) => f.severity !== "informational"),
  ].slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{hello}, {p.display_name}</h1>
        <p className="mt-1 text-sm text-slate-500">Profil {p.risk_profile_label.toLowerCase()} · horizon {p.horizon_years_min} ans · données de marché au {date(me!.data_as_of)}</p>
      </div>

      {!portfolio ? (
        <Card>
          <Empty icon={<Wallet className="h-6 w-6" />} title="Ajoutez vos placements pour commencer"
            action={<Link to="/portefeuille"><Button>Ajouter mes placements <ArrowRight className="h-4 w-4" /></Button></Link>}>
            Entrez ce que vous détenez, ou construisez un portefeuille d'essai. nous vérifierons s'il respecte les limites de votre profil et vous expliquera pourquoi.
          </Empty>
        </Card>
      ) : (
        <>
          <ErrorBox error={error} onRetry={reload} />
          {loading && !xr && <Spinner label="Analyse de votre portefeuille…" />}
          {xr && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <Stat label="Valeur du portefeuille" value={cad(xr.total_value_cad)} hint={`${xr.positions.length} placement(s) · en $ CA`} />
                <Stat label="Vos limites respectées" value={`${ok} sur ${known}`} tone={ok === known ? "good" : ok >= known - 1 ? "warn" : "bad"} hint="Règles calculées à partir de votre profil" />
                <Stat label="Variation annuelle typique" value={`± ${pct(xr.risk.volatility, 0)}`} hint="Volatilité historique sur 3 ans" />
                <Stat label="Pire baisse observée" value={pct(xr.risk.drawdown?.max_drawdown, 0)} tone={xr.risk.drawdown?.max_drawdown < p.budget.drawdown_review ? "bad" : undefined}
                  hint={`Votre seuil de revue : ${pct(p.budget.drawdown_review, 0)}`} />
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <Card title="Ce qu'il faut retenir" subtitle="Les points les plus importants, calculés sur vos placements et votre profil">
                  {top.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5" /> Aucun point d'attention majeur détecté.</div>
                  ) : (
                    <ul className="space-y-3">
                      {top.map((f: any) => (
                        <li key={f.finding_id} className="flex gap-3">
                          {f.severity === "critical" ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />}
                          <div>
                            <div className="text-sm font-medium text-slate-900">{f.title} <Badge tone={SEV_TONE[f.severity]} className="ml-1">{SEV_FR[f.severity]}</Badge></div>
                            <div className="text-sm text-slate-500">{f.detail}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link to="/portefeuille" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">Voir l'analyse complète <ArrowRight className="h-4 w-4" /></Link>
                </Card>

                <Card title="Vos limites" subtitle="Vérifiées automatiquement">
                  <ul className="space-y-2.5">
                    {checks.map((c) => (
                      <li key={c.rule_id} className="flex items-start gap-2.5 text-sm">
                        {c.status === "OK" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : c.status === "UNKNOWN" ? <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-slate-800">{checkLabel(c)}</div>
                          <div className="text-xs text-slate-500">{c.measured} · limite {c.limit}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </>
          )}
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Action to="/investir" icon={<TrendingUp className="h-5 w-5" />} title="Je veux investir" text="Choisissez un placement et un montant : on vous dit clairement s'il convient à votre profil, et pourquoi." />
        <Action to="/assistant" icon={<MessageCircle className="h-5 w-5" />} title="Poser une question" text="« Mon portefeuille est-il diversifié ? », « Bitcoin est-il pour moi ? »" />
      </div>
      <Disclaimer />
    </div>
  );
}

function Action({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className={clsx("group rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition hover:border-brand-200 hover:shadow-lift")}>
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
      <div className="mt-3 flex items-center gap-1 font-semibold text-slate-900">{title} <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" /></div>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </Link>
  );
}
