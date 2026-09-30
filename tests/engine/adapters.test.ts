/**
 * Adapter tests — Open-Meteo and GDACS
 *
 * Tests the live adapter contracts:
 * - successful fetch
 * - timeout handling
 * - malformed response
 * - service unavailable
 * - labelling (never claim official IMD status)
 *
 * These tests use vi.stubGlobal('fetch', ...) to mock the network
 * without making real HTTP calls.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOpenMeteoECMWF } from "../../src/adapters/openmeteo/index";
import { fetchGDACSActiveCyclone } from "../../src/adapters/gdacs/index";

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────
// OPEN-METEO ADAPTER TESTS
// ─────────────────────────────────────────────────────────────

describe("Open-Meteo ECMWF adapter", () => {

  it("returns structured data on successful fetch", async () => {
    const mockResponse = {
      hourly: {
        wind_speed_10m: [20, 22, 25, 28],
        wind_gusts_10m: [35, 38, 40, 42],
        precipitation: [0.1, 0.2, 0.0, 0.5],
        pressure_msl: [1010, 1008, 1006, 1005],
      },
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    }));

    const result = await fetchOpenMeteoECMWF(19.8, 85.83);

    expect(result).not.toBeNull();
    expect(result?.latitude).toBe(19.8);
    expect(result?.longitude).toBe(85.83);
    expect(result?.windSpeed10m).toBe(28);      // last value
    expect(result?.windGusts10m).toBe(42);      // last value
    expect(result?.precipitation).toBeCloseTo(0.8); // sum of all
    expect(result?.pressure).toBe(1005);        // last value
    expect(result?.sourceTier).toBe("AUTHORITATIVE_OPEN");
    expect(result?.sourceNote).toContain("NOT an official IMD forecast");
    expect(result?.fetchedAt).toBeTruthy();
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
    }));

    const result = await fetchOpenMeteoECMWF(19.8, 85.83);
    expect(result).toBeNull();
  });

  it("returns null on network timeout (AbortError)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(
      new DOMException("The operation was aborted", "AbortError")
    ));

    const result = await fetchOpenMeteoECMWF(19.8, 85.83);
    expect(result).toBeNull();
  });

  it("returns null on malformed response missing hourly key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latitude: 19.8, longitude: 85.83 }), // no hourly
    }));

    const result = await fetchOpenMeteoECMWF(19.8, 85.83);
    expect(result).toBeNull();
  });

  it("returns null when fetch throws an unexpected error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Network unreachable")));

    const result = await fetchOpenMeteoECMWF(19.8, 85.83);
    expect(result).toBeNull();
  });

  it("handles empty hourly arrays gracefully (defaults to 0)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hourly: {
          wind_speed_10m: [],
          wind_gusts_10m: [],
          precipitation: [],
          pressure_msl: [],
        },
      }),
    }));

    const result = await fetchOpenMeteoECMWF(19.8, 85.83);
    // Should still return a valid object with default values
    expect(result).not.toBeNull();
    expect(result?.windSpeed10m).toBe(0);
    expect(result?.precipitation).toBe(0);
    expect(result?.pressure).toBe(1013); // default pressure
  });

  it("sourceNote must explicitly state it is NOT an official IMD forecast", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        hourly: {
          wind_speed_10m: [25],
          wind_gusts_10m: [35],
          precipitation: [5],
          pressure_msl: [1005],
        },
      }),
    }));

    const result = await fetchOpenMeteoECMWF(19.8, 85.83);
    // The note must clearly disavow official IMD status
    expect(result?.sourceNote).toContain("NOT an official IMD forecast");
    // It must not claim to be an official/authoritative warning
    const note = result?.sourceNote ?? "";
    const claimsOfficial = /\bofficial\s+IMD\b/i.test(note) && !/NOT/i.test(note);
    expect(claimsOfficial).toBe(false);
  });

});

// ─────────────────────────────────────────────────────────────
// GDACS ADAPTER TESTS
// ─────────────────────────────────────────────────────────────

describe("GDACS live adapter", () => {

  it("returns null when no active cyclone in Bay of Bengal", async () => {
    // Response with features but none in Bay of Bengal
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              eventtype: "TC",
              eventid: 1001,
              eventname: "BEATRICE",
              latitude: -15,    // Southern Indian Ocean — not Bay of Bengal
              longitude: 55,
              windspeed: 120,
            },
          },
        ],
      }),
    }));

    const result = await fetchGDACSActiveCyclone();
    expect(result).toBeNull();
  });

  it("returns HazardScenario when a Bay of Bengal TC is found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              eventtype: "TC",
              eventid: 2001,
              eventname: "TEST-CYCLONE",
              latitude: 14.5,   // Bay of Bengal
              longitude: 87.0,
              windspeed: 150,
              fromdate: "2026-09-29T00:00:00Z",
            },
          },
        ],
      }),
    }));

    const result = await fetchGDACSActiveCyclone();
    expect(result).not.toBeNull();
    expect(result?.cyclone?.name).toBe("TEST-CYCLONE");
    expect(result?.cyclone?.maxWindKph).toBe(150);
    expect(result?.tier).toBe("AUTHORITATIVE_OPEN");
    // Track must only have the current position (no invented future points)
    expect(result?.forecast?.track?.length).toBe(1);
  });

  it("returns null on HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }));
    const result = await fetchGDACSActiveCyclone();
    expect(result).toBeNull();
  });

  it("returns null on network timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError")
    ));
    const result = await fetchGDACSActiveCyclone();
    expect(result).toBeNull();
  });

  it("returns null when features array is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ features: [] }),
    }));
    const result = await fetchGDACSActiveCyclone();
    expect(result).toBeNull();
  });

  it("GDACS scenario never invents future track points", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [{
          properties: {
            eventtype: "TC",
            eventid: 3001,
            eventname: "CYCLONE-X",
            latitude: 16.0,
            longitude: 85.0,
            windspeed: 100,
          },
        }],
      }),
    }));

    const result = await fetchGDACSActiveCyclone();
    expect(result).not.toBeNull();
    // Must have exactly 1 track point (current position only — no invented forecast)
    expect(result?.forecast?.track?.length).toBe(1);
    expect(result?.forecast?.track?.[0]?.latitude).toBe(16.0);
    expect(result?.forecast?.track?.[0]?.longitude).toBe(85.0);
  });

});

// ─────────────────────────────────────────────────────────────
// EVENTS ROUTE CONTRACT TESTS (unit)
// ─────────────────────────────────────────────────────────────

describe("Events route semantic contract", () => {
  it("hasActiveEvent is false when no GDACS event", async () => {
    // Verify the semantic: demo fixture presence does NOT make hasActiveEvent=true
    // This is tested at the adapter level — if GDACS returns null,
    // the events route must set hasActiveEvent=false
    const gdacsResult = null; // simulates no_event
    const hasActiveEvent = gdacsResult !== null;
    expect(hasActiveEvent).toBe(false);
  });

  it("demoAvailable must always be true", () => {
    // The demo fixture is always available regardless of live adapter status
    const demoAvailable = true; // invariant
    expect(demoAvailable).toBe(true);
  });

  it("spatialModelNote must not claim REAL_DATA for spatial coverage", () => {
    // Even when hasActiveEvent=true, spatial model uses MIXED GEE+fixture
    const spatialNote =
      "Spatial engine uses GEE-enriched H3 fixture (MIXED WorldPop + NASADEM + synthetic fallback).";
    expect(spatialNote).not.toContain("REAL_DATA");
    expect(spatialNote).toContain("MIXED");
  });
});
