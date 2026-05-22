"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, setTokens } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [err, setErr] = useState<string | null>(null);

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
    <div className="max-w-sm mx-auto mt-20">
      <h1 className="text-xl font-semibold mb-6">{mode === "login" ? "Sign in" : "Register"}</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full bg-panel border border-border rounded px-3 py-2 text-sm"
          placeholder="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full bg-panel border border-border rounded px-3 py-2 text-sm"
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div className="text-red-400 text-xs">{err}</div>}
        <button className="w-full bg-accent text-white rounded py-2 text-sm font-medium">
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button
        className="text-xs text-muted mt-4 hover:text-white"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
