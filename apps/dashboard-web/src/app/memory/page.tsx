"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type AuditLog = { id: string; action: string; target_kind: string | null; target_id: string | null; created_at: string };
type Secret = { id: string; scope: string; name: string; created_at: string; updated_at: string };

const MEMORY_STACK = [
  { title: "Audit log", value: "Live", note: "Actions are persisted to audit_logs." },
  { title: "Secrets", value: "Encrypted", note: "Stored at rest with Fernet." },
  { title: "Search", value: "Typesense", note: "Indexed infra lives in compose." },
  { title: "Vectors", value: "Deferred", note: "pgvector/Qdrant still undecided." },
];

export default function MemoryPage() {
  const auditQ = useQuery<AuditLog[]>({
    queryKey: ["audit"],
    queryFn: () => api<AuditLog[]>("/v1/audit?limit=20"),
    retry: false,
  });

  const secretsQ = useQuery<Secret[]>({
    queryKey: ["secrets"],
    queryFn: () => api<Secret[]>("/v1/secrets"),
    retry: false,
  });

  const recent = auditQ.data ?? [];
  const secrets = secretsQ.data ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted">Memory</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">State, retention, and retrieval</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              There is no standalone memory service yet. This page shows the memory-related primitives already
              in the system and what is still deferred.
            </p>
          </div>
          <Link href="/logs" className="rounded border border-border bg-bg px-4 py-2 text-sm font-medium text-white">
            Open audit trail
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {MEMORY_STACK.map((item) => (
          <div key={item.title} className="rounded-2xl border border-border bg-panel p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">{item.title}</div>
            <div className="mt-2 text-2xl font-semibold text-white">{item.value}</div>
            <div className="mt-2 text-sm text-muted">{item.note}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent retention events">
          <div className="divide-y divide-border">
            {recent.map((row) => (
              <div key={row.id} className="px-4 py-3 text-sm text-white">
                <div className="font-medium">{row.action}</div>
                <div className="text-xs text-muted">
                  {row.target_kind ? `${row.target_kind}${row.target_id ? `:${row.target_id}` : ""}` : "system"} ·{" "}
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {auditQ.isError && <Empty message="Audit data unavailable for this account." />}
            {!auditQ.isLoading && !auditQ.isError && recent.length === 0 && <Empty message="No recent audit events." />}
          </div>
        </Panel>

        <Panel title="Secrets inventory">
          <div className="divide-y divide-border">
            {secrets.map((secret) => (
              <div key={secret.id} className="px-4 py-3 text-sm text-white">
                <div className="font-medium">{secret.scope}/{secret.name}</div>
                <div className="text-xs text-muted">
                  updated {new Date(secret.updated_at).toLocaleString()}
                </div>
              </div>
            ))}
            {secretsQ.isError && <Empty message="Secret metadata is admin/operator only." />}
            {!secretsQ.isLoading && !secretsQ.isError && secrets.length === 0 && <Empty message="No secrets stored." />}
          </div>
        </Panel>
      </section>
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

function Empty({ message }: { message: string }) {
  return <div className="px-4 py-6 text-sm text-muted">{message}</div>;
}
