import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";

type Run = {
  id: string;
  agent_name: string;
  model: string;
  initial_message: string;
  state: string;
  stop_reason: string | null;
  steps: unknown[];
  created_at: string;
};

const STATE_COLOR: Record<string, string> = {
  running: "#0369a1",
  completed: "#047857",
  failed: "#b91c1c",
  waiting_approval: "#b45309",
  cancelled: "#404040",
};

export default function Runs() {
  const router = useRouter();
  const q = useQuery<Run[]>({ queryKey: ["agent-runs"], queryFn: () => api<Run[]>("/v1/agent-runs") });
  const runs = q.data ?? [];

  return (
    <View style={styles.root}>
      <FlatList
        data={runs}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor="#7c5cff" />}
        ListEmptyComponent={<Text style={styles.empty}>No runs yet. Trigger one from Agents tab.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#0a0a0a" }]}
            onPress={() => router.push(`/run/${item.id}`)}
          >
            <View style={[styles.pill, { backgroundColor: STATE_COLOR[item.state] || "#333" }]}>
              <Text style={styles.pillText}>{item.state}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.message} numberOfLines={2}>{item.initial_message}</Text>
              <Text style={styles.meta}>
                {item.agent_name} · {item.model} · {item.steps?.length ?? 0} steps · {new Date(item.created_at).toLocaleTimeString()}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#06070a" },
  empty: { color: "#666", padding: 24, textAlign: "center" },
  row: { flexDirection: "row", padding: 14, borderBottomWidth: 1, borderBottomColor: "#111", gap: 12 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" },
  pillText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  body: { flex: 1 },
  message: { color: "#fff", fontSize: 14, marginBottom: 4 },
  meta: { color: "#777", fontSize: 11 },
});
