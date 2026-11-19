// Accounts with Amazon Cognito. The browser talks to Cognito directly (public app client, no secret); our API only ever sees
// the short-lived access token, which it validates with Cognito. Passwords never reach our servers.
// Like a banking app: by default the session ends when the browser closes (sessionStorage); « Rester connecté »
// keeps it on this device (localStorage).
const KEY = "ulysse.session";

export type DemoAccount = { key: string; name: string; email: string; password: string; tagline: string };
/** What /api/config says about accounts (ULYSSE names), and the same thing in the interface's terms. */
export type ServerAuth = { mode: "aucune" | "cognito"; region?: string; client_id?: string; comptes_demo?: { email: string; nom: string; description: string; mot_de_passe: string }[] };
export type AuthConfig = { mode: "header" | "cognito"; region: string | null; client_id: string | null; demo_accounts: DemoAccount[] };
type Tokens = { access: string; refresh: string; exp: number; email: string };

let config: AuthConfig = { mode: "header", region: null, client_id: null, demo_accounts: [] };

export function configureAuth(s: ServerAuth | undefined): AuthConfig {
  config = s?.mode === "cognito"
    ? {
        mode: "cognito", region: s.region || null, client_id: s.client_id || null,
        demo_accounts: (s.comptes_demo || []).map((d) => ({ key: d.nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), name: d.nom, email: d.email, password: d.mot_de_passe, tagline: d.description })),
      }
    : { mode: "header", region: null, client_id: null, demo_accounts: [] };
  return config;
}
export const authMode = () => config.mode;

function read(): Tokens | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function write(t: Tokens | null, remember?: boolean) {
  try {
    if (!t) { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); return; }
    const keep = remember ?? localStorage.getItem(KEY) !== null;  // a refresh keeps the choice made at sign-in
    (keep ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(t));
    (keep ? sessionStorage : localStorage).removeItem(KEY);
  } catch { /* private mode */ }
}
export const signedIn = () => !!read();
export const signedInEmail = () => read()?.email ?? null;

const FR: Record<string, string> = {
  NotAuthorizedException: "Courriel ou mot de passe incorrect.",
  UserNotFoundException: "Courriel ou mot de passe incorrect.",
  UsernameExistsException: "Un compte existe déjà avec ce courriel. Connectez-vous plutôt.",
  InvalidPasswordException: "Mot de passe trop faible : au moins 8 caractères, avec une majuscule, une minuscule et un chiffre.",
  InvalidParameterException: "Vérifiez le courriel et le mot de passe.",
  TooManyRequestsException: "Trop de tentatives. Réessayez dans une minute.",
  LimitExceededException: "Trop de tentatives. Réessayez dans une minute.",
  UserNotConfirmedException: "Ce compte n'est pas encore confirmé.",
};

async function cognito<T = any>(target: string, body: object): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Impossible de joindre le service de connexion. Vérifiez votre connexion Internet.");
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const type = String(data.__type || "").split("#").pop() || "";
    throw new Error(FR[type] || data.message || "La connexion a échoué.");
  }
  return data as T;
}

function save(res: any, email: string, refresh?: string, remember?: boolean) {
  const a = res.AuthenticationResult;
  if (!a?.AccessToken) throw new Error("La connexion a échoué.");
  write({ access: a.AccessToken, refresh: a.RefreshToken || refresh || "", exp: Date.now() + (a.ExpiresIn || 3600) * 1000, email }, remember);
}

export async function signIn(email: string, password: string, remember = false): Promise<void> {
  const e = email.trim().toLowerCase();
  const res = await cognito("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", ClientId: config.client_id, AuthParameters: { USERNAME: e, PASSWORD: password } });
  save(res, e, undefined, remember);
}

export async function signUp(email: string, password: string, remember = false): Promise<void> {
  const e = email.trim().toLowerCase();
  await cognito("SignUp", { ClientId: config.client_id, Username: e, Password: password, UserAttributes: [{ Name: "email", Value: e }] });
  await signIn(e, password, remember);  // accounts are confirmed at once (datathon demo, pre-sign-up trigger)
}

let refreshing: Promise<string | null> | null = null;
/** A valid access token, refreshed silently a minute before it expires. */
export async function accessToken(): Promise<string | null> {
  const t = read();
  if (!t) return null;
  if (t.exp - 60_000 > Date.now()) return t.access;
  if (!t.refresh) { write(null); return null; }
  refreshing ||= (async () => {
    try {
      const res = await cognito("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: config.client_id, AuthParameters: { REFRESH_TOKEN: t.refresh } });
      save(res, t.email, t.refresh);
      return read()?.access ?? null;
    } catch {
      write(null);
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function signOut(): Promise<void> {
  const t = read();
  write(null);
  if (t?.access) cognito("GlobalSignOut", { AccessToken: t.access }).catch(() => undefined);  // revoke the refresh token too
}
