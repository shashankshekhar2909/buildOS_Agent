"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type UserRow = {
  id: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
};

type UserCreateIn = {
  email: string;
  password: string;
  role: UserRow["role"];
  is_active: boolean;
};

type UserUpdateIn = Partial<Pick<UserRow, "email" | "role" | "is_active">> & { password?: string };

const roles: UserRow["role"][] = ["admin", "operator", "viewer"];

export default function UsersPage() {
  const session = useSession();
  const qc = useQueryClient();
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<UserRow["role"]>("viewer");
  const [createActive, setCreateActive] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UserRow["role"]>("viewer");
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: () => api<UserRow[]>("/v1/users"),
    enabled: session.ready && session.role === "admin",
    retry: false,
  });

  const users = usersQ.data ?? [];
  const selected = useMemo(() => users.find((u) => u.id === selectedId) ?? users[0] ?? null, [selectedId, users]);

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setEditEmail(selected.email);
    setEditRole(selected.role);
    setEditActive(selected.is_active);
    setEditPassword("");
  }, [selected?.id]);

  async function createUser() {
    setStatus(null);
    const body: UserCreateIn = {
      email: createEmail,
      password: createPassword,
      role: createRole,
      is_active: createActive,
    };
    await api("/v1/users", { method: "POST", body: JSON.stringify(body) });
    setStatus("User created");
    setCreateEmail("");
    setCreatePassword("");
    setCreateRole("viewer");
    setCreateActive(true);
    await qc.invalidateQueries({ queryKey: ["users"] });
  }

  async function saveUser() {
    if (!selected) return;
    setStatus(null);
    const body: UserUpdateIn = {
      email: editEmail,
      role: editRole,
      is_active: editActive,
    };
    if (editPassword) body.password = editPassword;
    await api(`/v1/users/${selected.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setStatus("User updated");
    setEditPassword("");
    await qc.invalidateQueries({ queryKey: ["users"] });
  }

  async function toggleActive(user: UserRow) {
    setStatus(null);
    await api(`/v1/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    setStatus(user.is_active ? "User disabled" : "User enabled");
    await qc.invalidateQueries({ queryKey: ["users"] });
  }

  if (session.ready && session.role !== "admin") {
    return <div className="rounded-2xl border border-border bg-panel p-6 text-sm text-muted">Admin access required.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Users</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">User management</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Add users, change roles, disable accounts, and reset passwords from one admin screen.
        </p>
        {status && <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-slate-300">{status}</div>}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-white">Create user</CardTitle>
            <CardDescription>Issue a new account. No public signup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="name@example.com" />
            <Input value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Temp password" type="password" />
            <div className="grid gap-3 md:grid-cols-2">
              <Select value={createRole} onChange={(e) => setCreateRole(e.target.value as UserRow["role"])}>
                {roles.map((role) => <option key={role} value={role}>{role}</option>)}
              </Select>
              <Select value={createActive ? "active" : "inactive"} onChange={(e) => setCreateActive(e.target.value === "active")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <Button onClick={() => void createUser()} className="w-full">Create user</Button>
          </CardContent>
        </Card>

        <Card className="border-white/[0.06] bg-slate-950/40 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-white">Edit user</CardTitle>
            <CardDescription>Update role, password, or account state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={selected?.id ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="" disabled>Choose user</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
            </Select>
            <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" />
            <Input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="New password" type="password" />
            <div className="grid gap-3 md:grid-cols-2">
              <Select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRow["role"])}>
                {roles.map((role) => <option key={role} value={role}>{role}</option>)}
              </Select>
              <Select value={editActive ? "active" : "inactive"} onChange={(e) => setEditActive(e.target.value === "active")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <Button onClick={() => void saveUser()} className="w-full" disabled={!selected}>Save changes</Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => (
          <Card key={user.id} className={`border-white/[0.06] bg-slate-950/40 backdrop-blur-md ${selected?.id === user.id ? "ring-1 ring-accent/40" : ""}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base text-white">{user.email}</CardTitle>
                <Badge variant="outline" className="uppercase tracking-wider text-[9px]">{user.role}</Badge>
              </div>
              <CardDescription>{new Date(user.created_at).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Status</span>
                <span>{user.is_active ? "active" : "inactive"}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setSelectedId(user.id)}>Edit</Button>
                <Button variant="outline" className="flex-1" onClick={() => void toggleActive(user)}>
                  {user.is_active ? "Disable" : "Enable"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
