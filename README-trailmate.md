# Trailmate: voice hiking buddy

```
hiking-buddy/
  agent-config.md   Prompt, 3 personas (voice/tone), tool definitions to set up in ElevenLabs
  backend/          Token server (keeps your API key off the phone)
  app/              Expo (React Native) app
```

## Setup

1. **ElevenLabs:** follow `agent-config.md` to create three agents (young / adult / senior) with the six client tools. Enable authentication on each.
2. **Backend:**
   ```bash
   cd backend && npm install
   cp .env.example .env     # add API key + 3 agent IDs
   npm start
   ```
3. **App** (create a fresh Expo project, then copy these files over it):
   ```bash
   npx create-expo-app trailmate --template blank-typescript
   cd trailmate
   npx expo install @elevenlabs/react-native expo-location expo-sms expo-linking expo-keep-awake @react-native-async-storage/async-storage
   ```
   Check the `@elevenlabs/react-native` docs for any extra peer dependencies (LiveKit WebRTC packages). Copy `App.tsx`, `src/`, and the `ios`/`android`/`plugins` parts of `app.json` into the project. Then:
   ```bash
   EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:3000 npx expo prebuild
   npx expo run:ios      # or run:android  (Expo Go will NOT work)
   ```
4. Test outdoors on a real device.

## How it works

- The app asks your backend for a token for the chosen persona, then calls `startSession`.
- GPS runs in the app (`src/trip.ts`) and tracks distance, time, and elevation.
- The agent calls **client tools** (`src/tools.ts`): trip stats and location (from GPS), weather (Open-Meteo, no key), nearby plants (iNaturalist community sightings, no key), and emergency SMS/call.

## Known limits (worth knowing before real hikes)

- **Foreground only.** Tracking and the voice session stop if the app is backgrounded or the phone locks. The app keeps the screen awake. True background hiking needs background location and audio modes plus extra testing.
- **Signal.** The voice agent, weather, and plant lookups all need mobile data. On trails without coverage it won't work. Consider an offline fallback or a "last known" mode.
- **Emergency SMS** opens the composer pre-filled; the hiker must tap Send. Apps can't silently text on iOS. Test it, and do not rely on it as the only safety measure.
- **Plant IDs** come from nearby community sightings, not identification of what the hiker is looking at. The prompt forbids eating advice.
- **Battery:** continuous GPS plus audio is heavy. Test long hikes.
- API details were checked against ElevenLabs docs, but SDK versions move quickly. If `clientTools` or `dynamicVariables` placement doesn't type-check, see the React Native SDK docs (the code uses `as any` on the options to avoid version-specific typing errors).
