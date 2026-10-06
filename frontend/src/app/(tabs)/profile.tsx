import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BACKEND_URL } from "../../config";
import { colors, spacing, radius } from "../../theme";

const PROFILE_KEY = "safeher_profile";

type Profile = { name: string; age: string; bloodGroup: string; medicalNotes: string };
type SOSEntry = { timestamp: string; lat: number | null; lng: number | null; contacts_notified: number; message: string };

const EMPTY_PROFILE: Profile = { name: "", age: "", bloodGroup: "", medicalNotes: "" };

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState<SOSEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadProfile();
    loadHistory();
  }, []);

  const loadProfile = async () => {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      if (raw) setProfile(JSON.parse(raw));
      else setEditing(true);
    } catch (e) {
      console.log("Error loading profile:", e);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/sos/history`);
      const data = await res.json();
      setHistory((data.alerts ?? []).slice().reverse());
    } catch (e) {
      console.log("Error loading SOS history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const saveProfile = async () => {
    if (!profile.name.trim()) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      setEditing(false);
    } catch (e) {
      console.log("Error saving profile:", e);
      Alert.alert("Error", "Could not save profile.");
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 60 }}>
          <Text style={styles.heading}>Profile</Text>

          {editing ? (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Full name"
                placeholderTextColor={colors.textSecondary}
                value={profile.name}
                onChangeText={(t) => setProfile({ ...profile, name: t })}
              />
              <TextInput
                style={styles.input}
                placeholder="Age"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={profile.age}
                onChangeText={(t) => setProfile({ ...profile, age: t })}
              />
              <TextInput
                style={styles.input}
                placeholder="Blood group (e.g. O+)"
                placeholderTextColor={colors.textSecondary}
                value={profile.bloodGroup}
                onChangeText={(t) => setProfile({ ...profile, bloodGroup: t })}
              />
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: "top" }]}
                placeholder="Medical notes (allergies, conditions, etc.)"
                placeholderTextColor={colors.textSecondary}
                multiline
                value={profile.medicalNotes}
                onChangeText={(t) => setProfile({ ...profile, medicalNotes: t })}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={saveProfile}>
                <Text style={styles.saveBtnText}>Save Profile</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.name}>{profile.name}</Text>
              {profile.age ? <Text style={styles.detail}>Age: {profile.age}</Text> : null}
              {profile.bloodGroup ? <Text style={styles.detail}>Blood group: {profile.bloodGroup}</Text> : null}
              {profile.medicalNotes ? <Text style={styles.detail}>Notes: {profile.medicalNotes}</Text> : null}
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.subheading}>SOS Alert History</Text>
          {loadingHistory ? (
            <Text style={styles.empty}>Loading...</Text>
          ) : history.length === 0 ? (
            <Text style={styles.empty}>No SOS alerts triggered yet.</Text>
          ) : (
            history.map((entry, i) => (
              <View key={i} style={styles.historyCard}>
                <Text style={styles.historyDate}>{formatDate(entry.timestamp)}</Text>
                <Text style={styles.historyDetail}>
                  {entry.contacts_notified} contact{entry.contacts_notified !== 1 ? "s" : ""} notified
                </Text>
                {entry.lat && entry.lng ? (
                  <Text style={styles.historyDetail}>
                    Location: {entry.lat.toFixed(4)}, {entry.lng.toFixed(4)}
                  </Text>
                ) : (
                  <Text style={styles.historyDetail}>Location unavailable</Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  subheading: { fontSize: 18, fontWeight: "700", color: colors.textPrimary, marginTop: 28, marginBottom: 12 },
  form: { marginBottom: 10 },
  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.button, padding: 12, marginBottom: 10, fontSize: 16,
    color: colors.textPrimary,
  },
  saveBtn: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.button, alignItems: "center", marginTop: 4 },
  saveBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  card: {
    backgroundColor: "#fff", borderRadius: radius.card, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  name: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 6 },
  detail: { fontSize: 15, color: colors.textSecondary, marginBottom: 4 },
  editBtn: {
    marginTop: 10, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: radius.button, borderWidth: 1, borderColor: colors.primary,
  },
  editBtnText: { color: colors.primary, fontWeight: "600" },
  empty: { color: colors.textSecondary, fontStyle: "italic" },
  historyCard: {
    backgroundColor: "#fff", borderLeftWidth: 4, borderLeftColor: colors.risk.High,
    borderRadius: radius.button, padding: 12, marginBottom: 10,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  historyDate: { fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
  historyDetail: { color: colors.textSecondary, fontSize: 13 },
});