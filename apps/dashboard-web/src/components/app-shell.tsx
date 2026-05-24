"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Separator } from "@/components/ui/separator";
import { SiteFooter } from "@/components/site-footer";
import { Wordmark } from "@/components/brand/logo";
import { useSession } from "@/lib/session";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const session = useSession();
  const authRoute = path.startsWith("/login");
  const role = session.role;
  const routeRules: Array<{ path: string; roles: string[] }> = [
    { path: "/approvals", roles: ["admin", "operator"] },
    { path: "/logs", roles: ["admin", "operator"] },
    { path: "/users", roles: ["admin"] },
  ];
  const matchingRule = routeRules.find((rule) => path === rule.path || path.startsWith(`${rule.path}/`));
  const canAccessRoute = !matchingRule || matchingRule.roles.includes(role);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!authRoute && session.ready && !session.token) router.replace("/login");
  }, [authRoute, router, session.ready, session.token]);

  useEffect(() => {
    if (!authRoute && session.ready && session.token && !canAccessRoute) router.replace("/");
  }, [authRoute, canAccessRoute, router, session.ready, session.token]);

  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  if (authRoute) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (!session.ready || !session.token) {
    return <main className="min-h-screen" />;
  }

  if (!canAccessRoute) {
    return <main className="min-h-screen" />;
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex flex-1 min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#07080c]/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <button
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-slate-300 hover:bg-white/[0.05] hover:text-white"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <Wordmark size={22} />
          <div className="w-9" />
        </header>
        <main className="flex-1 p-4 sm:p-6 md:p-8 min-w-0">
          <div className="mb-6 md:mb-8 hidden md:block">
            <Separator className="bg-white/[0.06]" />
          </div>
          <div className="mx-auto max-w-[1600px] animate-fade-in">{children}</div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
