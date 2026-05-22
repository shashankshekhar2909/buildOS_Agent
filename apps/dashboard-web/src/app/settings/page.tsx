"use client";

import { useQuery } from "@tanstack/react-query";
import { api, API_URL, WS_URL } from "@/lib/api";
import { useSession } from "@/lib/session";

type Me = { id: string; email: string; role: string; is_active: boolean };
type Health = { ok?: boolean; ready?: boolean };

export default function SettingsPage() {
  const session = useSession();
  const meQ = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/auth/me"),
    retry: false,
  });

  const healthQ = useQuery<Health>({
    queryKey: ["healthz"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/healthz`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    retry: false,
  });

  const readyQ = useQuery<Health>({
    queryKey: ["readyz"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/readyz`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    retry: false,
  });

  const claims = session.claims;
  const expiresAt = claims?.exp ? new Date(claims.exp * 1000) : null;
  const minutesLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Account and runtime state</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          This page exposes the current session and a quick check of the running API and websocket endpoints.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="API" value={statusText(healthQ.isLoading, healthQ.isError, healthQ.data?.ok ? "ok" : "down")} />
        <Metric label="Ready" value={statusText(readyQ.isLoading, readyQ.isError, readyQ.data?.ready ? "ready" : "cold")} />
        <Metric label="WS endpoint" value={WS_URL} compact />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Current session">
          {meQ.data ? (
            <div className="divide-y divide-border">
              <Row label="User" value={meQ.data.email} />
              <Row label="Role" value={meQ.data.role} />
              <Row label="Active" value={String(meQ.data.is_active)} />
              <Row label="User ID" value={meQ.data.id} mono />
              <Row label="Access token" value={minutesLeft === null ? "unknown" : `${minutesLeft} min left`} />
              <Row label="Refresh token" value={session.refreshToken ? "present" : "missing"} />
              {expiresAt && <Row label="Expires at" value={expiresAt.toLocaleString()} mono />}
            </div>
        ) : (
          <Empty message="Not signed in. Use /login to create or refresh a session." />
        )}
        </Panel>

        <Panel title="Environment">
          <div className="divide-y divide-border">
            <Row label="API URL" value={API_URL} mono />
            <Row label="Websocket URL" value={WS_URL} mono />
            <Row label="Auth" value="JWT access + refresh" />
            <Row label="CORS" value="browser host on :3300" />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className={`mt-2 font-semibold text-white ${compact ? "break-all text-sm" : "text-2xl"}`}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-panel overflow-hidden">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold text-white">{title}</div>
      {children}
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`text-white ${mono ? "font-mono text-xs break-all text-right" : "text-right"}`}>{value}</span>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <div className="px-4 py-6 text-sm text-muted">{message}</div>;
}

function statusText(loading: boolean, error: boolean, value: string) {
  if (loading) return "loading";
  if (error) return "down";
  return value;
}
