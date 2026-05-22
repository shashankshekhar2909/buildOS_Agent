import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL } from "./api";

function wsUrl(token: string): string {
  // API_URL -> ws(s) URL with token query
  const u = new URL(API_URL);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}/ws/client?token=${encodeURIComponent(token)}`;
}

export function useEventBridge(token: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl(token));
      } catch {
        reconnect = setTimeout(connect, 3000);
        return;
      }
      ws.onmessage = (m) => {
        try {
          const parsed = JSON.parse(m.data);
          const event: string | undefined = parsed?.event;
          const data: Record<string, unknown> | undefined = parsed?.data;
          if (event?.startsWith("agent_run.")) {
            qc.invalidateQueries({ queryKey: ["agent-runs"] });
            if (typeof data?.id === "string") qc.invalidateQueries({ queryKey: ["agent-run", data.id] });
            qc.invalidateQueries({ queryKey: ["approvals"] });
          }
          if (event?.startsWith("approval.")) {
            qc.invalidateQueries({ queryKey: ["approvals"] });
          }
          if (event?.startsWith("task.")) {
            qc.invalidateQueries({ queryKey: ["tasks"] });
          }
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        reconnect = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        try { ws?.close(); } catch {}
      };
    };
    connect();

    return () => {
      closed = true;
      if (reconnect) clearTimeout(reconnect);
      try { ws?.close(); } catch {}
    };
  }, [qc, token]);
}
