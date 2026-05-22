import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "./api";

let registered = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;     // simulator can't receive push
  if (registered) return null;

  const perms = await Notifications.getPermissionsAsync();
  let status = perms.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("approvals", {
      name: "Approvals",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#7c5cff",
      sound: "default",
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

  const tokenRes = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const token = tokenRes.data;

  try {
    await api("/v1/devices", {
      method: "POST",
      body: JSON.stringify({
        push_token: token,
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version ?? "0.0.0",
      }),
    });
    registered = true;
  } catch (e) {
    console.warn("device register failed", e);
  }
  return token;
}

export function onNotificationTap(handler: (data: Record<string, unknown>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    handler(res.notification.request.content.data || {});
  });
  return () => sub.remove();
}
