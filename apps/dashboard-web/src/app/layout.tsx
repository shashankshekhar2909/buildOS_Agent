import "./globals.css";
import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import { Providers } from "@/components/providers";

export const metadata: Metadata = { title: "BuildAgent", description: "AI-native personal OS" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-neutral-200 antialiased">
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
