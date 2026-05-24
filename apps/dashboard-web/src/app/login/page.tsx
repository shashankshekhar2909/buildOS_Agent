"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, setTokens } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoMark } from "@/components/brand/logo";

export default function Login() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (session.ready && session.token) router.replace("/");
  }, [router, session.ready, session.token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await fetch(`${API_URL}/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { access_token, refresh_token } = await res.json();
      setTokens(access_token, refresh_token);
      router.push("/");
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      {/* Dynamic Cybernetic Ambient Backlight Glows */}
      <div className="absolute top-1/2 left-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/8 blur-[100px] pointer-events-none" />
      <div className="absolute top-1/4 left-1/3 h-[250px] w-[250px] rounded-full bg-indigo-500/5 blur-[80px] pointer-events-none animate-pulse-glow" />

      <div className="relative z-10 w-full max-w-md space-y-8 animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <div className="relative p-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md shadow-glow-accent">
            <LogoMark size={52} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
              Build<span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-indigo-400">Agent</span>
            </h1>
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500 font-mono mt-1.5">AI-Native Personal OS</p>
          </div>
        </div>

        <Card className="border-white/[0.06] bg-[#07080c]/60 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
          <CardHeader className="space-y-3 pb-4">
            <CardTitle className="text-xl font-bold tracking-tight text-white font-sans">Sign in</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Access the distributed multi-agent control room dashboard.
            </CardDescription>
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-3 text-[11px] font-mono leading-5 text-slate-500">
              <span className="text-slate-400 font-semibold uppercase tracking-wider block text-[9px] mb-1">Admin-managed access:</span>
              <div>Use a valid account issued by the admin panel.</div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-3">
                <Input
                  placeholder="name@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="font-mono text-xs"
                />
                <Input
                  placeholder="Enter secure password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              {err && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5 text-xs text-rose-400 font-mono">
                  {err}
                </div>
              )}
              <Button className="w-full font-semibold" type="submit">
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );

}
