import { useState } from "react";
import { comptesDemo, creerCompte, seConnecter } from "../auth";
import { Segmented } from "../components/motion";
import { Button, Disclaimer, Field, Notice, Panel, inputCls } from "../components/ui";
import { APP_NAME, Logo } from "../App";
import { useApp } from "../state";

/** Sign in or create an account (Amazon Cognito). The password goes to Cognito only, never to the ULYSSE server. */
export function Connexion() {
  const { rechargerCompte } = useApp();
  const [mode, setMode] = useState<"connexion" | "creation">("connexion");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [garder, setGarder] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const go = async (e = email, p = mdp, creer = mode === "creation") => {
    setErr(null); setOccupe(true);
    try { await (creer ? creerCompte(e, p, garder) : seConnecter(e, p, garder)); await rechargerCompte(); }
    catch (x) { setErr((x as Error).message); } finally { setOccupe(false); }
  };
  const demos = comptesDemo();
  return (
    <div className="min-h-screen">
      <div className="ambient" aria-hidden />
      <div className="mx-auto max-w-[980px] px-4 py-10 sm:px-8">
        <Logo />
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h1 className="font-display text-[38px] font-medium leading-tight tracking-[-0.03em] sm:text-[46px]">Tes règles, écrites à froid. Tes décisions, vérifiées à chaud.</h1>
            <p className="mt-4 max-w-lg text-ink-soft">{APP_NAME} compare chaque intention de placement aux règles que tu as fixées toi-même, chiffres prouvés à l'appui. Simulation : argent fictif, aucune transaction réelle.</p>
            {demos.length > 0 && <div className="mt-8">
              <p className="text-sm font-semibold">Comptes de démonstration (profils fictifs de l'énoncé)</p>
              <ul className="mt-3 space-y-2">{demos.map((d) => (
                <li key={d.email}><button disabled={occupe} onClick={() => go(d.email, d.mot_de_passe, false)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-card hover:shadow-lift disabled:opacity-60">
                  <span><strong className="block">{d.nom}</strong><span className="text-sm text-ink-muted">{d.description}</span></span>
                  <span className="text-sm font-semibold text-primary-600">Entrer</span></button></li>))}</ul>
            </div>}
          </div>
          <Panel className="p-6">
            <Segmented label="Choix" value={mode} onChange={(m) => { setMode(m); setErr(null); }} options={[["connexion", "Se connecter"], ["creation", "Créer un compte"]]} />
            <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); go(); }}>
              <Field label="Courriel" htmlFor="email"><input id="email" type="email" autoComplete="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Mot de passe" htmlFor="mdp" hint={mode === "creation" ? "Au moins 8 caractères, avec une majuscule, une minuscule et un chiffre." : undefined}>
                <input id="mdp" type="password" autoComplete={mode === "creation" ? "new-password" : "current-password"} required className={inputCls} value={mdp} onChange={(e) => setMdp(e.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={garder} onChange={(e) => setGarder(e.target.checked)} /> Rester connecté sur cet appareil</label>
              {err && <Notice tone="bad" role="alert">{err}</Notice>}
              <Button type="submit" variant="accent" size="lg" className="w-full" disabled={occupe}>{occupe ? "Un instant…" : mode === "creation" ? "Créer mon compte" : "Me connecter"}</Button>
            </form>
            <p className="mt-4 text-xs text-ink-muted">Connexion gérée par Amazon Cognito : ton mot de passe ne passe jamais par les serveurs d'{APP_NAME}. Chaque compte ne voit que ses propres profils.</p>
          </Panel>
        </div>
        <Disclaimer className="mt-10 max-w-2xl" />
      </div>
    </div>
  );
}
