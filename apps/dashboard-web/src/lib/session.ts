"use client";

import { useEffect, useState } from "react";
import { getRefreshToken, getToken, parseAccessClaims } from "@/lib/api";

export function useSession() {
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const nextToken = getToken();
      setToken(nextToken);
      setRefreshToken(getRefreshToken());
      setReady(true);
    };

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("buildagent:token", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("buildagent:token", sync);
    };
  }, []);

  const claims = parseAccessClaims(token);
  const role = claims?.role ?? "viewer";

  return {
    ready,
    token,
    refreshToken,
    claims,
    role,
  };
}
