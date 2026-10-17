import * as Location from "expo-location";

export type Fix = { lat: number; lon: number; alt: number | null; t: number };

export type TripState = {
  startedAt: number | null;
  distanceM: number;
  elevGainM: number;
  last: Fix | null;
};

export const emptyTrip = (): TripState => ({
  startedAt: null,
  distanceM: 0,
  elevGainM: 0,
  last: null,
});

function haversineM(a: Fix, b: Fix): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Starts GPS tracking, mutating `trip` in place. Returns a stop function. */
export async function startTracking(trip: TripState): Promise<() => void> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") throw new Error("Location permission denied");

  trip.startedAt = Date.now();
  trip.distanceM = 0;
  trip.elevGainM = 0;
  trip.last = null;

  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, distanceInterval: 5, timeInterval: 5000 },
    (loc) => {
      // ignore very inaccurate fixes
      if (loc.coords.accuracy != null && loc.coords.accuracy > 40) return;
      const fix: Fix = {
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        alt: loc.coords.altitude,
        t: loc.timestamp,
      };
      if (trip.last) {
        const d = haversineM(trip.last, fix);
        if (d >= 3) trip.distanceM += d; // filter GPS jitter
        if (fix.alt != null && trip.last.alt != null) {
          const dh = fix.alt - trip.last.alt;
          if (dh > 2) trip.elevGainM += dh; // ignore tiny noise
        }
      }
      trip.last = fix;
    }
  );
  return () => sub.remove();
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} minutes`;
  return `${h} hour${h === 1 ? "" : "s"} ${m} minutes`;
}
