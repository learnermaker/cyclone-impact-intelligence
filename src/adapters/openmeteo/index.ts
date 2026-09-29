/**
 * Open-Meteo / ECMWF Adapter
 *
 * ECMWF IFS forecast data via Open-Meteo's free API.
 * No API key required.
 *
 * Provides meteorological context (wind, rainfall, pressure) at a given location.
 * Used as a fallback or supplementary source for the LIVE adapter.
 *
 * IMPORTANT: Open-Meteo is NOT an official IMD forecast.
 * All output must be labelled as MODEL_DERIVED / not an official warning.
 *
 * API: https://api.open-meteo.com/v1/ecmwf
 * Source tier: AUTHORITATIVE_OPEN (ECMWF IFS data, CC BY 4.0)
 */

const OPEN_METEO_BASE =
  process.env.OPEN_METEO_BASE_URL ?? "https://api.open-meteo.com/v1";

export type OpenMeteoData = {
  latitude: number;
  longitude: number;
  windSpeed10m: number;   // km/h
  windGusts10m: number;   // km/h
  precipitation: number;  // mm (summed over 24h)
  pressure: number;       // hPa
  fetchedAt: string;
  sourceTier: "AUTHORITATIVE_OPEN";
  sourceNote: "Open-Meteo ECMWF IFS — NOT an official IMD forecast";
};

/**
 * Fetch current meteorological conditions at a given lat/lng from Open-Meteo ECMWF.
 * Returns null on any failure.
 */
export async function fetchOpenMeteoECMWF(
  lat: number,
  lng: number
): Promise<OpenMeteoData | null> {
  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(2),
      longitude: lng.toFixed(2),
      hourly: "wind_speed_10m,wind_gusts_10m,precipitation,pressure_msl",
      forecast_days: "1",
      models: "ecmwf_ifs04",
    });

    const res = await fetch(`${OPEN_METEO_BASE}/ecmwf?${params}`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      hourly?: {
        wind_speed_10m?: number[];
        wind_gusts_10m?: number[];
        precipitation?: number[];
        pressure_msl?: number[];
      };
    };

    const h = data.hourly;
    if (!h) return null;

    // Take the latest available value
    const last = -1;
    const windSpeed = h.wind_speed_10m?.at(last) ?? 0;
    const windGusts = h.wind_gusts_10m?.at(last) ?? 0;
    const totalPrecip = (h.precipitation ?? []).reduce((s, v) => s + (v ?? 0), 0);
    const pressure = h.pressure_msl?.at(last) ?? 1013;

    return {
      latitude: lat,
      longitude: lng,
      windSpeed10m: windSpeed,
      windGusts10m: windGusts,
      precipitation: totalPrecip,
      pressure,
      fetchedAt: new Date().toISOString(),
      sourceTier: "AUTHORITATIVE_OPEN",
      sourceNote: "Open-Meteo ECMWF IFS — NOT an official IMD forecast",
    };
  } catch {
    return null;
  }
}
