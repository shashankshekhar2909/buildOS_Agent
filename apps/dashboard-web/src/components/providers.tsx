"use client";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WS_URL } from "@/lib/api";
import { useSession } from "@/lib/session";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } }));
  return (
    <QueryClientProvider client={qc}>
      <WSBridge />
      {children}
    </QueryClientProvider>
  );
}

function WSBridge() {
  const qc = useQueryClient();
  const session = useSession();

  useEffect(() => {
    if (!session.token) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(`${WS_URL}/client?token=${encodeURIComponent(session.token!)}`);
      ws.onmessage = (m) => {
        try {
          const parsed = JSON.parse(m.data);
          const event: string | undefined = parsed?.event;
          const data: Record<string, unknown> | undefined = parsed?.data;
          if (event?.startsWith("node.")) qc.invalidateQueries({ queryKey: ["nodes"] });
          if (event?.startsWith("task.")) qc.invalidateQueries({ queryKey: ["tasks"] });
          if (event?.startsWith("approval.")) {
            qc.invalidateQueries({ queryKey: ["approvals"] });
            qc.invalidateQueries({ queryKey: ["tasks"] });
          }
          if (event?.startsWith("agent_run.")) {
            qc.invalidateQueries({ queryKey: ["agent-runs"] });
            if (typeof data?.id === "string") qc.invalidateQueries({ queryKey: ["agent-run", data.id] });
            qc.invalidateQueries({ queryKey: ["approvals"] });
          }
          if (event === "memory.changed") qc.invalidateQueries({ queryKey: ["memory"] });
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => {
        try { ws?.close(); } catch {}
      };
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch {}
    };
  }, [qc, session.token]);
  return null;
}
