"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpBanner } from "@/components/help-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  project_type: string;
  stack: string;
  brief: string;
  features: string[];
  constraints: string[];
  repo_url: string | null;
  workspace_path: string | null;
  node_id: string | null;
  build_command: string | null;
  test_command: string | null;
  run_command: string | null;
  deploy_command: string | null;
  status: string;
  last_task_id: string | null;
};

type Task = {
  id: string;
  title: string;
  kind: string;
  state: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  created_at: string;
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();

  const projectQ = useQuery<Project>({
    queryKey: ["project", id],
    queryFn: () => api<Project>(`/v1/projects/${id}`),
    retry: false,
  });
  const tasksQ = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => api<Task[]>("/v1/tasks"),
    refetchInterval: 30000,
  });

  const build = useMutation({
    mutationFn: () => api<Task>(`/v1/projects/${id}/build`, { method: "POST" }),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      router.replace(`/tasks/${task.id}`);
    },
  });

  const project = projectQ.data;
  const buildHistory = (tasksQ.data || [])
    .filter((task) => String(task.payload?.["project_id"] || "") === id)
    .slice(0, 8);
  const latestBuild = buildHistory[0];
  const preview = (latestBuild?.result?.["preview"] as Record<string, unknown> | undefined) ?? undefined;
  const previewFrontend = preview?.["frontend"] as Record<string, unknown> | undefined;
  const previewBackend = preview?.["backend"] as Record<string, unknown> | undefined;
  const frontendPort = preview?.["frontend_port"] as number | undefined;
  const backendPort = preview?.["backend_port"] as number | undefined;
  const portRange = preview?.["port_range"] as number[] | undefined;
  const host = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Projects</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white font-sans">{project?.name ?? "Project"}</h1>
          <p className="mt-2 text-sm text-slate-400 font-sans">
            Brief, commands, and build history for this project.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/projects">
            <Button variant="outline">Back to projects</Button>
          </Link>
          <Button onClick={() => build.mutate()} className="bg-accent text-slate-950 hover:bg-accent/90">
            Build
          </Button>
        </div>
      </div>

      <HelpBanner
        title="Project build flow"
        description="Build writes the app, runs checks in Docker, and starts LAN preview containers on fixed 4-digit ports."
        bullets={[
          "The project brief becomes the agent instruction.",
          "Build history is stored as tasks.",
          "Preview URLs use the same host and a fixed 5000-5999 port range.",
        ]}
        href="/tasks"
        hrefLabel="View task queue"
      />

      {!project && (
        <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md">
          <CardContent className="p-6 text-sm text-slate-400">Loading project...</CardContent>
        </Card>
      )}

      {project && (
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
            <CardHeader className="border-b border-white/[0.06] bg-white/[0.01]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-white font-sans">{project.name}</CardTitle>
                  <CardDescription className="text-xs text-slate-400">{project.project_type} · {project.stack || "no stack"}</CardDescription>
                </div>
                <Badge variant="outline">{project.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <p className="text-sm leading-6 text-slate-300">{project.brief || "No brief provided."}</p>
              <div className="flex flex-wrap gap-2">
                {(project.features || []).map((item) => (
                  <Badge key={item} variant="secondary" className="bg-white/[0.03]">
                    {item}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(project.constraints || []).map((item) => (
                  <Badge key={item} variant="outline" className="border-amber-500/20 text-amber-300">
                    {item}
                  </Badge>
                ))}
              </div>
              <div className="grid gap-2 text-xs text-slate-400">
                <Row label="Repo" value={project.repo_url || "none"} />
                <Row label="Workspace" value={project.workspace_path || "none"} />
                <Row label="Node" value={project.node_id || "none"} />
                <Row label="Build" value={project.build_command || "none"} />
                <Row label="Test" value={project.test_command || "none"} />
                <Row label="Run" value={project.run_command || "none"} />
                <Row label="Deploy" value={project.deploy_command || "none"} />
              </div>
              {frontendPort || backendPort ? (
                <div className="space-y-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4 text-sm">
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-emerald-300">Docker preview</div>
                  <div className="grid gap-2">
                    {frontendPort ? (
                      <PreviewRow
                        label="Frontend"
                        value={`http://${host}:${frontendPort}`}
                        meta={previewFrontend?.["container_name"] ? String(previewFrontend["container_name"]) : undefined}
                      />
                    ) : null}
                    {backendPort ? (
                      <PreviewRow
                        label="Backend"
                        value={`http://${host}:${backendPort}`}
                        meta={previewBackend?.["container_name"] ? String(previewBackend["container_name"]) : undefined}
                      />
                    ) : null}
                  </div>
                  {portRange ? (
                    <div className="text-[11px] text-slate-400">
                      Port range: {portRange[0]}-{portRange[1]} only
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
            <CardHeader className="border-b border-white/[0.06] bg-white/[0.01]">
              <CardTitle className="text-base font-bold text-white font-sans">Build history</CardTitle>
              <CardDescription className="text-xs text-slate-400">Tasks created for this project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {buildHistory.length === 0 && <div className="text-sm text-slate-400">No builds yet.</div>}
              {buildHistory.map((task) => (
                <Link key={task.id} href={`/tasks/${task.id}`} className="block rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-white/[0.12] hover:bg-white/[0.04]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{task.title}</div>
                      <div className="mt-1 text-xs text-slate-400">{new Date(task.created_at).toLocaleString()}</div>
                    </div>
                    <Badge variant="secondary">{task.state}</Badge>
                  </div>
                  {task.error && <div className="mt-2 text-xs text-rose-300">{task.error}</div>}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2">
      <span className="font-mono uppercase tracking-[0.2em] text-[10px] text-slate-500">{label}</span>
      <span className="truncate text-right text-slate-300">{value}</span>
    </div>
  );
}

function PreviewRow({ label, value, meta }: { label: string; value: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">{label}</div>
        {meta ? <div className="mt-1 truncate text-[11px] text-slate-500">{meta}</div> : null}
      </div>
      <a href={value} target="_blank" rel="noreferrer" className="truncate text-right text-slate-100 underline decoration-white/20 underline-offset-4">
        {value}
      </a>
    </div>
  );
}
