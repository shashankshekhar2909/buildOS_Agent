import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string) || "http://127.0.0.1:8800";

const ACCESS_KEY = "buildagent:access";
const REFRESH_KEY = "buildagent:refresh";

export async function getAccess(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getRefresh(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

async function refreshAccess(): Promise<string | null> {
  const r = await getRefresh();
  if (!r) return null;
  const res = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: r }),
  });
  if (!res.ok) {
    await clearTokens();
    return null;
  }
  const body = await res.json();
  await setTokens(body.access_token, body.refresh_token);
  return body.access_token;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  let token = await getAccess();
  const send = async (t: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers || {}),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
    });
  let res = await send(token);
  if (res.status === 401 && token) {
    token = await refreshAccess();
    res = await send(token);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
