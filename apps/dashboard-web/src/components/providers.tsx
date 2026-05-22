"use client";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { WS_URL, getToken } from "@/lib/api";

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
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}/client?token=${encodeURIComponent(token)}`);
    ws.onmessage = (m) => {
      try {
        const { event } = JSON.parse(m.data);
        if (event?.startsWith("node.")) qc.invalidateQueries({ queryKey: ["nodes"] });
        if (event?.startsWith("task.")) qc.invalidateQueries({ queryKey: ["tasks"] });
        if (event?.startsWith("approval.")) {
          qc.invalidateQueries({ queryKey: ["approvals"] });
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }
      } catch {}
    };
    return () => ws.close();
  }, [qc]);
  return null;
}
