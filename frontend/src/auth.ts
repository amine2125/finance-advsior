// Accounts with Amazon Cognito. The browser talks to Cognito directly (public app client, no secret); the API only ever
// sees the short-lived access token, which it validates with Cognito. Passwords never reach our servers.
// Like a banking app: the session ends when the browser closes (sessionStorage), unless « Rester connecté » (localStorage).
const CLE = "ulysse.session";

export interface CompteDemo { email: string; nom: string; description: string; mot_de_passe: string }
export interface AuthConfig { mode: "aucune" | "cognito"; region?: string; client_id?: string; comptes_demo?: CompteDemo[] }
interface Jetons { acces: string; refresh: string; exp: number; email: string }

let config: AuthConfig = { mode: "aucune" };
export const configurerAuth = (c: AuthConfig | undefined) => { config = c ?? { mode: "aucune" }; };
export const modeAuth = () => config.mode;
export const comptesDemo = () => config.comptes_demo ?? [];

function lire(): Jetons | null {
  try { return JSON.parse(sessionStorage.getItem(CLE) || localStorage.getItem(CLE) || "null"); } catch { return null; }
}
function ecrire(t: Jetons | null, garder?: boolean) {
  try {
    if (!t) { sessionStorage.removeItem(CLE); localStorage.removeItem(CLE); return; }
    const local = garder ?? localStorage.getItem(CLE) !== null;   // a refresh keeps the choice made at sign-in
    (local ? localStorage : sessionStorage).setItem(CLE, JSON.stringify(t));
    (local ? sessionStorage : localStorage).removeItem(CLE);
  } catch { /* private browsing */ }
}
export const connecte = () => !!lire();
export const emailConnecte = () => lire()?.email ?? null;

const MESSAGES: Record<string, string> = {
  NotAuthorizedException: "Courriel ou mot de passe incorrect.", UserNotFoundException: "Courriel ou mot de passe incorrect.",
  UsernameExistsException: "Un compte existe déjà avec ce courriel : connecte-toi plutôt.",
  InvalidPasswordException: "Mot de passe trop faible : au moins 8 caractères, avec une majuscule, une minuscule et un chiffre.",
  InvalidParameterException: "Vérifie le courriel et le mot de passe.", TooManyRequestsException: "Trop de tentatives : réessaie dans une minute.",
  LimitExceededException: "Trop de tentatives : réessaie dans une minute.", UserNotConfirmedException: "Ce compte n'est pas encore confirmé.",
};

async function cognito<T = any>(cible: string, corps: object): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
      method: "POST", headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityProviderService.${cible}` },
      body: JSON.stringify(corps),
    });
  } catch { throw new Error("Impossible de joindre le service de connexion. Vérifie ta connexion Internet."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(MESSAGES[String(d.__type || "").split("#").pop() || ""] || d.message || "La connexion a échoué.");
  return d as T;
}

function sauver(res: any, email: string, refresh?: string, garder?: boolean) {
  const a = res.AuthenticationResult;
  if (!a?.AccessToken) throw new Error("La connexion a échoué.");
  ecrire({ acces: a.AccessToken, refresh: a.RefreshToken || refresh || "", exp: Date.now() + (a.ExpiresIn || 3600) * 1000, email }, garder);
}

export async function seConnecter(email: string, mdp: string, garder = false) {
  const e = email.trim().toLowerCase();
  sauver(await cognito("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", ClientId: config.client_id, AuthParameters: { USERNAME: e, PASSWORD: mdp } }), e, undefined, garder);
}

export async function creerCompte(email: string, mdp: string, garder = false) {
  const e = email.trim().toLowerCase();
  await cognito("SignUp", { ClientId: config.client_id, Username: e, Password: mdp, UserAttributes: [{ Name: "email", Value: e }] });
  await seConnecter(e, mdp, garder);   // accounts are confirmed at once (datathon demo, pre-sign-up trigger)
}

let enCours: Promise<string | null> | null = null;
/** A valid access token, refreshed silently a minute before it expires. */
export async function jeton(): Promise<string | null> {
  const t = lire();
  if (!t) return null;
  if (t.exp - 60_000 > Date.now()) return t.acces;
  if (!t.refresh) { ecrire(null); return null; }
  enCours ||= (async () => {
    try {
      sauver(await cognito("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: config.client_id, AuthParameters: { REFRESH_TOKEN: t.refresh } }), t.email, t.refresh);
      return lire()?.acces ?? null;
    } catch { ecrire(null); return null; } finally { enCours = null; }
  })();
  return enCours;
}

export async function seDeconnecter() {
  const t = lire();
  ecrire(null);
  if (t?.acces) cognito("GlobalSignOut", { AccessToken: t.acces }).catch(() => undefined);   // revokes the refresh token too
  window.dispatchEvent(new Event("ulysse:deconnecte"));
}
