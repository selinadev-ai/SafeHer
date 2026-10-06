import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, radius } from "../../theme";

export const CONTACTS_KEY = "safeher_contacts";

export type Contact = { id: string; name: string; phone: string };

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CONTACTS_KEY);
        if (raw) setContacts(JSON.parse(raw));
      } catch (e) {
        console.log("Error loading contacts:", e);
      }
    })();
  }, []);

  const save = async (list: Contact[]) => {
    setContacts(list);
    try {
      await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(list));
    } catch (e) {
      console.log("Error saving contacts:", e);
    }
  };

  const addContact = () => {
    const cleanPhone = phone.replace(/[^0-9+]/g, "");
    if (!name.trim() || cleanPhone.length < 10) {
      Alert.alert("Invalid", "Enter a name and a valid phone number.");
      return;
    }
    const newContact: Contact = { id: Date.now().toString(), name: name.trim(), phone: cleanPhone };
    save([...contacts, newContact]);
    setName("");
    setPhone("");
  };

  const removeContact = (id: string) => {
    Alert.alert("Remove contact?", "", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => save(contacts.filter((c) => c.id !== id)) },
    ]);
  };

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={{ flex: 1 }}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={styles.heading}>Emergency Contacts</Text>
        <Text style={styles.sub}>These people get an SMS with your location when you trigger SOS.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone (e.g. +919876543210)"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TouchableOpacity style={styles.addBtn} onPress={addContact}>
            <Text style={styles.addBtnText}>Add Contact</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No contacts added yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardPhone}>{item.phone}</Text>
              </View>
              <TouchableOpacity onPress={() => removeContact(item.id)}>
                <Text style={styles.remove}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: spacing.lg },
  heading: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  sub: { color: colors.textSecondary, marginTop: 4, marginBottom: 16 },
  form: { marginBottom: 20 },
  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.button, padding: 12, marginBottom: 10, fontSize: 16,
    color: colors.textPrimary,
  },
  addBtn: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.button, alignItems: "center" },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    padding: 14, borderRadius: radius.card, marginBottom: 10,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardName: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
  cardPhone: { color: colors.textSecondary, marginTop: 2 },
  remove: { color: colors.risk.High, fontWeight: "600" },
  empty: { color: colors.textSecondary, textAlign: "center", marginTop: 30 },
});