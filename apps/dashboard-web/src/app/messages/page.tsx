"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpBanner } from "@/components/help-banner";

type Me = { id: string; email: string; role: string; is_active: boolean };

type TelegramConnector = {
  registered: boolean;
  bot_name: string | null;
  bot_username: string | null;
  default_chat_id: string | null;
};

type SlackConnector = {
  registered: boolean;
  team: string | null;
  user: string | null;
  default_channel_id: string | null;
};

export default function MessagesPage() {
  const qc = useQueryClient();
  const meQ = useQuery<Me>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/v1/auth/me"),
    retry: false,
  });

  const telegramQ = useQuery<TelegramConnector>({
    queryKey: ["messages-telegram", meQ.data?.id ?? "anon"],
    queryFn: () => api<TelegramConnector>("/v1/connectors/telegram"),
    enabled: Boolean(meQ.data?.id),
    retry: false,
  });

  const slackQ = useQuery<SlackConnector>({
    queryKey: ["messages-slack", meQ.data?.id ?? "anon"],
    queryFn: () => api<SlackConnector>("/v1/connectors/slack"),
    enabled: Boolean(meQ.data?.id),
    retry: false,
  });

  const [telegramToken, setTelegramToken] = useState("");
  const [telegramDefaultChatId, setTelegramDefaultChatId] = useState("");
  const [slackToken, setSlackToken] = useState("");
  const [slackDefaultChannelId, setSlackDefaultChannelId] = useState("");

  useEffect(() => {
    if (telegramQ.data?.default_chat_id) setTelegramDefaultChatId(telegramQ.data.default_chat_id);
  }, [telegramQ.data?.default_chat_id]);

  useEffect(() => {
    if (slackQ.data?.default_channel_id) setSlackDefaultChannelId(slackQ.data.default_channel_id);
  }, [slackQ.data?.default_channel_id]);

  const saveTelegram = useMutation({
    mutationFn: () =>
      api<TelegramConnector>("/v1/connectors/telegram", {
        method: "PUT",
        body: JSON.stringify({
          bot_token: telegramToken,
          default_chat_id: telegramDefaultChatId || null,
        }),
      }),
    onSuccess: () => {
      setTelegramToken("");
      qc.invalidateQueries({ queryKey: ["messages-telegram", meQ.data?.id ?? "anon"] });
    },
  });

  const clearTelegram = useMutation({
    mutationFn: () => api<void>("/v1/connectors/telegram", { method: "DELETE" }),
    onSuccess: () => {
      setTelegramToken("");
      setTelegramDefaultChatId("");
      qc.invalidateQueries({ queryKey: ["messages-telegram", meQ.data?.id ?? "anon"] });
    },
  });

  const saveSlack = useMutation({
    mutationFn: () =>
      api<SlackConnector>("/v1/connectors/slack", {
        method: "PUT",
        body: JSON.stringify({
          bot_token: slackToken,
          default_channel_id: slackDefaultChannelId || null,
        }),
      }),
    onSuccess: () => {
      setSlackToken("");
      qc.invalidateQueries({ queryKey: ["messages-slack", meQ.data?.id ?? "anon"] });
    },
  });

  const clearSlack = useMutation({
    mutationFn: () => api<void>("/v1/connectors/slack", { method: "DELETE" }),
    onSuccess: () => {
      setSlackToken("");
      setSlackDefaultChannelId("");
      qc.invalidateQueries({ queryKey: ["messages-slack", meQ.data?.id ?? "anon"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-muted">Messages</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Messaging hub</h1>
        <p className="mt-2 text-sm text-muted">Register each bot once per user. Secrets stay server-side and are isolated by account.</p>
      </div>

      <HelpBanner
        title="Messaging connectors"
        description="Register Telegram and Slack once per user. Skills can then send or inspect messages without sharing tokens across accounts."
        bullets={[
          "Each user gets their own server-side connector record.",
          "WhatsApp stays on the skill page for now.",
          "Use Skills for execution, Messages for registration.",
        ]}
        href="/skills/telegram"
        hrefLabel="Open Telegram skill"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ConnectorCard
          title="Telegram"
          description="Register a bot token and default chat for this user."
          status={telegramQ.data?.registered ? `Registered for ${meQ.data?.email ?? "this user"}` : "Not registered"}
          badge={telegramQ.data?.registered ? "live" : "empty"}
          action={
            <Link href="/skills" className="text-xs text-muted hover:text-white">
              Open skills catalog
            </Link>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Default chat ID">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                value={telegramDefaultChatId}
                onChange={(e) => setTelegramDefaultChatId(e.target.value)}
                placeholder="123456789"
              />
            </Field>
            <Field label="Bot token">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder="bot token"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveTelegram.mutate()} disabled={saveTelegram.isPending || !telegramToken.trim()}>
              Save bot
            </Button>
            <Button variant="ghost" onClick={() => clearTelegram.mutate()} disabled={clearTelegram.isPending || !telegramQ.data?.registered}>
              Remove
            </Button>
          </div>
        </ConnectorCard>

        <ConnectorCard
          title="Slack"
          description="Register a bot token and default channel for this user."
          status={slackQ.data?.registered ? `Registered for ${meQ.data?.email ?? "this user"}` : "Not registered"}
          badge={slackQ.data?.registered ? "live" : "empty"}
          action={
            <Link href="/skills" className="text-xs text-muted hover:text-white">
              Open skills catalog
            </Link>
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Default channel ID">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                value={slackDefaultChannelId}
                onChange={(e) => setSlackDefaultChannelId(e.target.value)}
                placeholder="C01234567"
              />
            </Field>
            <Field label="Bot token">
              <input
                className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-slate-100 outline-none"
                type="password"
                value={slackToken}
                onChange={(e) => setSlackToken(e.target.value)}
                placeholder="bot token"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveSlack.mutate()} disabled={saveSlack.isPending || !slackToken.trim()}>
              Save bot
            </Button>
            <Button variant="ghost" onClick={() => clearSlack.mutate()} disabled={clearSlack.isPending || !slackQ.data?.registered}>
              Remove
            </Button>
          </div>
        </ConnectorCard>
      </div>

      <Card className="border-white/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-white">Other messaging</CardTitle>
          <CardDescription>WhatsApp stays available on the WhatsApp skill page for now.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">WhatsApp Cloud API</Badge>
          <Link href="/skills/whatsapp" className="rounded border border-border bg-bg px-3 py-2 text-sm text-white">
            Open WhatsApp skill
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function ConnectorCard({
  title,
  description,
  status,
  badge,
  action,
  children,
}: {
  title: string;
  description: string;
  status: string;
  badge: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="border-white/10 bg-slate-950/70">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-white">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="secondary">{badge}</Badge>
        </div>
        <div className="text-sm text-slate-200">{status}</div>
        {action}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}
