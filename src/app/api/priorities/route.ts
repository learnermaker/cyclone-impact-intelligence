/**
 * GET /api/priorities
 *
 * Returns the top-K priority recommendations for the current scenario.
 *
 * Query parameters:
 *   k            optional  response capacity (default 10, max 200)
 *   objective    optional  balanced|population|infrastructure|service_continuity
 *   surgeMethod  optional  flood_fill (default) | proximity_threshold
 *   surgeHeight  optional  surge height in metres (default 1.5)
 *   windMult     optional  wind multiplier (default 1.0)
 *   rainMult     optional  rainfall multiplier (default 1.0)
 *
 * Response:
 *   { recommendations, responseCapacity, objective, stats, manifest }
 *
 * INVARIANT: Changing K changes selected interventions, not underlying risk scores.
 */

import { type NextRequest, NextResponse } from "next/server";
import { runFaniDemoEngine } from "../../../engine/runner";
import { RESPONSE_CAPACITY } from "../../../config/index";
import type { PriorityObjective, ApiResponse } from "../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_OBJECTIVES: PriorityObjective[] = [
  "balanced", "population", "infrastructure", "service_continuity",
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  const k = Math.min(
    Math.max(1, parseInt(searchParams.get("k") ?? "10", 10) || 10),
    RESPONSE_CAPACITY.max
  );

  const objectiveParam = searchParams.get("objective") ?? "balanced";
  const objective: PriorityObjective = VALID_OBJECTIVES.includes(objectiveParam as PriorityObjective)
    ? (objectiveParam as PriorityObjective)
    : "balanced";

  const surgeMethodParam = searchParams.get("surgeMethod") ?? "flood_fill";
  const surgeMethod = (["flood_fill", "proximity_threshold"].includes(surgeMethodParam)
    ? surgeMethodParam
    : "flood_fill") as "flood_fill" | "proximity_threshold";

  const surgeHeight = parseFloat(searchParams.get("surgeHeight") ?? "1.5") || 1.5;
  const windMult = parseFloat(searchParams.get("windMult") ?? "1.0") || 1.0;
  const rainMult = parseFloat(searchParams.get("rainMult") ?? "1.0") || 1.0;

  try {
    const result = await runFaniDemoEngine({
      responseCapacity: k,
      objective,
      surgeHeightM: surgeHeight,
      surgeMethod,
      windMultiplier: windMult,
      rainfallMultiplier: rainMult,
    });

    const response: ApiResponse<unknown> = {
      ok: true,
      data: {
        recommendations: result.recommendations,
        responseCapacity: k,
        objective,
        stats: result.stats,
        manifest: result.manifest,
        fixtureStatus: result.fixtureStatus,
        displayLabel: result.scenario.displayLabel,
        dataWarning:
          result.fixtureStatus === "DEMO_FIXTURE"
            ? "DEMO FIXTURE — priority rankings are based on synthetic data, not historical Fani observations."
            : null,
      },
      servedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "ENGINE_ERROR", message: String(err) },
        servedAt: new Date().toISOString(),
      } satisfies ApiResponse<never>,
      { status: 503 }
    );
  }
}
