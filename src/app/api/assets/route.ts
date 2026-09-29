/**
 * GET /api/assets
 *
 * Returns critical infrastructure assets with computed risk scores.
 *
 * Query parameters:
 *   surgeHeight  optional  surge height in metres (default 1.5)
 *   surgeMethod  optional  flood_fill | proximity_threshold
 *
 * Assets are labelled as DEMO_FIXTURE when using synthetic fixture data.
 * The asset inventory is explicitly incomplete:
 *   UI wording: "Mapped assets in available datasets"
 */

import { type NextRequest, NextResponse } from "next/server";
import { runFaniDemoEngine } from "../../../engine/runner";
import type { ApiResponse } from "../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const surgeHeight = parseFloat(searchParams.get("surgeHeight") ?? "1.5") || 1.5;
  const surgeMethod = (
    searchParams.get("surgeMethod") === "proximity_threshold"
      ? "proximity_threshold"
      : "flood_fill"
  ) as "flood_fill" | "proximity_threshold";

  try {
    const result = await runFaniDemoEngine({ surgeHeightM: surgeHeight, surgeMethod });

    const response: ApiResponse<unknown> = {
      ok: true,
      data: {
        assets: result.assets.map((a) => ({
          assetId: a.assetId,
          name: a.name,
          type: a.type,
          coordinates: a.coordinates, // [lng, lat] for map rendering
          criticality: a.criticality,
          vulnerability: a.vulnerability,
          dependencyCentrality: a.dependencyCentrality,
          risk: a.risk,
          exposure: a.exposure,
          confidence: a.confidence,
          containingCellId: a.containingCellId,
        })),
        assetCount: result.assets.length,
        fixtureStatus: result.fixtureStatus,
        inventoryWarning:
          "Infrastructure inventory is incomplete. Showing mapped assets in available datasets only.",
        dataStatus: result.fixtureStatus,
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
