import { useEffect, useState } from "react";
import { getAccess } from "./api";

export function useSession(): { ready: boolean; token: string | null } {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAccess().then((t) => {
      if (!cancelled) {
        setToken(t);
        setReady(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return { ready, token };
}
