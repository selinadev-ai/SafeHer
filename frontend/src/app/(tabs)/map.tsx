import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { BACKEND_URL } from "../../config";
import { colors, spacing } from "../../theme";

type RiskPoint = { lat: number; lng: number; risk_level: string };

export default function Map() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Location permission denied");
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      const gridPoints: { lat: number; lng: number }[] = [];
      const offsets = [-0.02, -0.01, 0, 0.01, 0.02];
      for (const dLat of offsets) {
        for (const dLng of offsets) {
          gridPoints.push({ lat: lat + dLat, lng: lng + dLng });
        }
      }

      let points: RiskPoint[] = [];
      try {
        const res = await fetch(`${BACKEND_URL}/predict-risk/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: gridPoints }),
        });
        const data = await res.json();
        points = gridPoints.map((p, i) => ({
          lat: p.lat,
          lng: p.lng,
          risk_level: data.results[i]?.risk_level ?? "Low",
        }));
      } catch (err) {
        console.log("Error fetching map risk data:", err);
        setErrorMsg("Could not load risk map");
        setLoading(false);
        return;
      }

      setHtmlContent(buildMapHtml(lat, lng, points));
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.gradientStart }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading risk map...</Text>
      </View>
    );
  }

  if (errorMsg || !htmlContent) {
    return (
      <View style={[styles.center, { backgroundColor: colors.gradientStart }]}>
        <Text style={styles.errorText}>{errorMsg ?? "Could not load map"}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.gradientStart }}>
      <View style={styles.header}>
        <Text style={styles.heading}>Map</Text>
      </View>
      <WebView
        originWhitelist={["*"]}
        source={{ html: htmlContent }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

function getColor(level: string) {
  if (level === "High") return "#dc2626";
  if (level === "Medium") return "#eab308";
  return "#22c55e";
}

function buildMapHtml(userLat: number, userLng: number, points: RiskPoint[]) {
  const markers = points
    .map((p) => {
      const color = getColor(p.risk_level);
      return `
        L.circleMarker([${p.lat}, ${p.lng}], {
          radius: 10, fillColor: "${color}", color: "${color}",
          fillOpacity: 0.6, weight: 1
        }).addTo(map).bindPopup("${p.risk_level} risk");
      `;
    })
    .join("\n");

  return `
    <!DOCTYPE html><html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>html, body, #map { height: 100%; margin: 0; padding: 0; }</style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        var map = L.map('map').setView([${userLat}, ${userLng}], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        L.marker([${userLat}, ${userLng}]).addTo(map).bindPopup("You are here").openPopup();
        ${markers}
      </script>
    </body></html>
  `;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { paddingTop: 60, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  heading: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  loadingText: { marginTop: 10, color: colors.textSecondary },
  errorText: { color: colors.textSecondary },
});