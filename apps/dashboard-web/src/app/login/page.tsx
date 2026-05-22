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
  const [mode, setMode] = useState<"login" | "register">("login");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (session.ready && session.token) router.replace("/");
  }, [router, session.ready, session.token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const res = await fetch(`${API_URL}/v1/auth/${mode}`, {
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
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-3">
        <LogoMark size={56} />
        <div className="text-center">
          <div className="text-xl font-semibold text-white tracking-tight">BuildAgent</div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mt-1">AI-native personal OS</div>
        </div>
      </div>
      <Card className="w-full border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">{mode === "login" ? "Sign in" : "Register"}</CardTitle>
          <CardDescription>Use your BuildAgent account to reach the control room.</CardDescription>
          <p className="text-xs text-slate-400">
            Bootstrap creds: <span className="font-mono text-slate-200">admin@example.com</span> /{" "}
            <span className="font-mono text-slate-200">password123</span>
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input
              placeholder="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              placeholder="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {err && <div className="text-xs text-red-400">{err}</div>}
            <Button className="w-full" type="submit">
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <button
            className="mt-4 text-xs text-slate-400 hover:text-white"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
