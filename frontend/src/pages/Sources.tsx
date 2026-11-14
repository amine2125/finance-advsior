import { ExternalLink } from "lucide-react";
import { Card, Loading, Notice, PageHeader, StatusPill, Table, TierBadge } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { dateTime, num, pct, sector } from "../lib/format";

const INFO = [
  ["Fait vérifié", "Observation directement étayée par une source (ex. cours de clôture, dépôt SEC)."],
  ["Résultat calculé", "Calcul déterministe à partir de faits vérifiés (identifiant de métrique, méthode, fenêtre)."],
  ["Interprétation", "Explication cohérente avec les données, mais non prouvée par elles."],
  ["Scénario hypothétique", "Situation délibérément supposée pour la simulation (choc, ajout de position)."],
  ["Inconnu", "Ce que les jeux de données actuels ne peuvent pas déterminer."],
];

const LIT = [
  ["Les modèles d'apprentissage automatique expliquent ~0,33–0,40 % de la variation mensuelle des rendements individuels hors échantillon", "Gu, Kelly, Xiu (2020)", "https://www.aqr.com/-/media/AQR/Documents/Journal-Articles/Empirical-Asset-Pricing-in-Machine-Learning.pdf"],
  ["38 % des cibles de cours à 12 mois atteintes; erreur absolue moyenne 45 %", "Bradshaw, Brown, Huang (2013)", "https://ideas.repec.org/a/spr/reaccs/v18y2013i4d10.1007_s11142-012-9216-5.html"],
  ["97 prédicteurs : rendements 26 % plus faibles hors échantillon, 58 % après publication", "McLean, Pontiff (2016)", "https://doi.org/10.1111/jofi.12365"],
  ["Krachs du momentum; mars–mai 2009 : perdants +163 % vs gagnants +8 %", "Daniel, Moskowitz", "https://business.columbia.edu/sites/default/files-efs/pubfiles/4607/mom11.pdf"],
  ["Dérive post-résultats disparue pour les grandes capitalisations depuis ~2006", "Martineau (2022)", "https://cfr.ivo-welch.info/published/papers/martineau2021rest.pdf"],
  ["55 % des transactions d'initiés sont routinières", "Cohen, Malloy, Pomorski (2012)", "https://www.nber.org/digest/apr11/w16454.html"],
  ["Pessimisme médiatique : pression temporaire puis retour aux fondamentaux", "Tetlock (2007)", "https://business.columbia.edu/faculty/research/giving-content-investor-sentiment-role-media-stock-market"],
  ["Prime de risque implicite des actions US 4,23 % début 2026 (hypothèse ERP configurable)", "Damodaran", "https://aswathdamodaran.blogspot.com/2026/03/the-price-of-risk-equity-risk-premium.html"],
];

