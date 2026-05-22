import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";

type Approval = {
  id: string;
  task_id: string | null;
  agent_run_id: string | null;
  tool: string | null;
  action: string;
  risk: string;
  payload: Record<string, unknown>;
  state: string;
  created_at: string;
};

const RISK_COLOR: Record<string, string> = {
  low: "#404040",
  medium: "#a16207",
  high: "#c2410c",
  critical: "#b91c1c",
};

export default function Approvals() {
  const qc = useQueryClient();
  const q = useQuery<Approval[]>({ queryKey: ["approvals"], queryFn: () => api<Approval[]>("/v1/approvals") });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api(`/v1/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ approve }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["agent-runs"] });
    },
    onError: (e) => Alert.alert("Decide failed", String((e as Error).message)),
  });

  const items = q.data ?? [];

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor="#7c5cff" />}
        ListEmptyComponent={<Text style={styles.empty}>No approvals waiting.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.action}>{item.action}</Text>
              <View style={[styles.risk, { backgroundColor: RISK_COLOR[item.risk] || "#333" }]}>
                <Text style={styles.riskText}>{item.risk}</Text>
              </View>
            </View>
            {item.tool && <Text style={styles.tool}>{item.tool}</Text>}
            <Text style={styles.payload} numberOfLines={5}>{JSON.stringify(item.payload, null, 2)}</Text>
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, { backgroundColor: "#047857" }]}
                onPress={() => decide.mutate({ id: item.id, approve: true })}
              >
                <Text style={styles.btnText}>Approve</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { backgroundColor: "#b91c1c" }]}
                onPress={() => decide.mutate({ id: item.id, approve: false })}
              >
                <Text style={styles.btnText}>Deny</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#06070a" },
  empty: { color: "#666", padding: 24, textAlign: "center" },
  card: { backgroundColor: "#111", margin: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#1f1f1f" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  action: { color: "#fff", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  risk: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  riskText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  tool: { color: "#7c5cff", fontFamily: "monospace", fontSize: 12, marginBottom: 6 },
  payload: { color: "#999", fontFamily: "monospace", fontSize: 11, marginBottom: 10 },
  actions: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "600" },
});
