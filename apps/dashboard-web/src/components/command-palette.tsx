"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity, BookOpen, Box, Brain, Cpu, FileClock, FolderKanban, History,
  MessageSquare, Settings, ShieldCheck, Users2, Workflow, Wrench,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useSession } from "@/lib/session";

const nav = [
  { href: "/", label: "Overview", icon: Activity, hint: "Dashboard" },
  { href: "/onboarding", label: "Onboarding", icon: BookOpen, hint: "First-run" },
  { href: "/agents", label: "Agents", icon: Workflow, hint: "Roster + runner" },
  { href: "/agent-runs", label: "Runs", icon: History, hint: "Recent agent runs" },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, hint: "Pending decisions", roles: ["admin", "operator"] },
  { href: "/nodes", label: "Nodes", icon: Cpu, hint: "Fleet" },
  { href: "/projects", label: "Projects", icon: FolderKanban, hint: "Workspaces" },
  { href: "/tasks", label: "Tasks", icon: Box, hint: "Scheduled + recurring" },
  { href: "/skills", label: "Skills", icon: Wrench, hint: "Catalog" },
  { href: "/messages", label: "Messages", icon: MessageSquare, hint: "Telegram/Slack" },
  { href: "/memory", label: "Memory", icon: Brain, hint: "pgvector semantic" },
  { href: "/users", label: "Users", icon: Users2, hint: "User CRUD", roles: ["admin"] },
  { href: "/logs", label: "Logs", icon: FileClock, hint: "Audit trail", roles: ["admin", "operator"] },
  { href: "/settings", label: "Settings", icon: Settings, hint: "Providers + session" },
];

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const session = useSession();
  const role = session.role;

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to page, run an action…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {nav
            .filter((item) => !item.roles || item.roles.includes(role))
            .map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.href} value={`${item.label} ${item.hint}`} onSelect={() => go(item.href)}>
                  <Icon size={14} className="text-slate-400" />
                  <span>{item.label}</span>
                  <span className="text-xs text-slate-500">— {item.hint}</span>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              );
            })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
