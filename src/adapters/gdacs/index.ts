/**
 * GDACS Live Adapter
 *
 * Global Disaster Alert and Coordination System.
 * Fetches active tropical cyclone events for the Indian Ocean / Bay of Bengal.
 *
 * API: https://www.gdacs.org/gdacsapi/api
 * No API key required for public endpoints.
 *
 * Returns null on ANY failure — the primary demo never depends on this adapter.
 *
 * Source tier: AUTHORITATIVE_OPEN (when successful)
 */

import type { HazardScenario } from "../../lib/types/index";

const GDACS_BASE = process.env.GDACS_BASE_URL ?? "https://www.gdacs.org/gdacsapi/api";
// Bay of Bengal / Arabian Sea bounding box
const BOB_BOUNDS = { minLat: 5, maxLat: 25, minLng: 65, maxLng: 100 };

type GDACSEvent = {
  eventtype?: string;
  eventid?: number;
  eventname?: string;
  latitude?: number;
  longitude?: number;
  windspeed?: number;   // km/h
  fromdate?: string;
  todate?: string;
  description?: string;
};

/**
 * Try to fetch an active tropical cyclone near Odisha from GDACS.
 * Returns a normalized HazardScenario or null if unavailable/no active event.
 */
export async function fetchGDACSActiveCyclone(): Promise<HazardScenario | null> {
  try {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 3);

    const url = `${GDACS_BASE}/events/geteventlist/MAP?eventlist=TC` +
      `&fromDate=${fromDate.toISOString().split("T")[0]}` +
      `&toDate=${today.toISOString().split("T")[0]}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) return null;

    const data = await res.json() as { features?: Array<{ properties?: GDACSEvent }> };
    if (!data.features?.length) return null;

    // Find a tropical cyclone in the Bay of Bengal region
    const event = data.features.find((f) => {
      const p = f.properties;
      if (!p || p.eventtype !== "TC") return false;
      const lat = p.latitude ?? 0;
      const lng = p.longitude ?? 0;
      return (
        lat >= BOB_BOUNDS.minLat && lat <= BOB_BOUNDS.maxLat &&
        lng >= BOB_BOUNDS.minLng && lng <= BOB_BOUNDS.maxLng
      );
    })?.properties;

    if (!event) return null;

    const windKph = event.windspeed ?? 0;
    const issuedAt = event.fromdate ?? new Date().toISOString();

    return {
      eventId: `gdacs-tc-${event.eventid ?? "unknown"}`,
      source: {
        id: "gdacs-live",
        tier: "AUTHORITATIVE_OPEN",
        description: "GDACS live tropical cyclone event",
        url: "https://www.gdacs.org",
        processedAt: new Date().toISOString(),
      },
      issuedAt,
      cyclone: {
        name: event.eventname ?? "Unknown",
        latitude: event.latitude ?? 0,
        longitude: event.longitude ?? 0,
        maxWindKph: windKph,
      },
      forecast: {
        track: [{ latitude: event.latitude ?? 0, longitude: event.longitude ?? 0 }],
      },
      rainfall: {
        forecast24hMm: 0, // GDACS doesn't provide this directly
        forecast48hMm: 0,
        source: {
          id: "gdacs-live-rainfall-unavailable",
          tier: "AUTHORITATIVE_OPEN",
          description: "GDACS TC — rainfall data not available",
        },
      },
      surge: {
        heightM: 0,
        source: "scenario",
        modelMethod: "proximity_threshold",
        confidence: 0.3,
      },
      displayLabel: "OFFICIAL FORECAST",
      tier: "AUTHORITATIVE_OPEN",
    };
  } catch {
    return null;
  }
}
