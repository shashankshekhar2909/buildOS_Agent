"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
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

  function openPalette() {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

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
        {/* Mobile topbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#07080c]/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <button
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-slate-300 hover:bg-white/[0.05] hover:text-white focus-visible:ring-2 focus-visible:ring-accent/40 outline-none"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <Wordmark size={22} />
          <button
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-slate-300 hover:bg-white/[0.05] hover:text-white focus-visible:ring-2 focus-visible:ring-accent/40 outline-none"
            onClick={openPalette}
            aria-label="Search / command palette"
          >
            <Search size={18} />
          </button>
        </header>

        {/* Desktop topbar (slim) */}
        <header className="sticky top-0 z-20 hidden md:flex items-center justify-end gap-3 border-b border-white/[0.06] bg-[#07080c]/40 px-6 py-2.5 backdrop-blur-xl">
          <button
            onClick={openPalette}
            className="group inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-slate-400 hover:border-white/[0.1] hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 outline-none"
            aria-label="Search / command palette"
          >
            <Search size={13} />
            <span>Quick jump…</span>
            <kbd className="ml-2 inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
              ⌘K
            </kbd>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-8 min-w-0">
          <div className="mx-auto max-w-[1600px] animate-fade-in">{children}</div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
