"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, BookOpen, Box, Cpu, FileClock, Brain, Settings, Workflow, Wrench, ShieldCheck, MessageSquare, History, Users2, X, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { API_URL, clearTokens, getRefreshToken } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Wordmark } from "@/components/brand/logo";

const items = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/onboarding", label: "Onboarding", icon: BookOpen },
  { href: "/nodes", label: "Nodes", icon: Cpu },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/agents", label: "Agents", icon: Workflow },
  { href: "/agent-runs", label: "Runs", icon: History },
  { href: "/skills", label: "Skills", icon: Wrench },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/tasks", label: "Tasks", icon: Box },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, roles: ["admin", "operator"] },
  { href: "/users", label: "Users", icon: Users2, roles: ["admin"] },
  { href: "/logs", label: "Logs", icon: FileClock, roles: ["admin", "operator"] },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const session = useSession();
  const role = session.role;

  async function logout() {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await fetch(`${API_URL}/v1/auth/logout`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
      } catch {}
    }
    clearTokens();
    router.push("/login");
  }

  function handleNav() {
    if (onClose) onClose();
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-72 shrink-0 flex-col border-r border-white/[0.06] bg-[#07080c]/95 p-4 backdrop-blur-xl transition-transform duration-200 md:sticky md:top-0 md:w-64 md:translate-x-0 md:bg-[#07080c]/50",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 hover:bg-white/[0.05] hover:text-white md:hidden"
          onClick={onClose}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>

        <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-md">
          <div className="absolute -left-4 -top-4 h-12 w-12 rounded-full bg-accent/10 blur-xl" />
          <Wordmark size={30} className="relative z-10" />
          <div className="mt-3 flex flex-wrap items-center gap-2 relative z-10">
            <Badge variant="secondary" className="text-[9px] font-mono tracking-wider uppercase bg-white/[0.04] text-slate-400 border border-white/[0.05]">Docker</Badge>
            <Badge variant="outline" className="text-[9px] font-mono tracking-wider uppercase border-emerald-500/20 bg-emerald-500/5 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.1)]">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse status-glow-emerald" />
              Live
            </Badge>
          </div>
        </div>

        <Separator className="my-4 bg-white/[0.06]" />

        <div className="flex flex-col gap-1 flex-1 overflow-y-auto pr-1">
          {items.filter((item) => !item.roles || item.roles.includes(role)).map(({ href, label, icon: Icon }) => {
            const active = path === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={handleNav}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 relative group h-11",
                  active
                    ? "bg-accent/10 text-white font-medium shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border-l-2 border-accent"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.03]"
                )}
              >
                <Icon size={16} className={cn("transition-colors", active ? "text-accent" : "text-slate-500 group-hover:text-slate-300")} />
                <span>{label}</span>
                {active && (
                  <span className="absolute right-3.5 h-1.5 w-1.5 rounded-full bg-accent status-glow-accent animate-pulse" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pt-4 text-[11px] text-slate-500">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-3.5 leading-6 font-mono">
            <div className="font-sans font-medium text-slate-300 text-xs mb-1.5 flex items-center justify-between">
              <span>System links</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 status-glow-emerald" />
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Role:</span>
              <span className="text-slate-300 font-semibold">{role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">API Gateway:</span>
              <span className="text-slate-300 font-medium">8800</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Web App:</span>
              <span className="text-slate-300 font-medium">3300</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">LiteLLM:</span>
              <span className="text-slate-300 font-medium">4400</span>
            </div>
          </div>

          <button
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-transparent px-3.5 py-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/5 transition-all text-xs font-medium"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
