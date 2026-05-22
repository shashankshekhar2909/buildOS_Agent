import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#06070a" },
        headerTitleStyle: { color: "#fff" },
        tabBarStyle: { backgroundColor: "#0a0a0a", borderTopColor: "#1f1f1f" },
        tabBarActiveTintColor: "#7c5cff",
        tabBarInactiveTintColor: "#666",
      }}
    >
      <Tabs.Screen name="runs" options={{ title: "Runs" }} />
      <Tabs.Screen name="approvals" options={{ title: "Approvals" }} />
      <Tabs.Screen name="agents" options={{ title: "Agents" }} />
    </Tabs>
  );
}
