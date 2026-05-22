"use client";
import { useEffect, useState } from "react";
import { WS_URL, getToken } from "./api";

export type WSEvent = { event: string; data: any };

export function useWS(onEvent?: (e: WSEvent) => void) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}/client?token=${encodeURIComponent(token)}`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (m) => {
      try {
        const parsed = JSON.parse(m.data);
        onEvent?.(parsed);
      } catch {}
    };
    return () => ws.close();
  }, [onEvent]);
  return { connected };
}
