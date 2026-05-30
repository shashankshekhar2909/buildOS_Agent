"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpBanner } from "@/components/help-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

type Node = { id: string; name: string };

const PROJECT_TYPES = ["web", "api", "mobile", "desktop", "cli", "library"];
const PROJECT_STATUSES = ["draft", "ready", "building", "built", "failed"];

const emptyForm = {
  name: "",
  projectType: "web",
  stack: "",
  brief: "",
  featuresText: "",
  constraintsText: "",
  repoUrl: "",
  workspacePath: "",
  nodeId: "",
  buildCommand: "",
  testCommand: "",
  runCommand: "",
  deployCommand: "",
  status: "draft",
};

export default function ProjectsPage() {
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/v1/projects"),
    refetchInterval: 30000,
  });
  const { data: nodes = [] } = useQuery<Node[]>({
    queryKey: ["nodes"],
    queryFn: () => api<Node[]>("/v1/nodes"),
  });
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => api<Task[]>("/v1/tasks"),
    refetchInterval: 30000,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [recentTaskId, setRecentTaskId] = useState<string | null>(null);

  const taskMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const projectId = String(task.payload?.["project_id"] || "").trim();
      if (!projectId) continue;
      const list = map.get(projectId) || [];
      list.push(task);
      map.set(projectId, list);
    }
    return map;
  }, [tasks]);

  const saveProject = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        project_type: form.projectType,
        stack: form.stack,
        brief: form.brief,
        features: splitLines(form.featuresText),
        constraints: splitLines(form.constraintsText),
        repo_url: form.repoUrl || null,
        workspace_path: form.workspacePath || null,
        node_id: form.nodeId || null,
        build_command: form.buildCommand || null,
        test_command: form.testCommand || null,
        run_command: form.runCommand || null,
        deploy_command: form.deployCommand || null,
        status: form.status,
      };
      if (editingId) {
        return api<Project>(`/v1/projects/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      }
      return api<Project>("/v1/projects", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: (project) => {
      setEditingId(null);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["projects"] });
      setRecentTaskId(project.last_task_id);
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => api(`/v1/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const buildProject = useMutation({
    mutationFn: (id: string) => api<Task>(`/v1/projects/${id}/build`, { method: "POST" }),
    onSuccess: (task, id) => {
      setRecentTaskId(task.id);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setForm((prev) => prev);
    },
  });

  function loadForEdit(project: Project) {
    setEditingId(project.id);
    setForm({
      name: project.name,
      projectType: project.project_type || "web",
      stack: project.stack || "",
      brief: project.brief || "",
      featuresText: (project.features || []).join("\n"),
      constraintsText: (project.constraints || []).join("\n"),
      repoUrl: project.repo_url || "",
      workspacePath: project.workspace_path || "",
      nodeId: project.node_id || "",
      buildCommand: project.build_command || "",
      testCommand: project.test_command || "",
      runCommand: project.run_command || "",
      deployCommand: project.deploy_command || "",
      status: project.status || "draft",
    });
  }

  const formValid = form.name.trim().length > 0 && form.brief.trim().length > 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Projects</span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white font-sans">Project Briefs</h1>
        <p className="mt-2 text-sm text-slate-400 font-sans">
          Define a project type, stack, brief, and commands. Build launches the agent against the brief.
        </p>
      </div>

      <HelpBanner
        title="What a project needs"
        description="Give the agent enough context to plan, edit, test, and report back."
        bullets={[
          "Project type and stack tell the agent what it is building.",
          "Brief and features describe the target scope.",
          "Build/test/run commands guide repeatable execution.",
          "Node is optional, but useful for remote SSH-based work.",
        ]}
        href="/tasks"
        hrefLabel="See task runs"
      />

      {recentTaskId && (
        <Card className="border-emerald-500/15 bg-emerald-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="text-sm font-semibold text-white">Latest build queued</div>
              <div className="text-xs text-slate-400">Task ID {recentTaskId}</div>
            </div>
            <Link href={`/tasks/${recentTaskId}`}>
              <Button size="sm" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                Open task
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
          <CardHeader className="border-b border-white/[0.06] bg-white/[0.01]">
            <CardTitle className="text-base font-bold text-white font-sans">{editingId ? "Edit Project" : "New Project"}</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {editingId ? "Update the project brief or commands." : "Create a project brief and build plan."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. marketing-site" />
              </Field>
              <Field label="Type">
                <Select value={form.projectType} onChange={(e) => setForm((s) => ({ ...s, projectType: e.target.value }))}>
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stack">
                <Input value={form.stack} onChange={(e) => setForm((s) => ({ ...s, stack: e.target.value }))} placeholder="Next.js, FastAPI" />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
                  {PROJECT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Brief">
              <textarea
                value={form.brief}
                onChange={(e) => setForm((s) => ({ ...s, brief: e.target.value }))}
                rows={5}
                className="min-h-[120px] w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent/40"
                placeholder="What are we building, for whom, and what does done look like?"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Features">
                <textarea
                  value={form.featuresText}
                  onChange={(e) => setForm((s) => ({ ...s, featuresText: e.target.value }))}
                  rows={4}
                  className="min-h-[100px] w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent/40"
                  placeholder="One feature per line"
                />
              </Field>
              <Field label="Constraints">
                <textarea
                  value={form.constraintsText}
                  onChange={(e) => setForm((s) => ({ ...s, constraintsText: e.target.value }))}
                  rows={4}
                  className="min-h-[100px] w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent/40"
                  placeholder="One constraint per line"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Repo URL">
                <Input value={form.repoUrl} onChange={(e) => setForm((s) => ({ ...s, repoUrl: e.target.value }))} placeholder="https://github.com/..." />
              </Field>
              <Field label="Workspace Path">
                <Input value={form.workspacePath} onChange={(e) => setForm((s) => ({ ...s, workspacePath: e.target.value }))} placeholder="/workspace/app" />
              </Field>
            </div>

            <Field label="Node">
              <Select value={form.nodeId} onChange={(e) => setForm((s) => ({ ...s, nodeId: e.target.value }))}>
                <option value="">None</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Build Command">
              <Input value={form.buildCommand} onChange={(e) => setForm((s) => ({ ...s, buildCommand: e.target.value }))} placeholder="npm run build" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Test Command">
                <Input value={form.testCommand} onChange={(e) => setForm((s) => ({ ...s, testCommand: e.target.value }))} placeholder="npm test" />
              </Field>
              <Field label="Run Command">
                <Input value={form.runCommand} onChange={(e) => setForm((s) => ({ ...s, runCommand: e.target.value }))} placeholder="npm run dev" />
              </Field>
            </div>
            <Field label="Deploy Command">
              <Input value={form.deployCommand} onChange={(e) => setForm((s) => ({ ...s, deployCommand: e.target.value }))} placeholder="docker compose up -d" />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => saveProject.mutate()}
                disabled={!formValid || saveProject.isPending}
                className="bg-accent text-slate-950 hover:bg-accent/90"
              >
                {editingId ? "Save project" : "Create project"}
              </Button>
              {editingId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel edit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {projects.map((project) => {
            const buildTasks = taskMap.get(project.id) || [];
            const latestBuild = buildTasks[0];
            const preview = (latestBuild?.result?.["preview"] as Record<string, unknown> | undefined) ?? undefined;
            const previewFrontend = preview?.["frontend"] as Record<string, unknown> | undefined;
            const previewBackend = preview?.["backend"] as Record<string, unknown> | undefined;
            const frontendPort = preview?.["frontend_port"] as number | undefined;
            const backendPort = preview?.["backend_port"] as number | undefined;
            const host = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
            return (
              <Card key={project.id} className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md shadow-2xl">
                <CardHeader className="border-b border-white/[0.06] bg-white/[0.01]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base font-bold text-white font-sans">{project.name}</CardTitle>
                      <CardDescription className="text-xs text-slate-400">{project.project_type} · {project.stack || "no stack"}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{project.status}</Badge>
                      {latestBuild && <Badge variant="secondary">{latestBuild.state}</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <p className="text-sm leading-6 text-slate-300">{project.brief || "No brief provided."}</p>
                  <div className="flex flex-wrap gap-2">
                    {(project.features || []).slice(0, 6).map((feature) => (
                      <Badge key={feature} variant="secondary" className="bg-white/[0.03]">
                        {feature}
                      </Badge>
                    ))}
                    {(project.constraints || []).slice(0, 4).map((constraint) => (
                      <Badge key={constraint} variant="outline" className="border-amber-500/20 text-amber-300">
                        {constraint}
                      </Badge>
                    ))}
                  </div>
                  <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                    <Mini label="Repo" value={project.repo_url || "none"} />
                    <Mini label="Workspace" value={project.workspace_path || "none"} />
                    <Mini label="Node" value={project.node_id || "none"} />
                    <Mini label="Build" value={project.build_command || "none"} />
                  </div>
                  {frontendPort || backendPort ? (
                    <div className="grid gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3 text-xs">
                      <div className="font-mono uppercase tracking-[0.2em] text-emerald-300">Live preview</div>
                      {frontendPort ? (
                        <PreviewLink
                          label="Frontend"
                          href={`http://${host}:${frontendPort}`}
                          meta={previewFrontend?.["container_name"] ? String(previewFrontend["container_name"]) : undefined}
                        />
                      ) : null}
                      {backendPort ? (
                        <PreviewLink
                          label="Backend"
                          href={`http://${host}:${backendPort}`}
                          meta={previewBackend?.["container_name"] ? String(previewBackend["container_name"]) : undefined}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="bg-accent text-slate-950 hover:bg-accent/90" onClick={() => buildProject.mutate(project.id)}>
                      Build
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => loadForEdit(project)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteProject.mutate(project.id)} className="border-rose-500/20 text-rose-300 hover:bg-rose-500/10">
                      Delete
                    </Button>
                    {latestBuild?.id && (
                      <Link href={`/tasks/${latestBuild.id}`}>
                        <Button size="sm" variant="outline">
                          Open build
                        </Button>
                      </Link>
                    )}
                  </div>
                  {latestBuild && (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-slate-400">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>Latest task: {latestBuild.title}</span>
                        <span className="font-mono">{latestBuild.state}</span>
                      </div>
                      {latestBuild.error && <div className="mt-2 text-rose-300">{latestBuild.error}</div>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {projects.length === 0 && (
            <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md">
              <CardContent className="p-6 text-sm text-slate-400">No projects yet. Create one on the left.</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2">
      <span className="font-mono uppercase tracking-[0.2em] text-[10px] text-slate-500">{label}</span>
      <span className="truncate text-right text-slate-300">{value}</span>
    </div>
  );
}

function PreviewLink({ label, href, meta }: { label: string; href: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">{label}</div>
        {meta ? <div className="mt-1 truncate text-[11px] text-slate-500">{meta}</div> : null}
      </div>
      <a href={href} target="_blank" rel="noreferrer" className="truncate text-right text-slate-100 underline decoration-white/20 underline-offset-4">
        Open
      </a>
    </div>
  );
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
