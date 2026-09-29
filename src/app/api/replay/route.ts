/**
 * GET /api/replay
 *
 * Returns the Fani T-24h pre-event reconstruction state (PREDICTION phase).
 * Information firewall: only pre-event data is included.
 *
 * Query parameters:
 *   k           optional (default 10)
 *   objective   optional (default balanced)
 *   surgeHeight optional (default 1.5)
 */
import { type NextRequest, NextResponse } from "next/server";
import { runFaniDemoEngine } from "../../../engine/runner";
import { FANI_KNOWN_PARAMETERS } from "../../../config/index";
import type { ApiResponse, PriorityObjective } from "../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const k = Math.max(1, parseInt(searchParams.get("k") ?? "10", 10) || 10);
  const objective = (searchParams.get("objective") ?? "balanced") as PriorityObjective;
  const surgeHeight = parseFloat(searchParams.get("surgeHeight") ?? "1.5") || 1.5;

  try {
    const result = await runFaniDemoEngine({
      responseCapacity: k,
      objective,
      surgeHeightM: surgeHeight,
    });

    return NextResponse.json({
      ok: true,
      data: {
        phase: "PREDICTION",
        event: {
          name: "Cyclone Fani",
          predictionCutoff: FANI_KNOWN_PARAMETERS.predictionCutoffAt,
          displayLabel: result.scenario.displayLabel,
          tier: result.scenario.tier,
        },
        scenario: result.scenario,
        recommendations: result.recommendations,
        assets: result.assets,
        stats: result.stats,
        manifest: result.manifest,
        fixtureStatus: result.fixtureStatus,
        informationFirewall: {
          enforced: true,
          cutoffAt: FANI_KNOWN_PARAMETERS.predictionCutoffAt,
          note: "Only pre-event information available before this cutoff is used. Post-event Copernicus/Sentinel-1 data is excluded from the prediction phase.",
        },
      },
      servedAt: new Date().toISOString(),
    } satisfies ApiResponse<unknown>);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: "ENGINE_ERROR", message: String(err) }, servedAt: new Date().toISOString() },
      { status: 503 }
    );
  }
}
