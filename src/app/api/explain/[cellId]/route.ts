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
import { loadGEEEnrichment } from "../../../../engine/loader/gee-loader";
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

    // ── Per-cell field provenance ──────────────────────────────────────────
    // Check which specific GEE files contain real data for THIS cell.
    // This answers "Is this cell's population from WorldPop or synthetic?"
    // for each field individually, not just the profile-level aggregate.
    const geeEnrichment = loadGEEEnrichment();
    const cellFieldProvenance = {
      population: {
        source: geeEnrichment.population.has(cellId) ? "WORLDPOP_2019" : "DEMO_FIXTURE",
        value: geeEnrichment.population.get(cellId) ?? null,
        note: geeEnrichment.population.has(cellId)
          ? "Real WorldPop 2019 population count (GEE-derived)"
          : "Synthetic population — WorldPop 2019 data not available for this cell",
      },
      elevationM: {
        source: geeEnrichment.elevationM.has(cellId) ? "NASADEM" : "DEMO_FIXTURE",
        value: geeEnrichment.elevationM.get(cellId) ?? null,
        note: geeEnrichment.elevationM.has(cellId)
          ? "Real NASADEM elevation (GEE-derived)"
          : "Synthetic elevation — NASADEM data not available for this cell",
      },
      buildings: {
        source: "DEMO_FIXTURE",
        note: "Synthetic building count — Open Buildings not integrated",
      },
      roads: {
        source: "DEMO_FIXTURE",
        note: "Synthetic road-km — full OSM extraction not completed",
      },
      infrastructure: {
        source: "CURATED_OSM",
        note: "15 curated assets from public/OSM references — inventory incomplete",
      },
    };

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

        // Per-cell field provenance — which inputs are real GEE vs synthetic
        // Operators should check this to understand which values are real
        fieldProvenance: cellFieldProvenance,

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
  } catch (_err) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "ENGINE_ERROR", message: "Engine computation failed. Check server logs." },
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
