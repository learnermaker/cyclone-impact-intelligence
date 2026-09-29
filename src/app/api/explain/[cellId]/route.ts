/**
 * GET /api/explain/[cellId]
 *
 * Returns the full evidence-backed explanation for a specific H3 cell.
 * This is the deterministic fallback that Gemini uses as its source of truth.
 *
 * Gemini MUST call this tool (or equivalent) to answer "Why is this #N?"
 * Gemini must NEVER invent evidence — it must cite fields from this response.
 *
 * Response includes:
 *   - Full ProcessedCell data (hazard, exposure, susceptibility, impactExposure, infrastructure)
 *   - Priority rank and recommendation (if cell is in current top-K)
 *   - Deterministic text explanation (Gemini fallback)
 *   - All evidence fields for Gemini to cite
 */

import { type NextRequest, NextResponse } from "next/server";
import { runFaniDemoEngine } from "../../../../engine/runner";
import { buildDeterministicExplanation, buildEvidence } from "../../../../engine/priority/index";
import type { ApiResponse } from "../../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cellId: string }> }
): Promise<NextResponse> {
  const { cellId } = await params;

  if (!cellId || typeof cellId !== "string") {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "MISSING_PARAM", message: "cellId is required" },
        servedAt: new Date().toISOString(),
      } satisfies ApiResponse<never>,
      { status: 400 }
    );
  }

  const { searchParams } = request.nextUrl;
  const k = Math.max(1, parseInt(searchParams.get("k") ?? "10", 10) || 10);
  const surgeHeight = parseFloat(searchParams.get("surgeHeight") ?? "1.5") || 1.5;

  try {
    const result = await runFaniDemoEngine({
      responseCapacity: k,
      surgeHeightM: surgeHeight,
    });

    const cell = result.cells.get(cellId);
    if (!cell) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "CELL_NOT_FOUND",
            message: `Cell ${cellId} not found in fixture. It may be outside the AOI or an ocean cell.`,
          },
          servedAt: new Date().toISOString(),
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    // Find if this cell has a priority recommendation
    const recommendation = result.recommendations.find(
      (r) => r.cellId === cellId
    ) ?? null;

    // Build deterministic explanation
    const evidence = buildEvidence(cell);
    const deterministicText = recommendation
      ? buildDeterministicExplanation(recommendation)
      : buildFallbackExplanation(cell);

    const response: ApiResponse<unknown> = {
      ok: true,
      data: {
        cellId,
        isInTopK: recommendation !== null,
        rank: recommendation?.rank ?? null,

        // Full cell data for Gemini to cite
        cell: {
          hazard: cell.hazard,
          exposure: cell.exposure,
          susceptibility: cell.susceptibility,
          impactExposure: cell.impactExposure,
          infrastructure: cell.infrastructure,
          priority: cell.priority,
          centerLng: cell.centerLng,
          centerLat: cell.centerLat,
        },

        // Priority recommendation if in top-K
        recommendation,

        // Evidence list — Gemini must cite these, not invent
        evidence,

        // Deterministic explanation text
        deterministicExplanation: deterministicText,

        // Metadata
        fixtureStatus: result.fixtureStatus,
        computedAt: result.computedAt,
        engineVersion: result.manifest.engineVersion,
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

function buildFallbackExplanation(
  cell: import("../../../../engine/types").ProcessedCell
): string {
  return [
    `Cell ${cell.cellId} is not in the current top-K selection.`,
    ``,
    `Impact exposure score: ${(cell.impactExposure.score * 100).toFixed(1)}%`,
    `Hazard (combined): ${(cell.hazard.combined * 100).toFixed(1)}%`,
    `Population: ${cell.exposure.population.toLocaleString()}`,
    `Infrastructure assets: ${cell.infrastructure.assetCount}`,
    `Surge exposed: ${cell.hazard.surgeExposed}`,
    `Confidence: ${(cell.impactExposure.confidence.overall * 100).toFixed(0)}% (${cell.impactExposure.confidence.limitingTier})`,
    ``,
    `This cell was not selected because higher-priority cells received the available response capacity.`,
    `Increase response capacity K to include lower-ranked cells.`,
  ].join("\n");
}
