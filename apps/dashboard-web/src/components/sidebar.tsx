"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Box, Cpu, FileClock, Brain, Settings, Workflow, Wrench, ShieldCheck, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { API_URL, clearTokens, getRefreshToken } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Wordmark } from "@/components/brand/logo";

const items = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/nodes", label: "Nodes", icon: Cpu },
  { href: "/agents", label: "Agents", icon: Workflow },
  { href: "/skills", label: "Skills", icon: Wrench },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/tasks", label: "Tasks", icon: Box },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, roles: ["admin", "operator"] },
  { href: "/logs", label: "Logs", icon: FileClock, roles: ["admin", "operator"] },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
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

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-slate-950/80 p-4 backdrop-blur-xl">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4">
        <Wordmark size={32} />
        <div className="mt-3 flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">Docker</Badge>
          <Badge variant="outline" className="text-[10px]">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </Badge>
        </div>
      </div>
      <Separator className="my-4" />
      {items.filter((item) => !item.roles || item.roles.includes(role)).map(({ href, label, icon: Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }),
              "justify-start gap-3 rounded-xl px-3 py-2 h-10"
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
      <div className="mt-auto pt-4 text-xs text-slate-500">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 leading-5">
          <div className="font-medium text-slate-300">System links</div>
          <div>Role {role}</div>
          <div>API 8800</div>
          <div>Web 3300</div>
          <div>LiteLLM 4400</div>
        </div>
        <button
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-3 w-full justify-start rounded-xl px-3")}
          onClick={logout}
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
