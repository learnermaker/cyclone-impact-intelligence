/**
 * GET /api/actual/flood
 *
 * Returns Sentinel-1 derived flood extent as a GeoJSON FeatureCollection
 * for the `actual_impact` map layer.
 *
 * This is the REVEAL-phase endpoint. The TemporalFirewall is satisfied by
 * explicitly passing phase="REVEAL" to loadGEERevealData — this endpoint
 * represents the deliberate user action of revealing post-event data.
 *
 * Query parameters:
 *   bbox   required  minLng,minLat,maxLng,maxLat
 *
 * Feature properties:
 *   { v: number [0..1] flooded fraction, isFlooded: true, isLand: true }
 *
 * Returns empty FeatureCollection if Sentinel-1 file is unavailable.
 * Never fabricates flood extent.
 */
import { type NextRequest, NextResponse } from "next/server";
import { loadGEERevealData } from "../../../../engine/loader/gee-loader";
import {
  loadFixtureCells,
  filterCellsByBbox,
  MAX_CELLS_PER_RESPONSE,
} from "../../../../engine/loader/index";
import type { ApiResponse } from "../../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const bboxParam = searchParams.get("bbox");

  if (!bboxParam) {
    return NextResponse.json(
      { ok: false, error: { code: "MISSING_PARAM", message: "bbox required" }, servedAt: new Date().toISOString() },
      { status: 400 }
    );
  }

  const bboxParts = bboxParam.split(",").map(Number);
  if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_BBOX", message: "bbox must be 4 comma-separated numbers" }, servedAt: new Date().toISOString() },
      { status: 400 }
    );
  }
  const bbox = bboxParts as [number, number, number, number];

  try {
    // Load Sentinel-1 actual flood data.
    // TemporalFirewall: "REVEAL" phase explicitly allows Sentinel-1 access.
    const revealData = loadGEERevealData("REVEAL");
    const floodedSet = new Set(revealData.floodedCellIds);

    if (floodedSet.size === 0) {
      return emptyResponse("Sentinel-1 file loaded but no flooded cells found");
    }

    // Load fixture cell geometries and filter by viewport
    const fixtureCells = loadFixtureCells();
    const viewportCells = filterCellsByBbox(fixtureCells, bbox, MAX_CELLS_PER_RESPONSE);

    // Return only flooded land cells with floodedFraction as v
    const features = viewportCells
      .filter((cell) => cell.properties.isLand && floodedSet.has(cell.id))
      .map((cell) => ({
        type: "Feature" as const,
        id: cell.id,
        geometry: cell.geometry,
        properties: {
          // Use floodedFraction (0-1) as the visual value; default 1 if missing
          v: revealData.floodedFraction.get(cell.id) ?? 1,
          isFlooded: true,
          isLand: true,
        },
      }));

    return NextResponse.json({
      ok: true,
      data: {
        type: "FeatureCollection",
        features,
        meta: {
          layer: "actual_impact",
          source: "Sentinel-1 GRD SAR — post-event inundation proxy (GEE processed)",
          evidenceDate: "2019-05-04",
          floodedCellsInViewport: features.length,
          totalFloodedCells: revealData.floodedCellIds.length,
          sources: revealData.sources,
        },
      },
      servedAt: new Date().toISOString(),
    } satisfies ApiResponse<unknown>);
  } catch (err) {
    // File not found or TemporalFirewallError — return empty with explanation
    return emptyResponse(String(err));
  }
}

function emptyResponse(note: string): NextResponse {
  return NextResponse.json({
    ok: true,
    data: {
      type: "FeatureCollection",
      features: [],
      meta: {
        layer: "actual_impact",
        source: "Sentinel-1 — data unavailable",
        note,
        totalFloodedCells: 0,
      },
    },
    servedAt: new Date().toISOString(),
  } satisfies ApiResponse<unknown>);
}
