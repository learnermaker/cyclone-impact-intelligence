/**
 * POST /api/scenario
 *
 * Run the engine with custom scenario overrides.
 * Returns filtered analytical results (no full cell dump).
 *
 * Body:
 *   windMultiplier      optional (default 1.0)
 *   rainfallMultiplier  optional (default 1.0)
 *   surgeHeightM        optional (default 1.5)
 *   surgeMethod         optional (flood_fill | proximity_threshold)
 *   k                   optional (default 10)
 *   objective           optional (balanced | population | infrastructure | service_continuity)
 *
 * Every response carries displayLabel = "SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST"
 * when scenario overrides are applied.
 */
import { type NextRequest, NextResponse } from "next/server";
import { runFaniDemoEngine } from "../../../engine/runner";
import type { ApiResponse, PriorityObjective } from "../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_OBJECTIVES: PriorityObjective[] = [
  "balanced", "population", "infrastructure", "service_continuity",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    const windMultiplier = clamp(Number(body.windMultiplier ?? 1.0), 0.5, 2.0);
    const rainfallMultiplier = clamp(Number(body.rainfallMultiplier ?? 1.0), 0.5, 2.0);
    const surgeHeightM = clamp(Number(body.surgeHeightM ?? 1.5), 0.5, 4.0);
    const surgeMethodRaw = String(body.surgeMethod ?? "flood_fill");
    const surgeMethod: "flood_fill" | "proximity_threshold" =
      surgeMethodRaw === "proximity_threshold" ? "proximity_threshold" : "flood_fill";
    const k = clamp(Math.round(Number(body.k ?? 10)), 1, 200);
    const objectiveRaw = String(body.objective ?? "balanced");
    const objective: PriorityObjective = VALID_OBJECTIVES.includes(objectiveRaw as PriorityObjective)
      ? objectiveRaw as PriorityObjective
      : "balanced";

    const result = await runFaniDemoEngine({
      windMultiplier,
      rainfallMultiplier,
      surgeHeightM,
      surgeMethod,
      responseCapacity: k,
      objective,
    });

    return NextResponse.json({
      ok: true,
      data: {
        scenario: result.scenario,
        recommendations: result.recommendations,
        stats: result.stats,
        manifest: result.manifest,
        fixtureStatus: result.fixtureStatus,
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
