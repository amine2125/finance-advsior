import { ArrowRight } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { levelLabel } from "../lib/ulysse";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Layout";
import { Button, Disclaimer } from "../components/ui";

const STEPS = [
  ["Faisons connaissance", "Une vingtaine de questions sur votre situation, votre budget et votre rapport au risque. Environ 6 minutes."],
  ["Dites ce que vous voulez faire", "« J'ai 10 000 $ à investir », « Je veux 2 000 $ de NVIDIA », « Rééquilibre mon portefeuille »."],
  ["Décidez en connaissance de cause", "Nos agents analysent, vérifient chaque chiffre et comparent votre idée à vos règles. Rien n'est fait sans votre accord."],
];

export default function Welcome() {
  const nav = useNavigate();
  const { me, setProfileId } = useApp();
  const demos = (me?.profiles || []).filter((p) => !p.id.startsWith("p-"));  // the three reference situations of the official case
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6"><Logo /></header>
      <main className="mx-auto max-w-6xl px-6">
        <section className="max-w-3xl pb-16 pt-14 sm:pt-24">
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[64px]">Investir, avec un accompagnement qui <span className="inline-block whitespace-nowrap rounded-[0.14em] bg-primary-500/15 px-[0.12em] pb-[0.02em] pt-[0.1em] align-baseline leading-[0.78] text-primary-600">VOUS</span> ressemble.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">Dites ce que vous voulez faire de votre argent. Des agents analysent votre profil, vos placements et le marché, puis vous disent si votre idée respecte vos propres règles, en expliquant pourquoi.</p>
          <Button size="lg" variant="gold" className="mt-9" onClick={() => nav("/inscription")} data-testid="start">Commencer <ArrowRight className="h-4 w-4" /></Button>
          <p className="mt-4 text-sm text-ink-muted">Simulation éducative · aucune transaction réelle</p>
          {demos.length > 0 && (
            <div className="mt-10 max-w-xl" data-testid="demo-profiles">
              <p className="text-sm font-medium text-ink">Ou explorez un profil de démonstration</p>
              <div className="mt-3 overflow-hidden rounded-[20px] bg-surface/80 hairline">
                {demos.map((p, k) => (
                  <button key={p.id} onClick={() => setProfileId(p.id)} data-testid={`demo-${p.id}`}
                    className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-ink/[0.025] ${k > 0 ? "border-t border-line" : ""}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-semibold text-white">{p.nom[0]}</span>
                    <span className="min-w-0 flex-1"><span className="block font-medium text-ink">{p.nom} <span className="text-sm font-normal text-ink-muted">· {levelLabel(p.tolerance).toLowerCase()}</span></span>
                      {p.description && <span className="block truncate text-sm text-ink-muted">{p.description}</span>}</span>
                    <span className="shrink-0 text-sm font-medium text-primary-600">Entrer</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="grid gap-10 border-t border-line py-14 md:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <div key={t}>
              <div className="tabular text-sm text-ink-muted">0{i + 1}</div>
              <h2 className="mt-2 text-lg font-semibold text-ink">{t}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{d}</p>
            </div>
          ))}
        </section>
        <div className="border-t border-line py-8"><Disclaimer /></div>
      </main>
    </div>
  );
}
