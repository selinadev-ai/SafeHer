import Constants from "expo-constants";

function getBackendUrl(): string {
  // Try to auto-detect the laptop's IP from the Expo dev server connection
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(":")[0]; // strip the Metro port (e.g. 8081)
    return `http://${host}:8000`;
  }

  // Fallback if auto-detect fails (e.g. production build) — update manually if needed
  return "http://192.168.31.29:8000";
}

export const BACKEND_URL = getBackendUrl();
