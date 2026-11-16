import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Chargement, Erreur, PuceNiveau, Vide } from "../components/base";
import { Stagger, StaggerItem } from "../components/motion";
import { PageTitle, TextButton } from "../components/ui";
import * as f from "../format";
import { useApp, useData } from "../state";

const TYPES: Record<string, string> = { dossier: "Dossier de décision", signal: "Signal affiché", decision: "Ta décision", regle_modifiee: "Règle modifiée",
  notification: "Notification de la Vigie", contrat: "Contrat", surveillance: "Liste de surveillance", assistant: "Question à l'assistant" };

export function Journal() {
  const { profil, asOf } = useApp();
  const nav = useNavigate();
  const { data, erreur, charge, recharger } = useData<{ entrees: any[] }>(`/profils/${profil}/journal`);
  const rejouer = async (e: any) => {
    const r = await api<{ id: string }>("/dossiers", { body: { profil, as_of: e.as_of, intention: e.intention } });
    nav(`/dossier/${r.id}?p=${profil}&d=${e.as_of}`);
  };
  if (charge && !data) return <Chargement lignes={6} />;
  if (erreur || !data) return <Erreur message={erreur ?? ""} recharger={recharger} />;
  return (
    <div className="mx-auto max-w-[920px]">
      <PageTitle title="Journal de bord" subtitle="Toutes les interventions et tes décisions, dans l'ordre. Chaque dossier garde sa trace complète et peut être rejoué à sa date." />
      {data.entrees.length === 0 ? <Vide>Aucune entrée pour l'instant. Ouvre un dossier, prépare un ordre simulé ou pose une question à l'assistant.</Vide> : (
        <Stagger className="divide-y divide-line">
          {data.entrees.map((e, i) => (
            <StaggerItem key={i} className="grid gap-1 py-4 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:gap-4">
              <div className="tabular text-xs text-ink-muted">{e.a?.replace("T", " ").slice(0, 16)}{e.as_of && e.as_of !== asOf ? <div>date simulée : {f.date(e.as_of)}</div> : null}</div>
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{TYPES[e.type] ?? e.type}</span>{e.niveau && <PuceNiveau niveau={e.niveau === "ok" && e.type === "notification" ? "ok" : e.niveau} />}</div>
                <p className="mt-1 text-ink-soft">
                  {e.type === "dossier" && <>{e.intention?.type === "ordre" ? `Ordre simulé de ${f.cad(e.intention.montant_cad)} sur ${e.intention.ticker}` : e.intention?.ticker ? `Titre ${e.intention.ticker}` : "Portefeuille"}</>}
                  {e.type === "signal" && <>Ordre de {f.cad(e.montant_cad)} sur {e.ticker} (règles {e.regles?.join(", ")})</>}
                  {e.type === "decision" && <>« {e.choix === "continuer" ? "Continuer quand même" : "Enregistrer"} » — {e.ticker} {f.cad(e.montant_cad)} (simulation)</>}
                  {e.type === "regle_modifiee" && <>{e.clause} → version {e.version}. Contexte : « {e.contexte} »</>}
                  {(e.type === "notification" || e.type === "contrat") && <>{e.titre ?? e.message}</>}
                  {e.type === "surveillance" && <>Ajout de {e.ticker}</>}
                  {e.type === "assistant" && <>« {e.question} »</>}
                </p>
              </div>
              <div className="flex gap-3 text-sm">{e.type === "dossier" && <><Link className="font-medium text-primary-600 hover:underline" to={`/dossier/${e.id}?p=${profil}&d=${e.as_of}`}>Ouvrir</Link><TextButton onClick={() => rejouer(e)}>Rejouer</TextButton></>}</div>
            </StaggerItem>))}
        </Stagger>)}
    </div>
  );
}
