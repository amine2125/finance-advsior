import { ExternalLink } from "lucide-react";
import { Body } from "../components/Layout";
import { Badge, Card, PageTitle } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { date } from "../lib/format";

/** Sources and method, out of the client's way (linked from the footer). */
export default function About() {
  const { me } = useApp();
  const sources = useApi<any>("/sources");
  const about = useApi<any>("/about");
  const sys = useApi<any>("/system/info");
  return (
    <Body overlap={false}>
      <PageTitle title="À propos des chiffres" subtitle="D'où viennent les données, et comment les vérifications sont calculées." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Comment ça marche">
          <ul className="space-y-2 text-sm text-ink-soft">
            <li>• Chaque chiffre vient d'un calcul vérifié, jamais d'une IA. L'IA rédige; un vérificateur rejette tout chiffre qu'elle ne peut pas justifier.</li>
            <li>• Le risque d'un placement est mesuré sur 5 ans de données réelles (variation typique et pire baisse).</li>
            <li>• Les projections utilisent les Normes d'hypothèses de projection de FP Canada et de l'Institut de planification financière, moins les frais : ce sont des hypothèses, pas des prévisions.</li>
            <li>• Le climat de marché, l'attention inhabituelle et les mesures avancées d'un placement viennent du moteur ULYSSE : modèles statistiques sur des données publiques à la date affichée, qui décrivent le présent sans rien prédire.</li>
            <li>• Une donnée manquante est signalée, jamais inventée. Aucune promesse de rendement.</li>
          </ul>
          {about.data && (
            <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
              {about.data.references.map((s: any) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-500 hover:underline">{s.label} <ExternalLink className="h-3 w-3" /></a></li>)}
            </ul>
          )}
        </Card>
        <Card title="Données de marché">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Période</dt><dd className="text-right">{date(me!.data_start)} → {date(me!.data_as_of)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Jeu de données</dt><dd className="text-right">{me!.dataset_origin === "official_datathon_zip" ? "Officiel (AlphaForge, datathon PolyFinances 2026)" : me!.dataset_origin}</dd></div>
            {me!.official_end && <div className="flex justify-between gap-3"><dt className="text-ink-soft">Prolongation</dt><dd className="text-right">Officiel jusqu'au {date(me!.official_end)}, puis prolongé par l'équipe avec le script et les sources du kit (Yahoo Finance, Banque du Canada, FRED)</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Devise</dt><dd>$ CA (taux de la Banque du Canada)</dd></div>
            {sys.data && <div className="flex justify-between gap-3"><dt className="text-ink-soft">Assistante IA</dt><dd><Badge tone={sys.data.llm_ready ? "good" : "warn"}>{sys.data.llm_ready ? "Connecté" : "Non connecté"}</Badge></dd></div>}
          </dl>
          {sources.data && (
            <ul className="mt-4 space-y-2 border-t border-line pt-4 text-xs text-ink-soft">
              {sources.data.datasets.map((s: any) => <li key={s.source_id}><b className="text-ink">{s.file || s.dataset}</b> — {s.source || s.provider}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </Body>
  );
}
