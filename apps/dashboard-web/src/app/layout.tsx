import "./globals.css";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "BuildAgent — Control Room", template: "%s · BuildAgent" },
  description: "AI-native personal OS. Multi-agent orchestration, distributed nodes, approvals, audit.",
  applicationName: "BuildAgent",
  themeColor: "#06070a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen text-slate-200 antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
