import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_URL, setTokens } from "@/src/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("password123");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/v1/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      await setTokens(body.access_token, body.refresh_token);
      router.replace("/(tabs)/runs");
    } catch (e: any) {
      Alert.alert("Sign-in failed", String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.brand}>
        <Text style={styles.brandText}>BuildAgent</Text>
        <Text style={styles.tagline}>AI-native personal OS</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>{mode === "login" ? "Sign in" : "Register"}</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="password"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
        />
        <Pressable style={styles.button} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.buttonText}>{mode === "login" ? "Sign in" : "Create account"}</Text>
          )}
        </Pressable>
        <Pressable onPress={() => setMode(mode === "login" ? "register" : "login")}>
          <Text style={styles.toggle}>
            {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
          </Text>
        </Pressable>
        <Text style={styles.apiHint}>API: {API_URL}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: "#06070a" },
  brand: { alignItems: "center", marginBottom: 32 },
  brandText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  tagline: { color: "#777", fontSize: 11, letterSpacing: 3, marginTop: 6, textTransform: "uppercase" },
  card: { backgroundColor: "#111", borderRadius: 16, padding: 20, borderWidth: 1, borderColor: "#1f1f1f" },
  title: { color: "#fff", fontSize: 22, fontWeight: "600", marginBottom: 16 },
  input: {
    backgroundColor: "#0a0a0a",
    borderWidth: 1,
    borderColor: "#1f1f1f",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#7c5cff",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 6,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  toggle: { color: "#888", marginTop: 14, textAlign: "center", fontSize: 12 },
  apiHint: { color: "#444", marginTop: 18, textAlign: "center", fontSize: 10, fontFamily: "monospace" },
});
