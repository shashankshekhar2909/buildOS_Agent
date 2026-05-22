"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Me = { id: string; email: string; role: string; is_active: boolean };
type Skill = {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  requires_approval: boolean;
  enabled: boolean;
  manifest: Record<string, unknown>;
};

type SkillForm = {
  name: string;
  version: string;
  description: string;
  permissions: string;
  requires_approval: "true" | "false";
  enabled: "true" | "false";
  manifest: string;
};

const EMPTY_FORM: SkillForm = {
  name: "",
  version: "0.1.0",
  description: "",
  permissions: "",
  requires_approval: "true",
  enabled: "true",
  manifest: "{}",
};

export default function SkillsPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(EMPTY_FORM);

  const meQ = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/auth/me"),
    retry: false,
  });
  const isAuthed = !!meQ.data && !meQ.isError;

  const skillsQ = useQuery<Skill[]>({
    queryKey: ["skills"],
    queryFn: () => api<Skill[]>("/v1/skills"),
    enabled: isAuthed,
    retry: false,
  });

  const grantsQ = useQuery<string[]>({
    queryKey: ["skill-grants", meQ.data?.id],
    queryFn: () => api<string[]>(`/v1/grants/skills/${meQ.data?.id}`),
    enabled: isAuthed && !!meQ.data?.id && ["admin", "operator"].includes(meQ.data?.role ?? ""),
    retry: false,
  });

  const skills = skillsQ.data ?? [];
  const granted = grantsQ.data ?? [];
  const isAdmin = meQ.data?.role === "admin";
  const editingSkill = skills.find((skill) => skill.id === editingId) ?? null;

  const createSkill = useMutation({
    mutationFn: (body: SkillForm) =>
      api<Skill>("/v1/skills", {
        method: "POST",
        body: JSON.stringify(toPayload(body)),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      resetForm();
    },
  });

  const updateSkill = useMutation({
    mutationFn: ({ id, body }: { id: string; body: SkillForm }) =>
      api<Skill>(`/v1/skills/${id}`, {
        method: "PUT",
        body: JSON.stringify(toPayload(body)),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      resetForm();
    },
  });

  const deleteSkill = useMutation({
    mutationFn: (id: string) => api<void>(`/v1/skills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      if (editingId) resetForm();
    },
  });

  const toggleSkill = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api<Skill>(`/v1/skills/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const stats = useMemo(
    () => [
      { label: "Cataloged skills", value: skills.length },
      { label: "Granted to me", value: granted.length },
      { label: "Approval-gated", value: skills.filter((skill) => skill.requires_approval).length },
    ],
    [skills, granted.length]
  );

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function beginEdit(skill: Skill) {
    setEditingId(skill.id);
    setForm({
      name: skill.name,
      version: skill.version,
      description: skill.description,
      permissions: skill.permissions.join(", "),
      requires_approval: skill.requires_approval ? "true" : "false",
      enabled: skill.enabled ? "true" : "false",
      manifest: JSON.stringify(skill.manifest ?? {}, null, 2),
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingSkill) {
      updateSkill.mutate({ id: editingSkill.id, body: form });
    } else {
      createSkill.mutate(form);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted">Skills</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Live skill catalog</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              This page reflects skills discovered from `skills/*/skill.py`, plus any manual catalog entries in the API database.
            </p>
          </div>
          <Link href="/tasks" className="rounded border border-border bg-bg px-4 py-2 text-sm font-medium text-white">
            Create skill task
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <Metric key={item.label} label={item.label} value={item.value} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">{editingSkill ? "Edit skill" : "Create skill"}</CardTitle>
            <CardDescription>Admin only. Manual entries survive until you remove them from the registry.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onSubmit}>
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Version">
                <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </Field>
              <Field label="Description">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Field label="Permissions">
                <Input
                  value={form.permissions}
                  onChange={(e) => setForm({ ...form, permissions: e.target.value })}
                  placeholder="docker:read, docker:write"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Requires approval">
                  <Select value={form.requires_approval} onChange={(e) => setForm({ ...form, requires_approval: e.target.value as "true" | "false" })}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </Select>
                </Field>
                <Field label="Enabled">
                  <Select value={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.value as "true" | "false" })}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </Select>
                </Field>
              </div>
              <Field label="Manifest JSON">
                <textarea
                  className="min-h-40 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-slate-100 shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
                  value={form.manifest}
                  onChange={(e) => setForm({ ...form, manifest: e.target.value })}
                />
              </Field>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="submit" disabled={!isAdmin || createSkill.isPending || updateSkill.isPending}>
                  {editingSkill ? "Save changes" : "Create skill"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Reset
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="text-white">Catalog</CardTitle>
            <CardDescription>Discovered skills and manual registry entries.</CardDescription>
          </CardHeader>
          <CardContent>
            {!isAuthed && meQ.isError && <Empty message="Sign in again to load the live skill catalog." />}
            {meQ.isLoading && <Empty message="Loading session..." />}
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {isAuthed &&
                skills.map((skill) => (
                <div key={skill.id} className="bg-panel px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-white">{skill.name}</div>
                        {skill.manifest?.source === "manual" ? <Badge variant="outline">manual</Badge> : <Badge variant="secondary">file</Badge>}
                      </div>
                      <div className="text-xs text-muted">v{skill.version}</div>
                      <div className="mt-2 text-sm text-muted">{skill.description || "No description."}</div>
                      <div className="mt-2 text-xs text-slate-400">
                        {skill.permissions.length > 0 ? skill.permissions.join(", ") : "No explicit permissions"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        schema keys: {Object.keys((skill.manifest?.schema as Record<string, unknown>) ?? {}).length}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={skill.enabled ? "default" : "secondary"}>{skill.enabled ? "enabled" : "disabled"}</Badge>
                      <Badge variant={skill.requires_approval ? "outline" : "default"}>
                        {skill.requires_approval ? "approval" : "open"}
                      </Badge>
                      <Badge variant="secondary">{String(skill.manifest?.execution ?? "local")}</Badge>
                      <Badge variant="secondary">{String(skill.manifest?.risk ?? "medium")}</Badge>
                      <Badge variant="secondary">{String(skill.manifest?.source ?? "manual")}</Badge>
                      {isAdmin && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => beginEdit(skill)}>
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleSkill.mutate({ id: skill.id, enabled: !skill.enabled })}
                            disabled={toggleSkill.isPending}
                          >
                            {skill.enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteSkill.mutate(skill.id)}
                            disabled={deleteSkill.isPending}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      <Link
                        href={`/skills/${skill.id}`}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-bg px-3 text-xs text-white hover:bg-slate-900"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                </div>
                ))}
              {isAuthed && skillsQ.isError && <Empty message="Could not load the live skill catalog." />}
              {isAuthed && !skillsQ.isLoading && !skillsQ.isError && skills.length === 0 && <Empty message="No skills discovered." />}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function toPayload(form: SkillForm) {
  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(form.manifest || "{}");
  } catch {
    manifest = { raw: form.manifest };
  }
  const permissions = form.permissions
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    name: form.name.trim(),
    version: form.version.trim() || "0.1.0",
    description: form.description.trim(),
    permissions,
    requires_approval: form.requires_approval === "true",
    enabled: form.enabled === "true",
    manifest,
  };
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.15em] text-muted">
      {label}
      {children}
    </label>
  );
}

function Empty({ message }: { message: string }) {
  return <div className="px-4 py-6 text-sm text-muted">{message}</div>;
}
