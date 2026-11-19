import { Body } from "../components/Layout";
import { Badge, Card, PageTitle } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { APP_NAME } from "../lib/brand";
import { date } from "../lib/format";

const SOURCES: [string, string][] = [
  ["Cours et dividendes", "Yahoo Finance : jeu de départ officiel du datathon (31 titres), prolongé avec le script du kit"],
  ["Change USD/CAD et taux", "Banque du Canada et FRED"],
  ["Composition des FNB", "Fiches publiées par les émetteurs, utilisées à partir de leur date de publication"],
  ["Attention du public", "Pages vues Wikipédia et volume échangé"],
  ["Dépôts officiels", "SEC EDGAR (8-K, 10-Q, 10-K…), lus jusqu'à la date simulée seulement"],
  ["Presse", "GDELT : articles détectés, un article ne prouve pas son contenu"],
];

/** Sources and method, out of the client's way (linked from the footer). */
export default function About() {
  const { config } = useApp();
  const bench = useApi<any>("/fiabilite");
  const llm = config?.llm || "";
  return (
    <Body overlap={false}>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <PageTitle title="À propos des chiffres" subtitle="D'où viennent les données, comment les vérifications sont calculées, et à quel point elles sont fiables." />
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Comment ça marche">
            <ul className="space-y-2 text-sm text-ink-soft">
              <li>• Vos règles viennent de vos réponses au questionnaire « Connaître son client » : la plus basse de trois mesures (ce que vous êtes prêt à risquer, ce que votre situation permet, ce que vous connaissez) fixe votre profil.</li>
              <li>• Chaque chiffre vient d'un calcul vérifié, jamais d'une IA. L'IA peut rédiger ; un vérificateur rejette toute phrase dont un chiffre n'est pas prouvé, et un gabarit écrit en code prend alors le relais.</li>
              <li>• Le niveau (compatible, à regarder, pause de réflexion) est décidé par une politique écrite et testée, jamais par un modèle de langage.</li>
              <li>• Le risque d'un placement est mesuré sur des données réelles : variation typique, pire baisse, pertes extrêmes, crises passées rejouées sur votre portefeuille.</li>
              <li>• Machine à remonter le temps : à une date simulée, seules les informations publiées à cette date sont utilisées.</li>
              <li>• Une donnée manquante est signalée, jamais inventée. Aucune promesse de rendement.</li>
            </ul>
          </Card>
          <Card title="Données de marché">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-ink-soft">Période</dt><dd className="text-right">{date(config?.donnees_debut)} → {date(config?.donnees_jusqu_au)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-soft">Univers</dt><dd className="text-right">{config?.univers?.length ?? 31} placements (actions, FNB, or, cryptoactifs)</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-soft">Devise</dt><dd>$ CA (taux de la Banque du Canada)</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-soft">Rédaction</dt><dd><Badge tone={llm && !llm.startsWith("simule") ? "good" : "neutral"}>{llm && !llm.startsWith("simule") ? `IA (${llm})` : "Gabarits écrits en code"}</Badge></dd></div>
            </dl>
            <ul className="mt-4 space-y-2 border-t border-line pt-4 text-xs text-ink-soft">
              {SOURCES.map(([k, v]) => <li key={k}><b className="text-ink">{k}</b> — {v}</li>)}
            </ul>
          </Card>
        </div>
        {bench.data?.disponible && (
          <div className="mt-5">
            <Card title="Fiabilité des chiffres" subtitle={`Banc d'essai exécuté le ${bench.data.execute_le} (${bench.data.environnement}). Chaque mesure donne son intervalle de confiance à 95 %.`}>
              <ul className="divide-y divide-line">
                {bench.data.metriques.map((m: any) => (
                  <li key={m.cle} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
                    <span className="min-w-0 flex-1 text-ink-soft">{m.libelle}</span>
                    <span className="tabular-nums font-semibold text-ink">{Number(m.valeur).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} {m.unite}
                      {m.ic95 && <span className="ml-2 text-xs font-normal text-ink-muted">IC 95 % : {Number(m.ic95[0]).toLocaleString("fr-CA", { maximumFractionDigits: 1 })}–{Number(m.ic95[1]).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} · n = {m.n}</span>}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
        <p className="mt-6 text-xs text-ink-muted">{APP_NAME} est un prototype éducatif : profils et portefeuilles fictifs, données publiques uniquement, aucune transaction réelle.</p>
      </div>
    </Body>
  );
}
