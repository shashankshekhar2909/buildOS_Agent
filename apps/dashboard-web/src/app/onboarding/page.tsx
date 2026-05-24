"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

type Me = { id: string; email: string; role: string; is_active: boolean };

type Step = {
  title: string;
  body: string;
  link: string;
  linkLabel: string;
  done: boolean;
};

export default function OnboardingPage() {
  const meQ = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/auth/me"),
    retry: false,
  });

  const role = meQ.data?.role ?? "viewer";
  const steps: Step[] = [
    {
      title: "Sign in",
      body: "Use the bootstrap admin or your own account. Login is the gate for everything else.",
      link: "/login",
      linkLabel: "Open login",
      done: Boolean(meQ.data),
    },
    {
      title: "Check settings",
      body: "Verify the API, providers, Gemini route, and defaults under Settings.",
      link: "/settings",
      linkLabel: "Open settings",
      done: role === "admin",
    },
    {
      title: "Create or edit a skill",
      body: "Use Skills to create manual entries or open a skill detail page to save presets and import/export them.",
      link: "/skills",
      linkLabel: "Open skills",
      done: false,
    },
    {
      title: "Register a node",
      body: "Add host, user, and SSH auth on Nodes, then use the SSH skill to run commands.",
      link: "/nodes",
      linkLabel: "Open nodes",
      done: false,
    },
    {
      title: "Schedule work",
      body: "Use Tasks to run one-off or recurring work, or use the skill/agent runners for live execution.",
      link: "/tasks",
      linkLabel: "Open tasks",
      done: false,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted">Onboarding</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Start here</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Small setup path for first run. Follow the steps once, then you can jump straight into agents, skills, nodes, and tasks.
            </p>
          </div>
          <Badge variant="outline">{role}</Badge>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => (
          <Card key={step.title} className="border-white/10 bg-slate-950/70">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-white">
                  {index + 1}. {step.title}
                </CardTitle>
                <Badge variant={step.done ? "default" : "outline"}>{step.done ? "done" : "todo"}</Badge>
              </div>
              <CardDescription>{step.body}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={step.link}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-white/[0.08] bg-transparent px-3 text-xs text-slate-300 transition-all hover:bg-white/[0.04] hover:text-white"
                >
                  {step.linkLabel}
                </Link>
                {step.title === "Sign in" && (
                  <span className="text-xs text-muted">admin@example.com / password123</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Fast path</div>
            <div className="text-xs text-muted">
              If you want the shortest route: login, settings, nodes, skills, tasks.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings" className="inline-flex h-8 items-center justify-center rounded-lg border border-white/[0.08] px-3 text-xs text-slate-300 hover:bg-white/[0.04] hover:text-white">
              Settings
            </Link>
            <Link href="/nodes" className="inline-flex h-8 items-center justify-center rounded-lg border border-white/[0.08] px-3 text-xs text-slate-300 hover:bg-white/[0.04] hover:text-white">
              Nodes
            </Link>
            <Link href="/skills" className="inline-flex h-8 items-center justify-center rounded-lg border border-white/[0.08] px-3 text-xs text-slate-300 hover:bg-white/[0.04] hover:text-white">
              Skills
            </Link>
            <Link href="/tasks" className="inline-flex h-8 items-center justify-center rounded-lg border border-white/[0.08] px-3 text-xs text-slate-300 hover:bg-white/[0.04] hover:text-white">
              Tasks
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
