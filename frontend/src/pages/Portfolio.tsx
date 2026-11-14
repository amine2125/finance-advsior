import { CheckCircle2, HelpCircle, Pencil, Plus, Scale, Wallet, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AllocationBar, GrowthChart, LimitBars } from "../components/charts";
import HoldingsEditor, { TIER_TONE } from "../components/HoldingsEditor";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Explain, inputCls, Notice, PageTitle, Spinner, Stat } from "../components/ui";
import { checkLabel, checkText, SINGLE_SECTOR, useAnalysis } from "../hooks/useAnalysis";
import { useApp } from "../hooks/useApp";
import { cad, date, num, pct, sector, TIER_FR } from "../lib/format";

export default function PortfolioPage() {
  const { me, portfolio, setPortfolioId, reload } = useApp();
  const profile = me!.profile;
  const [editing, setEditing] = useState<"edit" | "new" | null>(null);
  const { data: xr, error, loading, reload: rerun } = useAnalysis(portfolio?.portfolio_id, { snapshot: true });

  const saved = async (pf: any) => {
    setPortfolioId(pf.portfolio_id);
    setEditing(null);
    await reload();
    rerun();
  };

  if (!portfolio || editing === "new") {
    return (
      <div>
        <PageTitle title={portfolio ? "Nouveau portefeuille" : "Mon portefeuille"} subtitle="Ajoutez ce que vous détenez (ou un portefeuille d'essai). Montants en dollars canadiens." />
        <Card>
          {!portfolio && <div className="mb-5"><Empty icon={<Wallet className="h-6 w-6" />} title="Aucun placement pour l'instant">Cherchez un placement par son nom ou son symbole, indiquez le montant, puis lancez l'analyse.</Empty></div>}
          <HoldingsEditor personaId={profile.persona_id} name={portfolio ? "Portefeuille d'essai" : "Mon portefeuille"} submitLabel="Analyser" onSaved={saved} />
          {editing === "new" && <Button variant="ghost" className="mt-2" onClick={() => setEditing(null)}>Annuler</Button>}
        </Card>
      </div>
    );
  }

  const initial = xr ? xr.positions.map((p: any) => ({ asset_id: p.asset_id, amount_cad: Math.round(p.value_cad) })) : [];
  const checks: any[] = xr?.persona_assessment?.budget_checks || [];
  const breaches = checks.filter((c) => c.status !== "OK" && c.status !== "UNKNOWN");

  return (
    <div className="space-y-6">
      <PageTitle title="Mon portefeuille" subtitle={`Analyse calculée sur vos placements et le profil de ${profile.display_name}. Données au ${date(me!.data_as_of)}.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {me!.portfolios.length > 1 && (
              <select className={inputCls + " w-auto"} value={portfolio.portfolio_id} onChange={(e) => setPortfolioId(e.target.value)} aria-label="Choisir le portefeuille">
                {me!.portfolios.map((p) => <option key={p.portfolio_id} value={p.portfolio_id}>{p.name}</option>)}
              </select>
            )}
            <Button variant="secondary" onClick={() => setEditing(editing ? null : "edit")}><Pencil className="h-4 w-4" /> Modifier</Button>
            <Button variant="ghost" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Nouveau</Button>
          </div>
        } />

      {editing === "edit" && xr && (
        <Card title="Modifier mes placements">
          <HoldingsEditor initial={initial} personaId={profile.persona_id} portfolioId={portfolio.portfolio_id} submitLabel="Enregistrer et réanalyser" onSaved={saved} />
        </Card>
      )}

      <ErrorBox error={error} onRetry={rerun} />
      {loading && !xr && <Spinner label="Calcul des métriques sur 5 ans de données de marché…" />}

      {xr && (
        <div className="space-y-6" data-testid="analysis">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="Valeur du portefeuille" value={cad(xr.total_value_cad)} hint={`au ${date(xr.as_of)}`} />
            <Stat label="Variation annuelle typique" value={`± ${pct(xr.risk.volatility, 0)}`} hint={`Indice de comparaison : ± ${pct(xr.risk.benchmark?.volatility, 0)}`} />
            <Stat label="Pire baisse observée" value={pct(xr.risk.drawdown?.max_drawdown, 0)} tone={xr.risk.drawdown?.max_drawdown < profile.budget.drawdown_review ? "bad" : undefined}
              hint={xr.risk.drawdown?.peak_date ? `${date(xr.risk.drawdown.peak_date)} → ${date(xr.risk.drawdown.trough_date)}` : undefined} />
            <Stat label="Nombre réel de placements" value={num(xr.ledger["pf.effective_n"]?.value, 1)} hint={`Sur ${xr.positions.length} lignes : mesure le poids réellement réparti`} />
          </div>

          <Card title="Ce qu'il faut retenir" subtitle="Calculé sur vos placements et votre profil">
            <ul className="space-y-2.5">
              {xr.findings.filter((f: any) => f.severity !== "informational").slice(0, 5).map((f: any) => (
                <li key={f.finding_id} className="flex gap-2.5 text-sm">
                  <span className={f.severity === "critical" ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500"} />
                  <span><b className="font-medium text-slate-900">{f.title}.</b> <span className="text-slate-500">{f.detail}</span></span>
                </li>
              ))}
              {xr.findings.filter((f: any) => f.severity !== "informational").length === 0 && <li className="text-sm text-emerald-700">Aucun point d'attention majeur.</li>}
            </ul>
            <Explain label="Tous les détails">
              <p>{xr.diagnosis.text}</p>
              <ul className="mt-2 space-y-1">{xr.findings.filter((f: any) => f.severity === "informational").map((f: any) => <li key={f.finding_id}>• {f.title} — {f.detail}</li>)}</ul>
            </Explain>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/investir"><Button>Investir davantage</Button></Link>
              <Link to="/assistant?debate=1"><Button variant="secondary"><Scale className="h-4 w-4" /> Avis détaillé des IA</Button></Link>
            </div>
          </Card>

          <Card title="Respecte-t-il votre profil ?" subtitle={`Profil ${profile.risk_profile_label.toLowerCase()} : ${breaches.length ? `${breaches.length} limite(s) dépassée(s)` : "toutes les limites vérifiables sont respectées"}`}>
            <div className="divide-y divide-slate-100">
              {checks.map((c) => (
                <div key={c.rule_id} className="flex items-start gap-3 py-3">
                  {c.status === "OK" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : c.status === "UNKNOWN" ? <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{checkLabel(c)}</span>
                      <span className="text-sm tabular-nums text-slate-600">{c.measured} <span className="text-slate-400">/ limite {c.limit}</span></span>
                    </div>
                    <div className="mt-0.5 text-sm text-slate-500">{checkText(c)}</div>
                  </div>
                </div>
              ))}
            </div>
            <Explain label="D'où viennent ces limites ?">
              Elles découlent de vos réponses à l'inscription (niveau « {profile.risk_profile_label} »). Niveau de risque permis : {TIER_FR[xr.persona_assessment.allowed_tier]?.toLowerCase()} — déterminé par : {xr.persona_assessment.binding_inputs.join(", ")}.
              {" "}{Object.values(xr.persona_assessment.tier_inputs).join(" · ")}. Vous pouvez les revoir dans <Link to="/profil" className="text-brand-600 underline">votre profil</Link>.
            </Explain>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Répartition" subtitle="Part de chaque placement dans la valeur totale">
              <AllocationBar items={xr.positions.slice().sort((a: any, b: any) => b.weight - a.weight).map((p: any) => ({ id: p.asset_id, label: `${p.asset_id} · ${p.name}`, weight: p.weight }))} />
            </Card>
            <Card title="Par secteur" subtitle="Actions d'entreprises détenues directement">
              {Object.keys(xr.exposures.sector).some(SINGLE_SECTOR)
                ? <LimitBars data={Object.fromEntries(Object.entries(xr.exposures.sector).filter(([k]) => SINGLE_SECTOR(k))) as Record<string, number>} limit={profile.budget.max_single_sector} limitLabel={`${pct(profile.budget.max_single_sector, 0)} par secteur`} />
                : <p className="text-sm text-slate-600">Vous ne détenez aucune action individuelle : vos fonds sont déjà répartis sur de nombreux secteurs.</p>}
              {xr.etf_lookthrough?.status === "UNAVAILABLE" && <p className="mt-3 text-xs text-slate-500">Le contenu exact des fonds indiciels (FNB) n'est pas connecté : un recoupement avec vos titres directs est possible mais non chiffré.</p>}
            </Card>
          </div>

          <Card title="Vos placements" pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-5 py-3 font-medium">Placement</th><th className="px-3 py-3 text-right font-medium">Montant</th><th className="px-3 py-3 text-right font-medium">Poids</th>
                  <th className="px-3 py-3 font-medium">Risque mesuré</th><th className="px-5 py-3 text-right font-medium">Part du risque total</th>
                </tr></thead>
                <tbody>
                  {xr.positions.slice().sort((a: any, b: any) => b.weight - a.weight).map((p: any) => (
                    <tr key={p.asset_id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-3"><Link to={`/investir/${encodeURIComponent(p.asset_id)}`} className="font-medium text-slate-900 hover:text-brand-600">{p.asset_id}</Link><div className="text-xs text-slate-500">{p.name} · {sector(p.sector)}</div></td>
                      <td className="px-3 py-3 text-right tabular-nums">{cad(p.value_cad)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{pct(p.weight)}</td>
                      <td className="px-3 py-3"><Badge tone={TIER_TONE[p.tier]}>{TIER_FR[p.tier]}</Badge><div className="mt-0.5 text-xs text-slate-500">± {pct(p.tier_volatility, 0)} / an · pire baisse {pct(p.tier_mdd, 0)}</div></td>
                      <td className="px-5 py-3 text-right tabular-nums">{pct(p.risk_contribution)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 pb-5"><Explain>
              Risque mesuré = volatilité annualisée et pire baisse sur l'historique complet (adj_close, dividendes inclus). Un titre d'une seule entreprise n'est jamais classé « faible ». Seuils : volatilité 10 % / 30 %, baisse 15 % / 50 % (heuristiques fixées avant la période de test).
              « Part du risque total » = contribution de chaque placement à la volatilité du portefeuille (wᵢ·(Σw)ᵢ / σₚ) : {xr.positions.slice().sort((a: any, b: any) => b.risk_contribution - a.risk_contribution)[0]?.asset_id} pèse {pct(xr.positions.slice().sort((a: any, b: any) => b.risk_contribution - a.risk_contribution)[0]?.weight)} de la valeur mais une plus grande part du risque.
            </Explain></div>
          </Card>

          {xr.risk.series?.length > 0 && (
            <Card title="Si vous aviez eu ces placements" subtitle={`Valeur de 1 $ du ${date(xr.risk.window_start)} au ${date(xr.risk.window_end)} — le passé ne prédit pas l'avenir`}>
              <GrowthChart series={xr.risk.series} benchmarkLabel={xr.risk.benchmark?.label} />
              <Explain>
                Pondérations actuelles maintenues, frais et impôts omis, en $ CA. Portefeuille : {pct(xr.risk.total_return)} au total ({pct(xr.risk.annualized_return)} par an); indice de comparaison : {pct(xr.risk.benchmark?.total_return)}.
                Pire baisse {pct(xr.risk.drawdown?.max_drawdown)} : il aurait fallu +{pct(1 / (1 + xr.risk.drawdown?.max_drawdown) - 1, 0)} pour revenir au sommet.
                Un jour sur 20, la perte a dépassé {pct(xr.risk.var?.["0.95"]?.var)} (≈ {cad(xr.risk.var?.["0.95"]?.var * xr.total_value_cad)}); les pires jours peuvent être bien plus durs.
              </Explain>
            </Card>
          )}

          <Notice>
            Sources : prix et devises du jeu de données officiel du datathon ({me!.dataset_origin === "official_datathon_zip" ? "Yahoo Finance, Banque du Canada, FRED" : me!.dataset_origin}), du {date(me!.data_start)} au {date(me!.data_as_of)}.
            Taux sans risque : {xr.risk.risk_free?.note}. Analyse n° {xr.analysis_id}.
          </Notice>
          <Disclaimer />
        </div>
      )}
    </div>
  );
}
