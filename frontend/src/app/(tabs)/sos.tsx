import { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Linking, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as SMS from "expo-sms";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BACKEND_URL } from "../../config";
import { colors, spacing, radius } from "../../theme";

const CONTACTS_KEY = "safeher_contacts";
const COUNTDOWN_SECONDS = 5;

type Contact = { id: string; name: string; phone: string };

export default function SOS() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [counting, setCounting] = useState(false);
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(CONTACTS_KEY);
      if (raw) setContacts(JSON.parse(raw));
    })();
    return () => clearInterval(timerRef.current);
  }, []);

  const startCountdown = () => {
    if (contacts.length === 0) {
      Alert.alert("No contacts", "Add at least one emergency contact in the Contacts tab first.");
      return;
    }
    setCounting(true);
    setSeconds(COUNTDOWN_SECONDS);
    setStatus(null);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          setCounting(false);
          triggerSOS();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const cancel = () => {
    clearInterval(timerRef.current);
    setCounting(false);
    setSeconds(COUNTDOWN_SECONDS);
    setStatus("SOS cancelled.");
  };

  const triggerSOS = async () => {
    setSending(true);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      let lat: number | null = null;
      let lng: number | null = null;
      if (perm === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
      const mapsLink = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : "location unavailable";
      const message = `EMERGENCY - SafeHer Alert\nI need help. My current location: ${mapsLink}\nSent automatically from the SafeHer app.`;

      fetch(`${BACKEND_URL}/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, contacts: contacts.map((c) => c.phone), message }),
      }).catch((e) => console.log("SOS backend log failed:", e));

      const available = await SMS.isAvailableAsync();
      if (available) {
        await SMS.sendSMSAsync(contacts.map((c) => c.phone), message);
        setStatus("SOS message opened for sending.");
      } else {
        setStatus("SMS not available on this device.");
        Alert.alert("SMS unavailable", message);
      }
    } catch (e) {
      console.log("SOS error:", e);
      setStatus("Something went wrong sending the SOS.");
    } finally {
      setSending(false);
    }
  };

  const callPolice = () => Linking.openURL("tel:112");

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.container}>
      <Text style={styles.heading}>Emergency SOS</Text>
      <Text style={styles.sub}>
        {contacts.length > 0
          ? `${contacts.length} contact${contacts.length > 1 ? "s" : ""} will be alerted with your live location.`
          : "No emergency contacts saved yet."}
      </Text>

      {sending ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.risk.High} />
          <Text style={styles.sendingText}>Sending alert...</Text>
        </View>
      ) : counting ? (
        <View style={styles.center}>
          <View style={styles.countCircle}>
            <Text style={styles.countText}>{seconds}</Text>
          </View>
          <Text style={styles.countLabel}>Sending SOS in {seconds}s</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={cancel}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <TouchableOpacity style={styles.sosBtn} onPress={startCountdown} activeOpacity={0.85}>
            <Text style={styles.sosText}>SOS</Text>
            <Text style={styles.sosSub}>Tap to alert</Text>
          </TouchableOpacity>
        </View>
      )}

      {status && <Text style={styles.status}>{status}</Text>}

      <TouchableOpacity style={styles.policeBtn} onPress={callPolice}>
        <Text style={styles.policeText}>Call Emergency Helpline (112)</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: spacing.lg },
  heading: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  sub: { color: colors.textSecondary, marginTop: 4, marginBottom: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  sendingText: { marginTop: 10, color: colors.textSecondary },
  sosBtn: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: colors.risk.High,
    justifyContent: "center", alignItems: "center",
    shadowColor: colors.risk.High, shadowOpacity: 0.35, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  sosText: { color: "#fff", fontSize: 48, fontWeight: "800", letterSpacing: 2 },
  sosSub: { color: "#fff", marginTop: 4, opacity: 0.9 },
  countCircle: {
    width: 160, height: 160, borderRadius: 80, borderWidth: 6,
    borderColor: colors.risk.High, justifyContent: "center", alignItems: "center",
    backgroundColor: "#fff",
  },
  countText: { fontSize: 64, fontWeight: "800", color: colors.risk.High },
  countLabel: { marginTop: 16, fontSize: 16, color: colors.textPrimary },
  cancelBtn: {
    marginTop: 24, paddingVertical: 14, paddingHorizontal: 50,
    borderRadius: radius.button, backgroundColor: colors.textPrimary,
  },
  cancelText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  status: { textAlign: "center", color: colors.textSecondary, marginBottom: 10 },
  policeBtn: {
    borderWidth: 1.5, borderColor: colors.risk.High, backgroundColor: "#fff",
    padding: 14, borderRadius: radius.button, alignItems: "center", marginBottom: 20,
  },
  policeText: { color: colors.risk.High, fontWeight: "600", fontSize: 16 },
});