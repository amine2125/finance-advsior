// API client. Same-origin "/api" (Vite proxy locally, CloudFront in AWS, which signs the request to the Lambda function URL).
// Cognito mode: each call carries the account's short-lived access token in « x-ulysse-jeton » (not « Authorization »: CloudFront
// uses that header to sign the request, OAC), and every POST carries the SHA-256 of its body (required by OAC for a Lambda URL).
import { accessToken, authMode, signOut } from "./auth";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: any;
  constructor(status: number, code: string, message: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Tells the app the session ended (expired or revoked): it shows the sign-in screen. */
function signedOutEverywhere() {
  window.dispatchEvent(new Event("ulysse:deconnecte"));
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (authMode() === "cognito") {
    const t = await accessToken();
    if (!t) { signedOutEverywhere(); throw new ApiError(401, "non_connecte", "Connectez-vous pour continuer."); }
    headers["x-ulysse-jeton"] = t;
  }
  let payload: string | undefined;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["content-type"] = "application/json";
    headers["x-amz-content-sha256"] = await sha256Hex(payload);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "network", "Impossible de joindre le serveur. Vérifiez que le backend est démarré.");
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (res.status === 401 && authMode() === "cognito") { await signOut(); signedOutEverywhere(); }
  if (!res.ok) {
    const msg = data?.erreur || (res.status >= 500 || res.status === 0 ? "Le serveur ne répond pas. Vérifiez que le backend est démarré." : `Erreur HTTP ${res.status}`);
    throw new ApiError(res.status, data?.code || "http_error", msg, data);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>("GET", p),
  post: <T = any>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
};

/** Query string from an object, skipping empty values. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}
