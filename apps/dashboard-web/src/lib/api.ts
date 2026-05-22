function browserHost(): string {
  if (typeof window === "undefined") return "127.0.0.1";
  return window.location.hostname || "127.0.0.1";
}

function browserProtocol(): string {
  if (typeof window === "undefined") return "http:";
  return window.location.protocol || "http:";
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || `${browserProtocol()}//${browserHost()}:8800`;
}

export function wsBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envUrl) return envUrl;
  const scheme = browserProtocol() === "https:" ? "wss:" : "ws:";
  return `${scheme}//${browserHost()}:8800/ws`;
}

export const API_URL = apiBaseUrl();
export const WS_URL = wsBaseUrl();

const TOKEN_KEY = "buildagent.access";
const REFRESH_KEY = "buildagent.refresh";

type JwtClaims = {
  exp?: number;
  role?: string;
  kind?: string;
  sub?: string;
};

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  if (typeof atob === "function") return atob(padded);
  return Buffer.from(padded, "base64").toString("utf8");
}

export function parseAccessClaims(token: string | null): JwtClaims | null {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload)) as JwtClaims;
  } catch {
    return null;
  }
}

export function getAccessClaims(): JwtClaims | null {
  return parseAccessClaims(getToken());
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  window.dispatchEvent(new Event("buildagent:token"));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  window.dispatchEvent(new Event("buildagent:token"));
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  const res = await fetch(`${apiBaseUrl()}/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const { access_token, refresh_token } = await res.json();
  setTokens(access_token, refresh_token);
  return access_token as string;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  const doFetch = (token: string | null) => {
    const h = new Headers(headers);
    if (token) h.set("authorization", `Bearer ${token}`);
    return fetch(`${apiBaseUrl()}${path}`, { ...init, headers: h });
  };

  let token = getToken();
  let res = await doFetch(token);
  if (res.status === 401 && !path.startsWith("/v1/auth/")) {
    token = await refreshAccessToken();
    if (token) res = await doFetch(token);
  }
  if (res.status === 401 && typeof window !== "undefined") clearTokens();
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
