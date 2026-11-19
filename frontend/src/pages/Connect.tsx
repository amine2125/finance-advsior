import clsx from "clsx";
import { ArrowLeft, Check, Eye, Lock, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, ErrorBox, Spinner } from "../components/ui";
import HowItWorks from "../components/HowItWorks";
import { useApi } from "../hooks/useApi";
import { useApp, useProfilePath } from "../hooks/useApp";
import { APP_NAME } from "../lib/brand";
import { REVIEW, useLaunch } from "../lib/launch";
import { cad, pct } from "../lib/format";
import { api, ApiError } from "../services/api";

const initials = (n: string) => n.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join("").slice(0, 3) || n.slice(0, 2).toUpperCase();

/** « Connecter mon compte de placement » — simulated aggregation: institution → read-only consent → accounts → import → agents. */
export default function Connect() {
  const launch = useLaunch();
  const { me, reload, asOf } = useApp();
  const path = useProfilePath();
  const list = useApi<any>("/connexions/institutions");
  const [q, setQ] = useState("");
  const [inst, setInst] = useState<any>(null);
  const [step, setStep] = useState<"pick" | "consent" | "linking" | "accounts" | "importing">("pick");
  const [preview, setPreview] = useState<any>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const shown = useMemo(() => (list.data?.institutions || []).filter((i: any) => i.nom.toLowerCase().includes(q.trim().toLowerCase())), [list.data, q]);

  const authorize = async () => {
    setStep("linking"); setError(null);
    try {
      const [p] = await Promise.all([api.get<any>(path(`/connexions/${encodeURIComponent(inst.id)}`)!), new Promise((r) => setTimeout(r, 1400))]);
      setPreview(p); setChosen(p.comptes.map((a: any) => a.id)); setStep("accounts");
    } catch (e) { setError(e as ApiError); setStep("consent"); }
  };
  const importAccounts = async () => {
    setStep("importing"); setError(null);
    try {
      // The connected accounts replace the holdings; the simulated cash already here is kept.
      await api.post(path(`/connexions/${encodeURIComponent(inst.id)}`, { as_of: null })!, { comptes: chosen, liquidites_cad: Math.max(0, Math.floor((me?.cash || 0) * 100) / 100), as_of: asOf });
      await reload();
      await launch(REVIEW, { type: "portefeuille" });
    } catch (e) { setError(e as ApiError); setStep("accounts"); }
  };
  const total = (preview?.comptes || []).filter((a: any) => chosen.includes(a.id)).reduce((s: number, a: any) => s + a.valeur_cad, 0);

  return (
    <div className="mx-auto max-w-lg px-5 pb-20 pt-8" data-testid="connect-flow">
      <div className="float-right"><HowItWorks topic="connect" /></div>
      {step === "pick" ? <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Accueil</Link>
        : <button onClick={() => setStep(step === "accounts" ? "consent" : "pick")} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Retour</button>}

      {step === "pick" && (
        <>
          <h1 className="mt-6 font-display text-[34px] font-medium leading-tight text-ink">Connectez votre compte de placement</h1>
          <p className="mt-2 text-ink-soft">Choisissez l'institution où se trouvent vos placements. Les agents les analyseront ensuite.</p>
          <div className="mt-6 flex items-center gap-2 border-b-2 border-ink pb-2">
            <Search className="h-5 w-5 text-ink-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher votre institution" className="flex-1 bg-transparent py-1 text-lg outline-none placeholder:text-ink-muted" />
          </div>
          {list.loading && <Spinner />}
          <ul className="mt-2 divide-y divide-line">
            {shown.map((i: any) => (
              <li key={i.id}>
                <button onClick={() => { setInst(i); setStep("consent"); }} className="flex w-full items-center gap-4 py-3.5 text-left hover:opacity-70" data-testid={`inst-${i.id}`}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas font-display text-sm font-medium text-ink">{initials(i.nom)}</span>
                  <span className="flex-1"><span className="block font-medium text-ink">{i.nom}</span><span className="text-sm text-ink-muted">{i.type}</span></span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/placements?ajouter=1" className="mt-6 inline-block text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">Votre institution n'est pas là ? Entrez vos placements à la main</Link>
        </>
      )}

      {(step === "consent" || step === "linking") && inst && (
        <div className="mt-8">
          <div className="flex items-center justify-center gap-3">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-ink font-display text-white">{APP_NAME[0]}</span>
            <span className="flex gap-1">{[0, 1, 2].map((n) => <span key={n} className={clsx("h-1.5 w-1.5 rounded-full bg-line", step === "linking" && "animate-pulse bg-ink")} style={{ animationDelay: `${n * 150}ms` }} />)}</span>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-canvas font-display text-ink">{initials(inst.nom)}</span>
          </div>
          <h1 className="mt-6 text-center font-display text-[28px] font-medium leading-tight text-ink">{APP_NAME} demande à voir vos comptes {inst.nom}</h1>
          <ul className="mt-8 space-y-4">
            <li className="flex gap-3"><Eye className="mt-0.5 h-5 w-5 shrink-0 text-ink" /><span><span className="font-medium text-ink">Lecture seule</span><span className="block text-sm text-ink-muted">Vos comptes, vos placements, leurs prix et dates d'achat.</span></span></li>
            <li className="flex gap-3"><Lock className="mt-0.5 h-5 w-5 shrink-0 text-ink" /><span><span className="font-medium text-ink">Aucune transaction</span><span className="block text-sm text-ink-muted">{APP_NAME} ne peut ni acheter, ni vendre, ni retirer d'argent.</span></span></li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ink" /><span><span className="font-medium text-ink">Vous restez maître</span><span className="block text-sm text-ink-muted">Vous pouvez déconnecter vos comptes à tout moment.</span></span></li>
          </ul>
          <p className="mt-8 rounded-xl bg-primary-50 px-4 py-3 text-sm text-ink">Simulation : aucun identifiant ni mot de passe n'est demandé, et {inst.nom} n'est pas contacté. Les comptes affichés sont fictifs, construits avec de vrais prix historiques.</p>
          <ErrorBox error={error} />
          <Button size="lg" className="mt-6 w-full" onClick={authorize} disabled={step === "linking"} data-testid="authorize">
            {step === "linking" ? "Connexion sécurisée…" : "Autoriser l'accès (simulation)"}
          </Button>
        </div>
      )}

      {(step === "accounts" || step === "importing") && preview && (
        <div className="mt-6">
          <p className="text-sm text-ink-muted">{inst.nom} · connecté</p>
          <h1 className="mt-1 font-display text-[30px] font-medium leading-tight text-ink">Quels comptes voulez-vous analyser ?</h1>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {preview.comptes.map((a: any) => {
              const on = chosen.includes(a.id);
              const g = a.valeur_cad / a.cout_cad - 1;
              return (
                <li key={a.id}>
                  <button onClick={() => setChosen(on ? chosen.filter((x) => x !== a.id) : [...chosen, a.id])} className="flex w-full items-center gap-4 py-4 text-left" data-testid={`acct-${a.id}`}>
                    <span className={clsx("grid h-6 w-6 shrink-0 place-items-center rounded-md border", on ? "border-ink bg-ink" : "border-line")}>{on && <Check className="h-4 w-4 text-white" strokeWidth={3} />}</span>
                    <span className="flex-1"><span className="block font-medium text-ink">{a.libelle}</span><span className="text-sm text-ink-muted">{a.numero} · {a.n_lignes} placements</span></span>
                    <span className="text-right"><span className="tabular block font-medium text-ink">{cad(a.valeur_cad, 2)}</span><span className={clsx("tabular text-sm", g >= 0 ? "text-gain-700" : "text-accent-700")}>{g >= 0 ? "+" : "−"}{pct(Math.abs(g), 1)} depuis l'achat</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
          <ErrorBox error={error} />
          <Button size="lg" className="mt-6 w-full" disabled={!chosen.length || step === "importing"} onClick={importAccounts} data-testid="import-accounts">
            {step === "importing" ? "Import et lancement des agents…" : `Importer ${chosen.length} compte${chosen.length > 1 ? "s" : ""} · ${cad(total)}`}
          </Button>
          <p className="mt-3 text-center text-xs text-ink-muted">Les comptes importés remplacent vos placements actuels ; votre solde disponible ne change pas. Les agents vérifient ensuite vos règles.</p>
        </div>
      )}
    </div>
  );
}
