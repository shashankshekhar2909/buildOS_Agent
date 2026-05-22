"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Separator } from "@/components/ui/separator";
import { useSession } from "@/lib/session";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const session = useSession();
  const authRoute = path.startsWith("/login");
  const role = session.role;
  const isPrivilegedRoute = path === "/approvals" || path === "/logs";
  const canAccessRoute = !isPrivilegedRoute || role === "admin" || role === "operator";

  useEffect(() => {
    if (!authRoute && session.ready && !session.token) router.replace("/login");
  }, [authRoute, router, session.ready, session.token]);

  useEffect(() => {
    if (!authRoute && session.ready && session.token && !canAccessRoute) router.replace("/");
  }, [authRoute, canAccessRoute, router, session.ready, session.token]);

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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6">
        <div className="mb-6">
          <Separator />
        </div>
        <div className="mx-auto max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}
