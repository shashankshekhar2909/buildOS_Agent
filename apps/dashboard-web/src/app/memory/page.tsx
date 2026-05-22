"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Mem = {
  id: string;
  kind: string;
  text: string;
  source: string;
  source_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  score?: number | null;
};

const KINDS = ["note", "fact", "observation", "conversation"];

export default function MemoryPage() {
  const qc = useQueryClient();
  const listQ = useQuery<Mem[]>({
    queryKey: ["memory"],
    queryFn: () => api<Mem[]>("/v1/memory?limit=50"),
    refetchInterval: 10000,
  });
  const modelQ = useQuery<{ model: string; dim: number }>({
    queryKey: ["memory-model"],
    queryFn: () => api("/v1/memory/_meta/model"),
  });

  const [text, setText] = useState("");
  const [kind, setKind] = useState("note");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Mem[] | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<Mem>("/v1/memory", {
        method: "POST",
        body: JSON.stringify({ text, kind }),
      }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["memory"] });
    },
  });

  const search = useMutation({
    mutationFn: () =>
      api<Mem[]>("/v1/memory/search", {
        method: "POST",
        body: JSON.stringify({ query, limit: 10 }),
      }),
    onSuccess: (r) => setSearchResults(r),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/v1/memory/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["memory"] }),
  });

  const memories = listQ.data ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,92,255,0.18),transparent_35%)]" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.25em] text-muted">Memory</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Semantic memory store</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Long-term memory with vector embeddings (pgvector + LiteLLM). Agents read and write here via the <span className="font-mono text-white">memory</span> skill.
          </p>
          {modelQ.data && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Badge variant="outline" className="font-mono">{modelQ.data.model}</Badge>
              <Badge variant="secondary">dim {modelQ.data.dim}</Badge>
              <Badge variant="outline">cosine</Badge>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm">Store</CardTitle>
            <CardDescription>Add a memory. Embedded on save.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="w-full min-h-[100px] rounded-lg border border-border bg-bg p-3 text-sm"
              placeholder="What should we remember?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-border bg-bg px-2 py-1.5 text-xs font-mono"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
              <Button onClick={() => create.mutate()} disabled={!text || create.isPending}>
                {create.isPending ? "Embedding…" : "Store"}
              </Button>
              {create.error && <span className="text-xs text-red-400">{(create.error as Error).message}</span>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/60">
          <CardHeader>
            <CardTitle className="text-sm">Recall</CardTitle>
            <CardDescription>Semantic search via cosine distance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="What do you want to remember?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button onClick={() => search.mutate()} disabled={!query || search.isPending}>
                {search.isPending ? "Searching…" : "Search"}
              </Button>
              {searchResults && (
                <Button variant="outline" onClick={() => { setSearchResults(null); setQuery(""); }}>Clear</Button>
              )}
              {search.error && <span className="text-xs text-red-400">{(search.error as Error).message}</span>}
            </div>
            {searchResults && (
              <div className="space-y-2">
                {searchResults.length === 0 && <div className="text-xs text-muted">No matches.</div>}
                {searchResults.map((m) => (
                  <MemoryRow key={m.id} m={m} onDelete={(id) => del.mutate(id)} showScore />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="border-white/10 bg-slate-950/60">
        <CardHeader>
          <CardTitle className="text-sm">Recent ({memories.length})</CardTitle>
          <CardDescription>Most recent memories you own.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {memories.length === 0 && (
            <div className="text-xs text-muted">No memories yet. Store one above, or have an agent call the memory skill.</div>
          )}
          {memories.map((m) => (
            <MemoryRow key={m.id} m={m} onDelete={(id) => del.mutate(id)} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MemoryRow({ m, onDelete, showScore }: { m: Mem; onDelete: (id: string) => void; showScore?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary">{m.kind}</Badge>
          <Badge variant="outline" className="text-[10px]">{m.source}</Badge>
          {showScore && m.score != null && (
            <Badge className="bg-indigo-700 text-[10px]">score {m.score.toFixed(3)}</Badge>
          )}
          <span className="text-muted">{new Date(m.created_at).toLocaleString()}</span>
        </div>
        <button
          className="text-xs text-red-400 hover:text-red-300"
          onClick={() => onDelete(m.id)}
        >
          delete
        </button>
      </div>
      <div className="mt-2 whitespace-pre-wrap">{m.text}</div>
    </div>
  );
}