export default function Sources() {
  const src = useApi<any>("/sources");
  const meth = useApi<any>("/methodology");
  const assets = useApi<any>("/assets");
  const status = useApi<any>("/data/status");
  const hyp = useApi<any>("/hypotheses");
  const m = meth.data?.methodology;
  return (
    <div>
      <PageHeader title="Sources & méthodologie" subtitle="Provenance des données, formules, seuils versionnés, limites connues. Aucun pourcentage, fait ou citation sans source n'apparaît dans l'application." />
      {status.data?.origin?.origin === "public_bootstrap" && <Notice tone="warn">Jeu de données actif : <b>amorçage public</b> (Yahoo Finance, Banque du Canada, FRED, SEC), construit car l'archive officielle Datathon2026.zip n'était pas présente dans l'espace de travail. Importez-la avec <code>scripts/import_datathon_zip.py</code> pour la remplacer. Extraction : {dateTime(status.data?.origin?.extracted_at)}.</Notice>}
      <div className="mt-4 grid gap-5 xl:grid-cols-2">
        <Card title="Jeux de données">
          {!src.data ? <Loading /> : <Table head={["Source", "Fournisseur", "Fichier", "Notes / licence"]} rows={src.data.datasets.map((d: any) => [<span className="font-mono text-[11px]">{d.source_id}</span>, d.provider,
            d.dataset, <span className="text-[11px] text-slate-400">{d.notes} {d.license_note && `· ${d.license_note}`} {d.url && <a className="text-aegis-300 hover:underline" href={d.url} target="_blank" rel="noreferrer noopener">lien</a>}</span>])} />}
          {status.data && <div className="mt-3 text-xs text-slate-400">Couverture {status.data.coverage[0]} → {status.data.coverage[1]} · {status.data.assets} actifs · {status.data.price_rows} lignes de prix · version {status.data.dataset_version} · séries macro : {status.data.macro_series.join(", ")}</div>}
        </Card>
        <Card title="Fournisseurs externes (outil de recherche Web)">
          {!src.data ? <Loading /> : <Table head={["Fournisseur", "Fonctions", "Dernier succès", "Erreurs", "Licence"]} rows={src.data.providers.map((p: any) => [<div><div className="text-slate-200">{p.provider}</div><div className="text-[10px] text-slate-500">{p.description}</div></div>,
            p.features.join(", "), p.last_success ? dateTime(p.last_success) : p.calls === 0 && !p.last_error ? <span className="text-[11px] text-slate-500">pas encore appelé dans ce processus</span> : <StatusPill status="UNAVAILABLE" />, <span className="text-[11px]">{p.errors} err · {p.rate_limited} limites{p.last_error ? ` · ${p.last_error}` : ""}</span>, <span className="text-[10px] text-slate-500">{p.license}</span>])} />}
          <p className="mt-2 text-[11px] text-slate-500">Domaines autorisés uniquement; contenu récupéré = donnée non fiable, jamais une instruction. Aucune clé de fournisseur n'est exposée au navigateur.</p>
        </Card>
      </div>
      <Card title="Taxonomie de l'information" className="mt-5"><Table head={["Classe", "Définition"]} rows={INFO.map(([a, b]) => [<b className="text-white">{a}</b>, b])} /></Card>
      <Card title="Niveaux de risque calculés pour chaque actif" subtitle={m ? `Seuils (heuristiques, figés sur ${m.risk_tiers.calibration_window.join(" → ")}) : vol. < ${pct(m.risk_tiers.vol_low, 0)} / > ${pct(m.risk_tiers.vol_high, 0)}, perte max > ${pct(m.risk_tiers.mdd_low, 0)} / ≤ ${pct(m.risk_tiers.mdd_high, 0)}` : ""} className="mt-5">
        {!assets.data ? <Loading /> : <Table head={["Actif", "Classe", "Secteur", "Niveau", "Volatilité", "Perte max.", "Obs.", "Règles"]} rows={assets.data.assets.map((a: any) => [<b className="text-white">{a.asset_id}</b>, a.asset_class, sector(a.sector), <TierBadge tier={a.tier} />, pct(a.volatility), pct(a.max_drawdown), a.n_obs, <span className="text-[10px] text-slate-500">{a.tier_rules.join(" · ")}</span>])} />}
        {m && <p className="mt-2 text-[11px] text-slate-500">{m.risk_tiers.calibration_note}</p>}
      </Card>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Hypothèses pré-enregistrées – évaluation hors échantillon">
          {!hyp.data ? <Loading /> : <Table head={["Hypothèse", "Résultat", "Découpage", "Détail"]} rows={Object.entries<any>(hyp.data.standard).map(([k, h]) => {
            const r = h.result || {};
            const detail = k === "H1" && r.pooled ? `MAE EWMA ${pct(r.pooled.mae_ewma)} vs moyenne longue ${pct(r.pooled.mae_longrun)} (${r.pooled.n_forecasts} prévisions)` : k === "H2" ? `corr. dév. ${num(r.dev_corr)}; ${pct(r.share_beyond_deviation, 0)} des fenêtres test hors ±0,15` : k === "H3" ? `Spearman ${num(r.spearman)} sur ${r.n_assets} actifs` : k === "H4" ? `IC moyen ${num(r.mean_ic)}, t = ${num(r.t_stat)} (faible puissance)` : "";
            return [<div><b className="text-white">{k}</b> <span className="text-[11px] text-slate-400">{h.spec.title}</span><div className="text-[10px] text-slate-500">{h.spec.statement}</div></div>,
              r.supported ? <span className="text-emerald-300">confirmée</span> : r.status === "evaluated" ? <span className="text-rose-300">non confirmée</span> : <span className="text-slate-400">non évaluable</span>,
              <span className="text-[10px]">dév. {r.split?.development?.join(" → ")}<br />test {r.split?.holdout?.join(" → ")}</span>, <span className="text-[11px]">{detail}</span>];
          })} />}
          <p className="mt-2 text-[11px] text-slate-500">Les spécifications sont figées et hachées avant l'évaluation; modifier les paramètres après avoir vu le test marque la période comme contaminée. Un échec est affiché comme un échec.</p>
        </Card>
        <Card title="Politique de prévision">
          {m && <Table head={["Objet", "Prévisibilité", "Comportement d'AEGIS"]} rows={(meth.data.forecast_policy || []).map((r: any) => [r.object, r.predictability, r.behaviour])} />}
          <p className="mt-2 text-[11px] text-slate-500">L'agent Preuves & Gouvernance bloque de façon déterministe toute réponse contenant une cible de cours, un rendement attendu pour un actif ou une probabilité de gain.</p>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Méthodes de calcul">
          {m && <ul className="space-y-1.5 text-xs text-slate-300">
            <li>• Valeur : quantité × cours de clôture × USD/CAD (BdC, dernier taux publié à la date du cours).</li>
            <li>• Rendements : {m.returns.price_field_for_returns} (total, fractionnements non réappliqués). {m.returns.note}</li>
            <li>• Annualisation : √{m.returns.annualization.business} (bourse) / √{m.returns.annualization.crypto} (crypto). Calendrier commun : jours ouvrables des actifs non crypto, report limité à {m.returns.max_forward_fill_days} jours.</li>
            <li>• {m.returns.portfolio_risk_convention}</li>
            <li>• VaR/CVaR : {m.var.method}; minimum {m.windows.min_obs_var} observations. {m.var.caveat}</li>
            <li>• HHI = Σw²; positions effectives = 1/HHI; ratio de diversification = Σwσ/σp; volatilité en stress = corrélations de la pire fenêtre de {m.windows.stress_window} séances.</li>
            <li>• EWMA λ = {m.windows.ewma_lambda}; momentum 12-1 = prix(t−21)/prix(t−252) − 1; RSI de Wilder 14.</li>
            <li>• DCF inversé : ERP {pct(m.valuation.equity_risk_premium, 2)} ({m.valuation.erp_source}), g = {pct(m.valuation.terminal_growth, 1)}, {m.valuation.forecast_years} ans. {m.valuation.kind}.</li>
            <li>• {m.returns.costs}</li>
          </ul>}
          {meth.data?.dcf_fixture && <div className="mt-3 text-[11px] text-slate-400">Contrôle du DCF (entreprise fictive de la section 8A.3) : valeur/action {num(meth.data.dcf_fixture.result.value_per_share)}, part de la valeur terminale {pct(meth.data.dcf_fixture.result.terminal_share)}.</div>}
          {m && <div className="mt-2 text-[10px] text-slate-600">Méthodologie v{m.version} · empreinte {meth.data.hash}</div>}
        </Card>
        <Card title="Constats de la littérature (pas des calculs AEGIS)">
          <ul className="space-y-2 text-xs">{LIT.map(([f, s, u]) => <li key={u} className="text-slate-300">{f} — <a href={u} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-aegis-300 hover:underline">{s} <ExternalLink className="h-3 w-3" /></a></li>)}</ul>
          <p className="mt-2 text-[10px] text-slate-500">Contenu reformulé à des fins de conformité. Ces constats justifient des choix de conception; ils ne sont jamais présentés comme résultats calculés.</p>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Avertissements de qualité des données"><ul className="space-y-1 text-xs text-slate-400">{(status.data?.warnings || []).map((w: string) => <li key={w}>• {w}</li>)}</ul></Card>
        <Card title="Limites connues">
          <ul className="space-y-1 text-xs text-slate-300">
            <li>• Compositions de FNB non connectées : le chevauchement FNB/titres directs est signalé, jamais quantifié.</li>
            <li>• Univers sélectionné de 31 actifs : biais de sélection et de survie; tests transversaux de faible puissance.</li>
            <li>• Pas d'archive d'actualités horodatée : aucun test historique de stratégie fondée sur les nouvelles.</li>
            <li>• Fondamentaux uniquement pour les émetteurs américains (SEC XBRL); émetteurs canadiens : indisponible.</li>
            <li>• Pas de consensus, de positions vendeurs, ni de notes ESG sous licence.</li>
            <li>• Identité de démonstration par navigateur (bac à sable), pas une authentification.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
