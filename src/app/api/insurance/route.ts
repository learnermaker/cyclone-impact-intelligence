/**
 * GET /api/insurance
 *
 * Evaluates the illustrative parametric insurance trigger for the current scenario.
 *
 * Query parameters:
 *   surgeHeight  optional  surge height in metres (default 1.5)
 *   windMult     optional  wind multiplier (default 1.0)
 *   rainMult     optional  rainfall multiplier (default 1.0)
 *
 * Response is always labelled ILLUSTRATIVE POLICY.
 * No real contract, no real payout.
 */
import { type NextRequest, NextResponse } from "next/server";
import { evaluateInsuranceTrigger, buildTriggerExplanation } from "../../../engine/insurance/index";
import { FANI_KNOWN_PARAMETERS } from "../../../config/index";
import type { ApiResponse } from "../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const surgeHeight = parseFloat(searchParams.get("surgeHeight") ?? "1.5") || 1.5;
  const windMult = parseFloat(searchParams.get("windMult") ?? "1.0") || 1.0;
  const rainMult = parseFloat(searchParams.get("rainMult") ?? "1.0") || 1.0;

  // Compute scenario values from Fani T-24h parameters + multipliers
  const windKph = FANI_KNOWN_PARAMETERS.windKphAt_T24h * windMult;
  const rainfall24hMm = 200 * rainMult; // base 200mm/24h from hazard_scenario.json

  try {
    const trigger = evaluateInsuranceTrigger({ windKph, rainfall24hMm, surgeM: surgeHeight });
    const explanation = buildTriggerExplanation(trigger);

    return NextResponse.json({
      ok: true,
      data: {
        trigger,
        explanation,
        scenarioValues: {
          windKph,
          windMs: windKph / 3.6,
          rainfall24hMm,
          surgeM: surgeHeight,
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
