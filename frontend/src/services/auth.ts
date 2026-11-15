// Accounts with Amazon Cognito. The browser talks to Cognito directly (public app client, no secret); our API only ever sees
// the short-lived access token, which it validates with Cognito. Passwords never reach our servers.
const BASE = (import.meta as any).env?.VITE_API_BASE || "";
const KEY = "aegis.auth";

export type DemoAccount = { key: string; name: string; email: string; password: string; tagline: string };
export type AuthConfig = { mode: "header" | "cognito"; region: string | null; user_pool_id: string | null; client_id: string | null; demo_accounts: DemoAccount[] };
type Tokens = { access: string; refresh: string; exp: number; email: string };

let config: AuthConfig | null = null;

export async function loadAuthConfig(): Promise<AuthConfig> {
  if (config) return config;
  const r = await fetch(`${BASE}/api/v1/auth/config`);
  if (!r.ok) throw new Error("config");
  config = (await r.json()) as AuthConfig;
  return config;
}
export const authMode = () => config?.mode ?? "header";

function read(): Tokens | null {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function write(t: Tokens | null) {
  try { t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY); } catch { /* private mode */ }
}
export const signedIn = () => !!read();

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
  const c = await loadAuthConfig();
  let r: Response;
  try {
    r = await fetch(`https://cognito-idp.${c.region}.amazonaws.com/`, {
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

function save(res: any, email: string, refresh?: string) {
  const a = res.AuthenticationResult;
  if (!a?.AccessToken) throw new Error("La connexion a échoué.");
  write({ access: a.AccessToken, refresh: a.RefreshToken || refresh || "", exp: Date.now() + (a.ExpiresIn || 3600) * 1000, email });
}

export async function signIn(email: string, password: string): Promise<void> {
  const c = await loadAuthConfig();
  const e = email.trim().toLowerCase();
  const res = await cognito("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", ClientId: c.client_id, AuthParameters: { USERNAME: e, PASSWORD: password } });
  save(res, e);
}

export async function signUp(email: string, password: string): Promise<void> {
  const c = await loadAuthConfig();
  const e = email.trim().toLowerCase();
  await cognito("SignUp", { ClientId: c.client_id, Username: e, Password: password, UserAttributes: [{ Name: "email", Value: e }] });
  await signIn(e, password);  // accounts are confirmed at once (datathon demo)
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
      const c = await loadAuthConfig();
      const res = await cognito("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: c.client_id, AuthParameters: { REFRESH_TOKEN: t.refresh } });
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
  localStorage.removeItem("aegis.portfolio");
  if (t?.access) cognito("GlobalSignOut", { AccessToken: t.access }).catch(() => undefined);  // revoke the refresh token too
}
