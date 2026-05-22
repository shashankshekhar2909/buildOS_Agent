import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";

type Step = { tool: string; arguments: Record<string, unknown>; result: unknown; error: string | null };
type Run = {
  id: string;
  agent_name: string;
  model: string;
  initial_message: string;
  state: string;
  stop_reason: string | null;
  output: string | null;
  error: string | null;
  pending_tool: { tool: string; skill: string; arguments: Record<string, unknown>; tool_call_id: string } | null;
  steps: Step[];
  created_at: string;
};
type Approval = {
  id: string;
  agent_run_id: string | null;
  tool: string | null;
  action: string;
  risk: string;
  payload: Record<string, unknown>;
  state: string;
};

const STATE_COLOR: Record<string, string> = {
  running: "#0369a1",
  completed: "#047857",
  failed: "#b91c1c",
  waiting_approval: "#b45309",
  cancelled: "#404040",
};

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const runQ = useQuery<Run>({
    queryKey: ["agent-run", id],
    queryFn: () => api<Run>(`/v1/agent-runs/${id}`),
    enabled: Boolean(id),
  });
  const apprQ = useQuery<Approval[]>({
    queryKey: ["approvals"],
    queryFn: () => api<Approval[]>("/v1/approvals"),
  });

  const linked = apprQ.data?.find((a) => a.agent_run_id === id && a.state === "pending");

  const decide = useMutation({
    mutationFn: ({ approvalId, approve }: { approvalId: string; approve: boolean }) =>
      api(`/v1/approvals/${approvalId}/decide`, { method: "POST", body: JSON.stringify({ approve }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-run", id] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["agent-runs"] });
    },
    onError: (e) => Alert.alert("Decide failed", String((e as Error).message)),
  });

  if (!runQ.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }
  const run = runQ.data;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← back</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.message}>{run.initial_message}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.pill, { backgroundColor: STATE_COLOR[run.state] || "#333" }]}>
            <Text style={styles.pillText}>{run.state}</Text>
          </View>
          <Text style={styles.meta}>{run.agent_name} · {run.model}</Text>
        </View>
        {run.stop_reason && <Text style={styles.subMeta}>stop: {run.stop_reason}</Text>}
      </View>

      {linked && (
        <View style={styles.approvalCard}>
          <Text style={styles.approvalTitle}>Approval required</Text>
          <Text style={styles.tool}>{linked.tool}</Text>
          <Text style={styles.payload} numberOfLines={6}>{JSON.stringify(linked.payload, null, 2)}</Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, { backgroundColor: "#047857" }]}
              onPress={() => decide.mutate({ approvalId: linked.id, approve: true })}
            >
              <Text style={styles.btnText}>Approve & resume</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { backgroundColor: "#b91c1c" }]}
              onPress={() => decide.mutate({ approvalId: linked.id, approve: false })}
            >
              <Text style={styles.btnText}>Deny</Text>
            </Pressable>
          </View>
        </View>
      )}

      {run.output ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Output</Text>
          <Text style={styles.output}>{run.output}</Text>
        </View>
      ) : null}

      {run.error ? (
        <View style={[styles.section, styles.errorBox]}>
          <Text style={styles.sectionTitle}>Error</Text>
          <Text style={styles.errorText}>{run.error}</Text>
        </View>
      ) : null}

      <Text style={styles.stepsHeader}>Steps ({run.steps?.length ?? 0})</Text>
      {(run.steps ?? []).map((s, i) => (
        <View key={i} style={styles.step}>
          <View style={styles.stepHead}>
            <Text style={styles.stepIdx}>{i + 1}</Text>
            <Text style={styles.stepTool}>{s.tool}</Text>
            {s.error && <Text style={styles.stepErr}>err</Text>}
          </View>
          <Text style={styles.stepArgs}>{JSON.stringify(s.arguments, null, 2)}</Text>
          <Text style={styles.stepResult}>{JSON.stringify(s.result ?? s.error, null, 2)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#06070a" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#06070a" },
  muted: { color: "#666" },
  back: { color: "#7c5cff", marginTop: 30, marginBottom: 12 },
  header: { marginBottom: 16 },
  message: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { color: "#888", fontSize: 12 },
  subMeta: { color: "#666", fontSize: 11, marginTop: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  pillText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  approvalCard: {
    backgroundColor: "#3a2a06",
    borderColor: "#b45309",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  approvalTitle: { color: "#fde68a", fontWeight: "600", marginBottom: 6 },
  tool: { color: "#7c5cff", fontFamily: "monospace", marginBottom: 8 },
  payload: { color: "#aaa", fontFamily: "monospace", fontSize: 11, marginBottom: 12 },
  actions: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  section: { backgroundColor: "#111", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#1f1f1f" },
  sectionTitle: { color: "#fff", fontWeight: "600", marginBottom: 6 },
  output: { color: "#fff", fontSize: 13 },
  errorBox: { backgroundColor: "#3a1010", borderColor: "#7f1d1d" },
  errorText: { color: "#fca5a5", fontSize: 12, fontFamily: "monospace" },
  stepsHeader: { color: "#666", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", marginTop: 10, marginBottom: 8 },
  step: { backgroundColor: "#0c0c0c", borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "#1f1f1f" },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  stepIdx: { color: "#aaa", backgroundColor: "#1f1f1f", paddingHorizontal: 6, borderRadius: 4, fontSize: 11 },
  stepTool: { color: "#fff", fontFamily: "monospace", fontSize: 12 },
  stepErr: { color: "#fff", backgroundColor: "#b91c1c", paddingHorizontal: 6, borderRadius: 4, fontSize: 10 },
  stepArgs: { color: "#888", fontFamily: "monospace", fontSize: 10, marginBottom: 4 },
  stepResult: { color: "#6ee7b7", fontFamily: "monospace", fontSize: 10 },
});
