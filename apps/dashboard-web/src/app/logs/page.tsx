"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { HelpBanner } from "@/components/help-banner";

type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_kind: string;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default function LogsPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");

  const { data = [], isLoading, error } = useQuery<AuditLog[]>({
    queryKey: ["audit"],
    queryFn: () => api<AuditLog[]>("/v1/audit?limit=200"),
    refetchInterval: 5000,
  });

  const kinds = useMemo(() => {
    return ["all", ...new Set(data.map((row) => row.actor_kind))];
  }, [data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((row) => {
      if (kind !== "all" && row.actor_kind !== kind) return false;
      if (!needle) return true;
      return [
        row.action,
        row.actor_kind,
        row.target_kind ?? "",
        row.target_id ?? "",
        JSON.stringify(row.metadata),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data, q, kind]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Logs</h1>
          <p className="text-sm text-muted mt-1">Audit trail from the API gateway.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            className="bg-bg border border-border rounded px-3 py-2 text-sm w-64"
            placeholder="Search action, target, metadata..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="bg-bg border border-border rounded px-3 py-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      <HelpBanner
        title="Audit trail"
        description="Search privileged actions, inspect metadata, and trace who changed what. Use this when a flow behaves unexpectedly."
        bullets={[
          "Filter by actor kind or free text.",
          "Audit records are append-only.",
          "Most state changes should show up here.",
        ]}
        href="/users"
        hrefLabel="Open users"
      />

      {error && (
        <div className="rounded border border-border bg-panel p-3 text-sm text-red-300">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded border border-border overflow-hidden">
        <div className="bg-panel px-3 py-2 text-xs text-muted flex items-center justify-between">
          <span>{isLoading ? "Loading..." : `${rows.length} rows`}</span>
          <span>Admin / operator access required</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-panel text-muted">
            <tr>
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Actor</th>
              <th className="text-left p-2">Action</th>
              <th className="text-left p-2">Target</th>
              <th className="text-left p-2">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                <td className="p-2 text-muted whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                <td className="p-2">
                  <div className="font-medium">{row.actor_kind}</div>
                  <div className="text-xs text-muted">{row.actor_id ?? "system"}</div>
                </td>
                <td className="p-2">
                  <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs">{row.action}</span>
                </td>
                <td className="p-2 text-muted">
                  {row.target_kind ? `${row.target_kind}${row.target_id ? `:${row.target_id}` : ""}` : "—"}
                </td>
                <td className="p-2">
                  <pre className="max-w-xl overflow-x-auto rounded bg-bg p-2 text-[11px] text-muted">
                    {JSON.stringify(row.metadata, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td className="p-4 text-sm text-muted" colSpan={5}>
                  No matching logs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
