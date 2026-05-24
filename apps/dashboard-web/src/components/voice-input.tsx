"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

type SR = any;

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export function VoiceInput({
  onTranscript,
  className,
  lang = "en-US",
}: {
  onTranscript: (text: string, isFinal: boolean) => void;
  className?: string;
  lang?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SR | null>(null);

  useEffect(() => {
    const Ctor = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    setSupported(!!Ctor);
  }, []);

  function start() {
    setError(null);
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Voice input not supported in this browser");
      return;
    }
    const rec: SR = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (evt: any) => {
      let interim = "";
      let final = "";
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const res = evt.results[i];
        const text = res[0]?.transcript || "";
        if (res.isFinal) final += text;
        else interim += text;
      }
      if (final) onTranscript(final, true);
      else if (interim) onTranscript(interim, false);
    };
    rec.onerror = (e: any) => {
      setError(e.error || "Voice error");
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (e: any) {
      setError(e?.message || "Failed to start");
    }
  }

  function stop() {
    try {
      recRef.current?.stop();
    } catch {}
    setListening(false);
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      title={error || (listening ? "Stop voice input" : "Start voice input")}
      className={cn(
        "inline-flex items-center justify-center rounded-lg border p-2 transition-all",
        listening
          ? "border-rose-500/30 bg-rose-500/10 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.3)] animate-pulse"
          : "border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-accent/30 hover:bg-accent/10 hover:text-accent",
        className
      )}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </button>
  );
}
