import * as Linking from "expo-linking";
import * as SMS from "expo-sms";
import { TripState, formatDuration } from "./trip";

// Tool names must match the Client tools you define in the ElevenLabs dashboard.
// Every tool returns a short string that the agent reads and speaks about.

const WEATHER_CODES: Record<number, string> = {
  0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain",
  71: "light snow", 73: "snow", 75: "heavy snow",
  80: "rain showers", 81: "rain showers", 82: "violent rain showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with heavy hail",
};

async function getJson(url: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

export function createTools(getTrip: () => TripState, getContact: () => string) {
  const needFix = () => {
    const last = getTrip().last;
    if (!last) throw new Error("no GPS fix yet");
    return last;
  };

  return {
    get_trip_stats: async () => {
      const t = getTrip();
      if (!t.startedAt) return "The hike has not started.";
      const elapsed = Date.now() - t.startedAt;
      const km = t.distanceM / 1000;
      const hours = elapsed / 3600000;
      const pace = km > 0.05 && hours > 0 ? (km / hours).toFixed(1) : null;
      return (
        `Time walked: ${formatDuration(elapsed)}. ` +
        `Distance: ${km.toFixed(2)} kilometers. ` +
        (pace ? `Average speed: ${pace} kilometers per hour. ` : "") +
        `Elevation gained: ${Math.round(t.elevGainM)} meters.`
      );
    },

    get_location: async () => {
      try {
        const f = needFix();
        return `Latitude ${f.lat.toFixed(5)}, longitude ${f.lon.toFixed(5)}` +
          (f.alt != null ? `, altitude about ${Math.round(f.alt)} meters.` : ".");
      } catch {
        return "I don't have a GPS fix yet.";
      }
    },

    get_weather: async () => {
      try {
        const f = needFix();
        const d = await getJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${f.lat}&longitude=${f.lon}` +
            `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
            `&hourly=precipitation_probability,weather_code&forecast_days=1&timezone=auto`
        );
        const c = d.current;
        const hourNow = new Date().getHours();
        const next = (d.hourly.precipitation_probability as number[]).slice(hourNow, hourNow + 4);
        const maxRain = next.length ? Math.max(...next) : 0;
        return (
          `Now: ${WEATHER_CODES[c.weather_code] ?? "unknown conditions"}, ` +
          `${Math.round(c.temperature_2m)} degrees Celsius, feels like ${Math.round(c.apparent_temperature)}. ` +
          `Wind ${Math.round(c.wind_speed_10m)} kilometers per hour. ` +
          `Highest chance of rain in the next four hours: ${maxRain} percent.`
        );
      } catch {
        return "Weather is unavailable right now. The phone may have no signal.";
      }
    },

    get_nearby_vegetation: async () => {
      try {
        const f = needFix();
        const d = await getJson(
          `https://api.inaturalist.org/v1/observations/species_counts?lat=${f.lat}&lng=${f.lon}` +
            `&radius=2&iconic_taxa=Plantae,Fungi&per_page=8&locale=en`
        );
        const names: string[] = (d.results ?? [])
          .map((r: any) => r.taxon?.preferred_common_name || r.taxon?.name)
          .filter(Boolean);
        if (!names.length) return "No community sightings of plants were found nearby.";
        return (
          `Commonly reported within two kilometers: ${names.join(", ")}. ` +
          `This is based on community sightings, so it may not match exactly what is in front of the hiker.`
        );
      } catch {
        return "I can't look up nearby plants right now.";
      }
    },

    send_emergency_alert: async (params: { message?: string }) => {
      const contact = getContact();
      if (!contact) return "No emergency contact is saved in the app.";
      const f = getTrip().last;
      const where = f ? `https://maps.google.com/?q=${f.lat},${f.lon}` : "location unknown";
      const body =
        `EMERGENCY from my hiking app. ${params?.message ?? "I may need help."} ` +
        `My location: ${where}`;
      if (!(await SMS.isAvailableAsync())) return "This device can't send text messages.";
      // Opens the SMS composer with everything filled in; the hiker taps Send.
      await SMS.sendSMSAsync([contact], body);
      return "The text message to the emergency contact is ready. Ask the hiker to tap send.";
    },

    call_emergency_contact: async () => {
      const contact = getContact();
      if (!contact) return "No emergency contact is saved in the app.";
      await Linking.openURL(`tel:${contact}`);
      return "Opening the phone dialer for the emergency contact.";
    },
  };
}
