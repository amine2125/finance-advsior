import { ArrowRight, BarChart3, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Layout";
import { Button, Disclaimer, ErrorBox } from "../components/ui";
import { useApp } from "../hooks/useApp";
import { api, ApiError } from "../services/api";

const STEPS = [
  { icon: UserRound, title: "Parlez-nous de vous", text: "Quelques questions simples, comme à la banque : votre objectif, votre horizon, ce que vous êtes prêt à traverser. Environ 2 minutes." },
  { icon: BarChart3, title: "Ajoutez vos placements", text: "Entrez ce que vous détenez déjà (ou importez un fichier). Pas encore de placements ? On part de zéro avec un portefeuille d'essai." },
  { icon: ShieldCheck, title: "Investissez en confiance", text: "Avant chaque placement, on vérifie s'il convient à votre profil : oui, oui jusqu'à un certain montant, ou non — avec les raisons." },
];

export default function Welcome() {
  const nav = useNavigate();
  const { reload } = useApp();
  const [cases, setCases] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const loadCase = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const r = await api.post<any>(`/reference-cases/${id}/load`);
      if (r.portfolio) localStorage.setItem("aegis.portfolio", r.portfolio.portfolio_id);
      await reload();
      nav("/");
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-5 py-6"><Logo /></div>
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-6 sm:pt-12">
        <div className="max-w-2xl">
          <h1 className=" text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">Bonjour 👋<br />Investissons plus sereinement.</h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Dites-nous qui vous êtes, puis investissez seulement dans ce qui correspond vraiment à <b className="font-semibold text-slate-900">votre</b> profil. Un placement trop risqué pour vous ? On vous le dit, et on vous explique pourquoi.
          </p>
          <Button size="lg" className="mt-8" onClick={() => nav("/inscription")} data-testid="start">
            Commencer mon inscription <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <h2 className="mt-16 text-sm font-semibold uppercase tracking-wide text-slate-500">Comment ça marche</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-brand-600 shadow-card"><s.icon className="h-5 w-5" /></div>
                <span className="text-sm font-medium text-slate-400">Étape {i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900">Nos engagements</h3>
          <div className="mt-3 grid gap-x-8 gap-y-2 text-sm text-slate-600 sm:grid-cols-2">
            <p>✓ Calcule le risque à partir de 5 ans de données réelles de marché</p>
            <p>✗ Ne prédit pas les prix et ne promet aucun rendement</p>
            <p>✓ Vérifie vos placements contre <i>vos</i> limites, avec les raisons</p>
            <p>✗ Ne vous pousse jamais vers un placement trop risqué pour vous</p>
            <p>✓ Deux IA pèsent le pour et le contre, chaque chiffre est vérifié</p>
            <p>✗ N'invente jamais une donnée manquante : il le dit</p>
          </div>
        </div>

        <div className="mt-10 text-sm text-slate-500">
          {cases === null ? (
            <button className="underline hover:text-slate-700" onClick={async () => setCases((await api.get<any>("/reference-cases")).cases)}>
              Mode démo : essayer avec un profil fictif de l'énoncé du datathon
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4">
              <p className="mb-3">Profils fictifs de l'énoncé officiel, utiles pour comparer deux situations. Votre propre profil passe par l'inscription.</p>
              <div className="flex flex-wrap gap-2">
                {cases.map((c) => (
                  <Button key={c.persona_id} variant="secondary" size="sm" disabled={!!busy} onClick={() => loadCase(c.persona_id)}>
                    {busy === c.persona_id ? "Chargement…" : `${c.display_name}, ${c.age} ans · risque ${c.risk_profile_label.toLowerCase()} · ${c.horizon}`}
                  </Button>
                ))}
              </div>
              <ErrorBox error={error} />
            </div>
          )}
        </div>
        <div className="mt-10"><Disclaimer /></div>
      </div>
    </div>
  );
}
