import { Pencil, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Disclaimer, PageTitle } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { useApp } from "../hooks/useApp";
import { date } from "../lib/format";
import { ProfileSummary } from "./Onboarding";

export default function Profile() {
  const { me, restart } = useApp();
  const nav = useNavigate();
  const sources = useApi<any>("/sources");
  const sys = useApi<any>("/system/info");
  const p = me!.profile;
  return (
    <div className="space-y-6">
      <PageTitle title={`Profil de ${p.display_name}`} subtitle={p.is_official ? "Profil fictif de référence de l'énoncé du datathon (mode démo)." : "Construit à partir de vos réponses à l'inscription."}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => nav("/inscription")}><Pencil className="h-4 w-4" /> Modifier mes réponses</Button>
            <Button variant="danger" onClick={() => { if (confirm("Tout effacer et recommencer l'inscription ?")) restart(); }}><RotateCcw className="h-4 w-4" /> Recommencer</Button>
          </div>
        } />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <ProfileSummary p={p} />
        <div className="space-y-6">
          <Card title="Sources et méthode" subtitle="D'où viennent les chiffres">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Période des données</dt><dd className="text-right">{date(me!.data_start)} → {date(me!.data_as_of)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Jeu de données</dt><dd className="text-right">{me!.dataset_origin === "official_datathon_zip" ? "Officiel (AlphaForge, datathon 2026)" : me!.dataset_origin}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Devise de calcul</dt><dd>$ CA (taux Banque du Canada)</dd></div>
              {sys.data && <div className="flex justify-between gap-3"><dt className="text-slate-500">IA générative</dt><dd className="text-right"><Badge tone={sys.data.llm_ready ? "good" : "warn"}>{sys.data.llm_status}</Badge></dd></div>}
              {sys.data && <div className="flex justify-between gap-3"><dt className="text-slate-500">Modèle</dt><dd className="truncate text-right text-xs">{sys.data.agent_model_id} · {sys.data.bedrock_region}</dd></div>}
            </dl>
            {sources.data && (
              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                {sources.data.datasets.map((s: any) => (
                  <li key={s.source_id}><b className="text-slate-800">{s.file || s.dataset}</b> — {s.source || s.provider}{s.retrieved_on ? `, extrait le ${s.retrieved_on}` : ""}. {s.limitations || s.notes || ""}</li>
                ))}
              </ul>
            )}
            {sources.data?.providers && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="mb-2 text-xs font-medium text-slate-700">Sources externes en direct</div>
                <div className="flex flex-wrap gap-1.5">{Object.entries(sources.data.providers).map(([k, v]: any) => <Badge key={k} tone={v?.enabled === false ? "neutral" : v?.last_error ? "warn" : "info"}>{k}</Badge>)}</div>
              </div>
            )}
          </Card>
          <Card title="Nos règles">
            <ul className="space-y-2 text-sm text-slate-600">
              <li>• Chaque chiffre vient d'un calcul testé, jamais de l'IA.</li>
              <li>• Une donnée manquante est signalée « indisponible », jamais inventée ni remplacée par zéro.</li>
              <li>• Aucune prévision de prix, aucune promesse de rendement.</li>
              <li>• Les rumeurs et la popularité ne sont jamais traitées comme des faits.</li>
              <li>• Votre âge n'est jamais utilisé pour deviner votre tolérance au risque.</li>
            </ul>
          </Card>
          <Disclaimer />
        </div>
      </div>
    </div>
  );
}
