import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { ConversationProvider, useConversationControls } from "@elevenlabs/react-native";
import { emptyTrip, startTracking } from "./src/trip";
import { createTools } from "./src/tools";

// Your backend URL (use your computer's LAN IP when testing on a phone).
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.10:3000";

type Persona = "young" | "adult" | "senior";
const PERSONAS: { key: Persona; label: string; blurb: string }[] = [
  { key: "young", label: "Young", blurb: "Upbeat and casual" },
  { key: "adult", label: "Adult", blurb: "Relaxed and practical" },
  { key: "senior", label: "Senior", blurb: "Slow, clear, patient" },
];

function HikeScreen() {
  const { startSession, endSession } = useConversationControls();

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [persona, setPersona] = useState<Persona>("adult");
  const [hiking, setHiking] = useState(false);
  const [busy, setBusy] = useState(false);

  // Mutable refs so tools always read the latest values.
  const tripRef = useRef(emptyTrip());
  const contactRef = useRef("");
  const stopTrackingRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    AsyncStorage.multiGet(["name", "contact", "persona"]).then((rows) => {
      const m = Object.fromEntries(rows.map(([k, v]) => [k, v ?? ""]));
      if (m.name) setName(m.name);
      if (m.contact) setContact(m.contact);
      if (m.persona) setPersona(m.persona as Persona);
    });
  }, []);

  useEffect(() => {
    contactRef.current = contact;
  }, [contact]);

  const startHike = async () => {
    if (!contact.trim()) {
      Alert.alert("Add an emergency contact", "Enter a phone number first so I can reach someone if needed.");
      return;
    }
    setBusy(true);
    try {
      await AsyncStorage.multiSet([["name", name], ["contact", contact], ["persona", persona]]);
      contactRef.current = contact;

      stopTrackingRef.current = await startTracking(tripRef.current);
      await activateKeepAwakeAsync();

      const res = await fetch(`${API_URL}/api/session?persona=${persona}`);
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.error ?? "No token");

      const tools = createTools(() => tripRef.current, () => contactRef.current);
      await startSession({
        conversationToken: data.token,
        dynamicVariables: { user_name: name.trim() || "friend" },
        clientTools: tools,
      } as any);
      setHiking(true);
    } catch (e: any) {
      stopTrackingRef.current?.();
      deactivateKeepAwake();
      Alert.alert("Couldn't start", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const endHike = async () => {
    try { await endSession(); } catch {}
    stopTrackingRef.current?.();
    stopTrackingRef.current = null;
    deactivateKeepAwake();
    setHiking(false);
  };

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.title}>Trailmate</Text>
      <Text style={s.sub}>Your voice hiking buddy</Text>

      {!hiking && (
        <>
          <TextInput style={s.input} placeholder="Your name" value={name} onChangeText={setName} />
          <TextInput
            style={s.input}
            placeholder="Emergency contact phone"
            keyboardType="phone-pad"
            value={contact}
            onChangeText={setContact}
          />
          <Text style={s.label}>Buddy style</Text>
          <View style={s.row}>
            {PERSONAS.map((p) => (
              <Pressable
                key={p.key}
                onPress={() => setPersona(p.key)}
                style={[s.chip, persona === p.key && s.chipOn]}
              >
                <Text style={[s.chipTitle, persona === p.key && s.chipTextOn]}>{p.label}</Text>
                <Text style={[s.chipSub, persona === p.key && s.chipTextOn]}>{p.blurb}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {hiking ? (
        <View style={s.center}>
          <Text style={s.live}>Hiking with your buddy</Text>
          <Text style={s.hint}>Just talk. Ask about distance, weather, plants, or say you need help.</Text>
          <Pressable style={[s.big, s.stop]} onPress={endHike}>
            <Text style={s.bigText}>End hike</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={[s.big, busy && { opacity: 0.6 }]} onPress={startHike} disabled={busy}>
          <Text style={s.bigText}>{busy ? "Starting..." : "Start hike"}</Text>
        </Pressable>
      )}

      <Text style={s.disclaimer}>
        Trailmate is an AI. It is not a substitute for emergency services. In an emergency, call your local number (911, 112).
      </Text>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ConversationProvider>
      <HikeScreen />
    </ConversationProvider>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f4f7f2" },
  title: { fontSize: 32, fontWeight: "700", color: "#2d5a3d", marginTop: 24 },
  sub: { fontSize: 16, color: "#557", marginBottom: 20 },
  input: { backgroundColor: "#fff", borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: "#dde" },
  label: { fontSize: 14, fontWeight: "600", color: "#445", marginBottom: 8, marginTop: 4 },
  row: { flexDirection: "row", gap: 8, marginBottom: 20 },
  chip: { flex: 1, backgroundColor: "#fff", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#dde" },
  chipOn: { backgroundColor: "#2d5a3d", borderColor: "#2d5a3d" },
  chipTitle: { fontWeight: "700", fontSize: 15, color: "#233" },
  chipSub: { fontSize: 12, color: "#667", marginTop: 2 },
  chipTextOn: { color: "#fff" },
  big: { backgroundColor: "#2d5a3d", borderRadius: 16, paddingVertical: 22, alignItems: "center", marginTop: 8 },
  stop: { backgroundColor: "#b3412f" },
  bigText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  center: { flex: 1, justifyContent: "center" },
  live: { fontSize: 22, fontWeight: "700", color: "#2d5a3d", textAlign: "center", marginBottom: 8 },
  hint: { textAlign: "center", color: "#556", marginBottom: 24, fontSize: 15 },
  disclaimer: { fontSize: 12, color: "#778", textAlign: "center", marginTop: "auto", paddingTop: 16 },
});
