/**
 * GET /api/events
 *
 * Returns the current event status and hazard scenario.
 *
 * Source priority:
 *   1. GDACS live active cyclone (Bay of Bengal, authoritative_open)
 *   2. Open-Meteo ECMWF context at Puri (supplementary, model_derived)
 *   3. Fani T-24h demo fixture (DEMO_FIXTURE fallback)
 *
 * The primary demo always works regardless of live adapter availability.
 * Mode = REPLAY when using the fixture; LIVE when a real event is detected.
 *
 * IMPORTANT: This route NEVER fabricates a live cyclone.
 * If no real event is detected, it returns hasActiveEvent: true with
 * the demo fixture AND an explicit dataWarning. The UI shows the honest
 * "no active event" state with Fani Replay and Demo Scenario launch buttons.
 */

import { type NextRequest, NextResponse } from "next/server";
import { loadFixtureHazardScenario, getFixtureMetadata } from "../../../engine/loader/index";
import { fetchGDACSActiveCyclone } from "../../../adapters/gdacs/index";
import type { ApiResponse } from "../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // ── Try GDACS live adapter (5s timeout, no credentials needed) ──────────
    let liveEvent: Awaited<ReturnType<typeof fetchGDACSActiveCyclone>> = null;
    let liveAdapterStatus: "ok" | "unavailable" | "no_event" = "unavailable";

    try {
      liveEvent = await fetchGDACSActiveCyclone();
      liveAdapterStatus = liveEvent ? "ok" : "no_event";
    } catch {
      liveAdapterStatus = "unavailable";
    }

    const hasRealLiveEvent = liveEvent !== null;

    // ── Fixture fallback ─────────────────────────────────────────────────────
    const scenario = loadFixtureHazardScenario() as Record<string, unknown>;
    const meta = getFixtureMetadata();

    const response: ApiResponse<unknown> = {
      ok: true,
      data: {
        /**
         * hasActiveEvent = true always (Fani demo fixture or real live event).
         * The UI checks the tier and dataWarning to determine what to show.
         * "No active cyclone" state is shown when tier = DEMO_FIXTURE.
         */
        hasActiveEvent: true,
        mode: hasRealLiveEvent ? "LIVE" : "REPLAY",

        // Active event: prefer live GDACS event, fall back to fixture
        activeEvent: hasRealLiveEvent
          ? {
              ...liveEvent,
              source: "GDACS",
            }
          : {
              eventId: scenario.eventId ?? "fani-2019-t24h",
              displayLabel: scenario.displayLabel ?? "HISTORICAL REPLAY — PRE-EVENT RECONSTRUCTION",
              tier: scenario.tier ?? "DEMO_FIXTURE",
              issuedAt: scenario.issuedAt,
              cyclone: scenario.cyclone,
              rainfall: scenario.rainfall,
              surge: scenario.surge,
              forecast: scenario.forecast,
              notes: scenario._notes,
            },

        // Live adapter status — transparent to the UI
        liveAdapterStatus,
        liveAdapterNote:
          liveAdapterStatus === "unavailable"
            ? "GDACS live adapter unavailable — using Fani demo fixture"
            : liveAdapterStatus === "no_event"
            ? "GDACS adapter reached — no active cyclone in Bay of Bengal"
            : "GDACS active event detected",

        fixtureStatus: hasRealLiveEvent ? "REAL_DATA" : meta.dataStatus,
        fixtureVersion: meta.version,
        predictionCutoff: meta.generationTimestamp,

        // dataWarning is set when the fixture is synthetic (demo mode)
        dataWarning: !hasRealLiveEvent
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
          detail: String(err),
        },
        servedAt: new Date().toISOString(),
      } satisfies ApiResponse<never>,
      { status: 503 }
    );
  }
}
