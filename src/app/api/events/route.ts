/**
 * GET /api/events
 *
 * Returns the current event status, live adapter results, and meteorological
 * context from Open-Meteo ECMWF.
 *
 * Source priority:
 *   1. GDACS live active cyclone (Bay of Bengal, authoritative_open)
 *   2. Open-Meteo ECMWF context at Puri (supplementary, model_derived)
 *   3. Fani T-24h demo fixture (demoEvent — always available for offline demo)
 *
 * Semantic contract:
 *   hasActiveEvent = true   ONLY when a real GDACS event is detected
 *   hasActiveEvent = false  when no live cyclone; demoAvailable=true
 *
 * NOTE on spatial model tier:
 *   Even when hasActiveEvent=true (real GDACS cyclone), the spatial engine
 *   still operates on the GEE-enriched fixture (MIXED coverage).
 *   The cyclone track source tier is SEPARATE from the spatial model tier.
 *
 * IMPORTANT: This route NEVER fabricates a live cyclone.
 */

import { type NextRequest, NextResponse } from "next/server";
import { loadFixtureHazardScenario, getFixtureMetadata } from "../../../engine/loader/index";
import { fetchGDACSActiveCyclone } from "../../../adapters/gdacs/index";
import { fetchOpenMeteoECMWF } from "../../../adapters/openmeteo/index";
import type { ApiResponse } from "../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Puri, Odisha — reference location for meteorological context
const PURI_LAT = 19.8;
const PURI_LNG = 85.83;

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // ── 1. Try GDACS live adapter (5 s timeout, no credentials) ──────────────
    let liveEvent: Awaited<ReturnType<typeof fetchGDACSActiveCyclone>> = null;
    let liveAdapterStatus: "ok" | "unavailable" | "no_event" = "unavailable";

    try {
      liveEvent = await fetchGDACSActiveCyclone();
      liveAdapterStatus = liveEvent ? "ok" : "no_event";
    } catch {
      liveAdapterStatus = "unavailable";
    }

    const hasActiveEvent = liveEvent !== null;

    // ── 2. Open-Meteo ECMWF meteorological context at Puri ───────────────────
    // Supplementary only — never replace GDACS or official IMD data.
    // Graceful: failure leaves meteorologicalContext as null.
    let meteorologicalContext: Awaited<ReturnType<typeof fetchOpenMeteoECMWF>> = null;
    try {
      meteorologicalContext = await fetchOpenMeteoECMWF(PURI_LAT, PURI_LNG);
    } catch {
      // silently ignore — not a hard dependency
    }

    // ── 3. Demo fixture (always available as offline fallback) ────────────────
    const scenario = loadFixtureHazardScenario() as Record<string, unknown>;
    const meta = getFixtureMetadata();

    const demoEvent = {
      eventId: scenario.eventId ?? "fani-2019-t24h",
      displayLabel: scenario.displayLabel ?? "HISTORICAL REPLAY — PRE-EVENT RECONSTRUCTION",
      tier: "DEMO_FIXTURE",
      fixtureStatus: meta.dataStatus,
      issuedAt: scenario.issuedAt,
      cyclone: scenario.cyclone,
      rainfall: scenario.rainfall,
      surge: scenario.surge,
      forecast: scenario.forecast,
    };

    const response: ApiResponse<unknown> = {
      ok: true,
      data: {
        // ── Event presence ────────────────────────────────────────────────────
        hasActiveEvent,
        mode: hasActiveEvent ? "LIVE" : "DEMO",

        // ── Real active event (only present when hasActiveEvent=true) ─────────
        ...(hasActiveEvent && liveEvent
          ? {
              activeEvent: {
                ...liveEvent,
                source: "GDACS",
                trackNote:
                  liveEvent.forecast?.track?.length === 1
                    ? "Single current position only — no forecast track available from GDACS"
                    : "GDACS track available",
              },
            }
          : {}),

        // ── Demo/offline path (always available) ─────────────────────────────
        demoAvailable: true,
        demoEvent,

        // ── Meteorological context from Open-Meteo ECMWF ─────────────────────
        // This is supplementary model-derived data, NOT an official IMD warning.
        meteorologicalContext: meteorologicalContext
          ? {
              ...meteorologicalContext,
              referenceLocation: "Puri, Odisha (19.8°N, 85.83°E)",
              label: "ECMWF IFS via Open-Meteo — MODEL-DERIVED, NOT an official IMD forecast",
              note: "Do not present as official cyclone forecast or IMD advisory",
            }
          : null,
        meteorologicalContextNote:
          meteorologicalContext === null
            ? "Open-Meteo ECMWF unavailable — meteorological context not available"
            : null,

        // ── Live adapter status ───────────────────────────────────────────────
        liveAdapterStatus,
        liveAdapterNote:
          liveAdapterStatus === "unavailable"
            ? "GDACS live adapter unavailable"
            : liveAdapterStatus === "no_event"
            ? "GDACS reached — no active cyclone in Bay of Bengal / Indian Ocean"
            : "GDACS active event detected",

        // ── Spatial model note ────────────────────────────────────────────────
        // The spatial engine always uses the GEE-enriched fixture (MIXED coverage).
        // This is INDEPENDENT of the cyclone track source tier.
        spatialModelNote:
          "Spatial engine uses GEE-enriched H3 fixture (MIXED WorldPop + NASADEM + synthetic fallback). " +
          "Spatial model tier is independent of the cyclone track source.",

        // ── Fixture metadata ──────────────────────────────────────────────────
        fixtureVersion: meta.version,

        // ── Data warning (shown when using demo mode) ─────────────────────────
        dataWarning: !hasActiveEvent
          ? "DEMO FIXTURE — synthetic pre-event approximation. Not historical ground truth · No active live cyclone detected."
          : null,
      },
      servedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "EVENTS_ERROR",
          message: "Failed to load event status",
          detail: "Internal error loading event status. Check server logs.",
        },
        servedAt: new Date().toISOString(),
      } satisfies ApiResponse<never>,
      { status: 503 }
    );
  }
}
