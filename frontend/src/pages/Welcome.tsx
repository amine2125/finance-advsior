import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Layout";
import { Button, Disclaimer } from "../components/ui";

const STEPS = [
  ["Faisons connaissance", "Une vingtaine de questions sur votre situation, votre budget et votre rapport au risque. Environ 6 minutes."],
  ["Dites ce que vous voulez faire", "« J'ai 10 000 $ à investir », « Je veux 2 000 $ de NVIDIA », « Rééquilibre mon portefeuille »."],
  ["Décidez en connaissance de cause", "Nos agents analysent, vérifient chaque chiffre et vous proposent des ordres. Rien n'est fait sans votre accord."],
];

export default function Welcome() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6"><Logo /></header>
      <main className="mx-auto max-w-6xl px-6">
        <section className="max-w-3xl pb-16 pt-14 sm:pt-24">
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[64px]">Investir, avec un accompagnement qui <span className="inline-block whitespace-nowrap rounded-[0.14em] bg-primary-500/15 px-[0.12em] pb-[0.02em] pt-[0.1em] align-baseline leading-[0.78] text-primary-600">VOUS</span> ressemble.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">Dites ce que vous voulez faire de votre argent. Des agents analysent votre profil, vos placements et le marché, puis vous proposent quoi faire, en expliquant pourquoi.</p>
          <Button size="lg" variant="gold" className="mt-9" onClick={() => nav("/inscription")} data-testid="start">Commencer <ArrowRight className="h-4 w-4" /></Button>
          <p className="mt-4 text-sm text-ink-muted">Simulation éducative · aucune transaction réelle</p>
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
