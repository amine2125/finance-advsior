import clsx from "clsx";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Layout";
import { Glass, Segmented, Stagger, StaggerItem } from "../components/motion";
import { Button, Disclaimer } from "../components/ui";
import { useApp } from "../hooks/useApp";

const STEPS = [
  ["Faisons connaissance", "Une vingtaine de questions sur votre situation et votre rapport au risque."],
  ["Dites ce que vous voulez faire", "« J'ai 10 000 $ à investir », « Je veux 2 000 $ de NVIDIA »…"],
  ["Décidez en connaissance de cause", "Les agents analysent, vérifient chaque chiffre, et rien n'est fait sans votre accord."],
];
const TINT: Record<string, string> = { amira: "bg-primary-500", mateo: "bg-gain-600", robert: "bg-ink" };

/** Sign in / create an account (Amazon Cognito), with one-tap demo accounts for the jury. */
export default function Login() {
  const { signIn, signUp, authConfig } = useApp();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creds, setCreds] = useState(false);
  const demos = authConfig?.demo_accounts || [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("form"); setErr(null);
    try {
      if (mode === "up") { await signUp(email, pw); nav("/inscription", { replace: true }); }
      else { await signIn(email, pw); nav("/", { replace: true }); }
    } catch (x) { setErr((x as Error).message); setBusy(null); }
  };
  const demo = async (d: (typeof demos)[number]) => {
    setBusy(d.key); setErr(null);
    try { await signIn(d.email, d.password); nav("/", { replace: true }); } catch (x) { setErr((x as Error).message); setBusy(null); }
  };

  return (
    <div className="relative min-h-screen bg-canvas">
      <div className="ambient" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-6"><Logo /></header>
      <main className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:pt-14">
        <section className="min-w-0">
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display text-[42px] font-semibold leading-[1.02] tracking-tightest text-ink sm:text-[60px]">
            Investir, avec quelqu'un qui vérifie pour vous.
          </motion.h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">Dites ce que vous voulez faire de votre argent. Des agents analysent votre profil, vos placements et le marché, puis vous proposent quoi faire, en expliquant pourquoi.</p>
          <Stagger as="ol" className="mt-10 hidden space-y-5 lg:block">
            {STEPS.map(([t, d], i) => (
              <StaggerItem key={t} className="flex gap-4">
                <span className="tabular-nums grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink/[0.05] text-sm font-semibold text-ink">{i + 1}</span>
                <div><div className="font-medium text-ink">{t}</div><div className="text-sm text-ink-muted">{d}</div></div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        <section className="min-w-0">
          <Glass className="p-6 sm:p-8" glow>
            <Segmented value={mode} onChange={(m) => { setMode(m); setErr(null); }} options={[["in", "Se connecter"], ["up", "Créer un compte"]]} testid="auth-mode" />
            <form onSubmit={submit} className="mt-6 space-y-4" data-testid="auth-form">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Courriel</span>
                <span className="flex items-center gap-2.5 rounded-2xl bg-white px-4 hairline focus-within:ring-2 focus-within:ring-primary-500/40">
                  <Mail className="h-4 w-4 text-ink-muted" />
                  <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.ca"
                    className="w-full bg-transparent py-3 text-[15px] outline-none placeholder:text-ink-muted" data-testid="auth-email" />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Mot de passe</span>
                <span className="flex items-center gap-2.5 rounded-2xl bg-white px-4 hairline focus-within:ring-2 focus-within:ring-primary-500/40">
                  <Lock className="h-4 w-4 text-ink-muted" />
                  <input type={show ? "text" : "password"} required minLength={8} autoComplete={mode === "up" ? "new-password" : "current-password"} value={pw}
                    onChange={(e) => setPw(e.target.value)} className="w-full bg-transparent py-3 text-[15px] outline-none" data-testid="auth-password" />
                  <button type="button" onClick={() => setShow(!show)} className="text-ink-muted hover:text-ink" aria-label={show ? "Masquer" : "Afficher"}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </span>
                {mode === "up" && <span className="mt-1.5 block text-xs text-ink-muted">Au moins 8 caractères, avec une majuscule, une minuscule et un chiffre.</span>}
              </label>
              {err && <p className="rounded-2xl bg-accent-50 px-4 py-3 text-sm text-accent-700" role="alert" data-testid="auth-error">{err}</p>}
              <Button size="lg" className="w-full" disabled={!!busy} data-testid="auth-submit">
                {busy === "form" ? (mode === "up" ? "Création du compte…" : "Connexion…") : mode === "up" ? <>Créer mon compte <ArrowRight className="h-4 w-4" /></> : <>Se connecter <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <p className="text-center text-xs text-ink-muted">Comptes gérés par Amazon Cognito : votre mot de passe ne passe jamais par nos serveurs.</p>
            </form>
          </Glass>

          {demos.length > 0 && (
            <div className="mt-6" data-testid="demo-accounts">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">Comptes de démonstration</h2>
                <button onClick={() => setCreds(!creds)} className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"><KeyRound className="h-3.5 w-3.5" />{creds ? "Masquer les identifiants" : "Voir les identifiants"}</button>
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">Les trois investisseurs du cas officiel, avec leur profil et un portefeuille déjà connectés.</p>
              <Stagger as="div" className="mt-3 overflow-hidden rounded-[20px] bg-surface/80 hairline">
                {demos.map((d, k) => (
                  <StaggerItem as="div" key={d.key} className={clsx(k > 0 && "border-t border-line")}>
                    <motion.button whileTap={{ scale: 0.99 }} onClick={() => demo(d)} disabled={!!busy} data-testid={`demo-${d.key}`}
                      className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.025] disabled:opacity-60">
                      <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-full font-display font-semibold text-white", TINT[d.key] || "bg-ink")}>{d.name[0]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink">{d.name}</span>
                        <span className="block truncate text-sm text-ink-muted">{d.tagline}</span>
                        {creds && <span className="tabular-nums mt-0.5 block truncate text-xs text-ink-soft">{d.email} · {d.password}</span>}
                      </span>
                      <span className="shrink-0 text-sm font-medium text-primary-600">{busy === d.key ? "Connexion…" : "Entrer"}</span>
                    </motion.button>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          )}
        </section>
      </main>
      <div className="relative mx-auto max-w-6xl border-t border-line px-5 py-8 sm:px-6"><Disclaimer /></div>
    </div>
  );
}
