import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useSession } from "@/src/session";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchInterval: 8_000 } },
});

function Guard() {
  const session = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!session.ready) return;
    const inAuth = segments[0] === "(auth)";
    if (!session.token && !inAuth) router.replace("/(auth)/login");
    if (session.token && inAuth) router.replace("/(tabs)/runs");
  }, [session.ready, session.token, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={qc}>
      <StatusBar style="light" />
      <Guard />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#06070a" } }} />
    </QueryClientProvider>
  );
}
