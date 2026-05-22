import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api, clearTokens } from "@/src/api";

type Agent = { id: string; name: string; system_prompt: string; skills: string[]; enabled: boolean };
type Model = { id: string; provider: string };
type RunResult = { run_id?: string; state?: string; stop_reason: string; output: string };

export default function Agents() {
  const qc = useQueryClient();
  const router = useRouter();
  const agentsQ = useQuery<Agent[]>({ queryKey: ["agents"], queryFn: () => api<Agent[]>("/v1/agents") });
  const modelsQ = useQuery<{ ok: boolean; models: Model[] }>({ queryKey: ["models"], queryFn: () => api("/v1/models") });

  const [selected, setSelected] = useState<string>("core");
  const [message, setMessage] = useState("");
  const [model, setModel] = useState("claude-sonnet");

  const run = useMutation({
    mutationFn: () =>
      api<RunResult>(`/v1/agents/${selected}/run`, {
        method: "POST",
        body: JSON.stringify({ message, model, max_steps: 6 }),
      }),
    onSuccess: (r) => {
      setMessage("");
      qc.invalidateQueries({ queryKey: ["agent-runs"] });
      Alert.alert("Run complete", `${r.stop_reason}${r.run_id ? `\nrun_id ${r.run_id.slice(0, 8)}` : ""}`);
    },
    onError: (e) => Alert.alert("Run failed", String((e as Error).message).slice(0, 400)),
  });

  async function logout() {
    await clearTokens();
    router.replace("/(auth)/login");
  }

  const agents = agentsQ.data ?? [];
  const models = modelsQ.data?.models ?? [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.section}>Agent</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={agents}
        keyExtractor={(a) => a.name}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelected(item.name)}
            style={[styles.chip, selected === item.name && styles.chipActive]}
          >
            <Text style={[styles.chipText, selected === item.name && styles.chipTextActive]}>{item.name}</Text>
          </Pressable>
        )}
      />

      <Text style={styles.section}>Model</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={models}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => setModel(item.id)} style={[styles.chip, model === item.id && styles.chipActive]}>
            <Text style={[styles.chipText, model === item.id && styles.chipTextActive]}>{item.id}</Text>
          </Pressable>
        )}
      />

      <Text style={styles.section}>Message</Text>
      <TextInput
        style={styles.input}
        multiline
        placeholder="What should the agent do?"
        placeholderTextColor="#666"
        value={message}
        onChangeText={setMessage}
      />

      <Pressable style={styles.runBtn} onPress={() => run.mutate()} disabled={!message || run.isPending}>
        {run.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.runText}>Run agent</Text>}
      </Pressable>

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#06070a" },
  section: { color: "#666", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#111", borderWidth: 1, borderColor: "#1f1f1f" },
  chipActive: { backgroundColor: "#7c5cff", borderColor: "#7c5cff" },
  chipText: { color: "#aaa", fontSize: 13 },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  input: {
    backgroundColor: "#111",
    borderColor: "#1f1f1f",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: "#fff",
    margin: 16,
    minHeight: 100,
    textAlignVertical: "top",
  },
  runBtn: { backgroundColor: "#7c5cff", marginHorizontal: 16, padding: 14, borderRadius: 12, alignItems: "center" },
  runText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  logout: { marginTop: 28, padding: 12, alignItems: "center" },
  logoutText: { color: "#666", fontSize: 12 },
});
