/**
 * GET /api/impact
 *
 * Returns a viewport-filtered GeoJSON FeatureCollection for a single map layer.
 *
 * Query parameters:
 *   bbox         required  minLng,minLat,maxLng,maxLat
 *   layer        required  wind|rainfall|surge|combined_hazard|population|impact|priority
 *   surgeMethod  optional  flood_fill (default) | proximity_threshold
 *   surgeHeight  optional  number in metres (default 1.5)
 *   windMult     optional  wind multiplier (default 1.0)
 *   rainMult     optional  rainfall multiplier (default 1.0)
 *   maxCount     optional  max features returned (default 2000, hard cap 4000)
 *
 * GUARDRAIL: Never returns more than MAX_CELLS_PER_RESPONSE features.
 * The full 43k fixture is server-side only; the client gets only viewport cells.
 *
 * Feature properties are intentionally minimal to keep payload compact:
 *   { v: number, surgeExposed: bool, isLand: bool, rank: number|null }
 */

import { type NextRequest, NextResponse } from "next/server";
import { runFaniDemoEngine } from "../../../engine/runner";
import { loadFixtureCells, filterCellsByBbox, MAX_CELLS_PER_RESPONSE } from "../../../engine/loader/index";
import type { ApiResponse, PriorityObjective } from "../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LayerId =
  | "wind"
  | "rainfall"
  | "surge"
  | "combined_hazard"
  | "population"
  | "impact"
  | "priority";

const VALID_LAYERS: LayerId[] = [
  "wind", "rainfall", "surge", "combined_hazard",
  "population", "impact", "priority",
];

const VALID_SURGE_METHODS = ["flood_fill", "proximity_threshold"] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  // ── Parse parameters ───────────────────────────────────────
  const bboxParam = searchParams.get("bbox");
  const layerParam = searchParams.get("layer") as LayerId | null;

  if (!bboxParam) {
    return errorResponse(400, "MISSING_PARAM", "bbox is required (minLng,minLat,maxLng,maxLat)");
  }
  if (!layerParam || !VALID_LAYERS.includes(layerParam)) {
    return errorResponse(400, "INVALID_PARAM", `layer must be one of: ${VALID_LAYERS.join(", ")}`);
  }

  const bboxParts = bboxParam.split(",").map(Number);
  if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
    return errorResponse(400, "INVALID_BBOX", "bbox must be 4 comma-separated numbers");
  }
  const bbox = bboxParts as [number, number, number, number];

  const surgeMethodParam = searchParams.get("surgeMethod") ?? "flood_fill";
  const surgeMethod = VALID_SURGE_METHODS.includes(surgeMethodParam as typeof VALID_SURGE_METHODS[number])
    ? (surgeMethodParam as "flood_fill" | "proximity_threshold")
    : "flood_fill";

  const surgeHeight = parseFloat(searchParams.get("surgeHeight") ?? "1.5") || 1.5;
  const windMult = parseFloat(searchParams.get("windMult") ?? "1.0") || 1.0;
  const rainMult = parseFloat(searchParams.get("rainMult") ?? "1.0") || 1.0;
  const maxCount = Math.min(
    parseInt(searchParams.get("maxCount") ?? "2000", 10) || 2000,
    MAX_CELLS_PER_RESPONSE
  );
  // K and objective control how many cells runGreedyTopK selects.
  // The priority layer only returns selected cells (rank !== null), so
  // these params directly control what appears on the ACTION map.
  const k = Math.max(1, parseInt(searchParams.get("k") ?? "10", 10) || 10);
  const VALID_OBJECTIVES: PriorityObjective[] = ["balanced", "population", "infrastructure", "service_continuity"];
  const objectiveRaw = searchParams.get("objective") ?? "balanced";
  const objective: PriorityObjective = VALID_OBJECTIVES.includes(objectiveRaw as PriorityObjective)
    ? (objectiveRaw as PriorityObjective)
    : "balanced";

  try {
    // ── Run engine ────────────────────────────────────────────
    const engineResult = await runFaniDemoEngine({
      windMultiplier: windMult,
      rainfallMultiplier: rainMult,
      surgeHeightM: surgeHeight,
      surgeMethod,
      responseCapacity: k,
      objective,
    });

    // ── Filter cells by bbox ──────────────────────────────────
    const fixtureCells = loadFixtureCells();
    const viewportCells = filterCellsByBbox(fixtureCells, bbox, maxCount);

    // ── Build compact GeoJSON ─────────────────────────────────
    const features = viewportCells
      .map((fixtureCell) => {
        if (!fixtureCell.properties.isLand) return null; // skip ocean cells
        const processed = engineResult.cells.get(fixtureCell.id);
        if (!processed) return null;

        const value = getLayerValue(layerParam, processed);
        // null means "this cell should not appear in this layer"
        // (e.g. non-selected cells for the priority layer)
        if (value === null) return null;

        return {
          type: "Feature" as const,
          id: fixtureCell.id,
          geometry: fixtureCell.geometry,
          properties: {
            v: value,
            surgeExposed: processed?.hazard.surgeExposed ?? false,
            // Propagate screening approximation label when proximity method used
            ...(processed?.hazard.surgeLabel
              ? { surgeLabel: processed.hazard.surgeLabel }
              : {}),
            isLand: true,
            rank: layerParam === "priority" ? processed?.priority.rank ?? null : undefined,
          },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    const response: ApiResponse<unknown> = {
      ok: true,
      data: {
        type: "FeatureCollection",
        features,
        meta: {
          layer: layerParam,
          totalLandCells: engineResult.stats.landCells,
          returnedCells: features.length,
          cappedAt: viewportCells.length >= maxCount,
          dataStatus: engineResult.fixtureStatus,
          displayLabel: engineResult.scenario.displayLabel,
          surgeMethod: engineResult.scenario.surgeMethod,
          computedAt: engineResult.computedAt,
        },
      },
      servedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    return errorResponse(503, "ENGINE_ERROR", String(err));
  }
}

function getLayerValue(
  layer: LayerId,
  cell: import("../../../engine/types").ProcessedCell
): number | null {
  switch (layer) {
    case "wind":          return cell.hazard.wind;
    case "rainfall":      return cell.hazard.rainfall;
    case "surge":         return cell.hazard.surge;
    case "combined_hazard": return cell.hazard.combined;
    case "population":
      /**
       * CARTOGRAPHIC DISPLAY TRANSFORM ONLY — not the engine exposure formula.
       *
       * engine.exposure.population = raw WorldPop 2019 person-count per H3 cell (unchanged).
       * This function maps that raw count to a [0,1] display value for MapLibre color encoding.
       *
       * Why sqrt(pop/200)?
       *   WorldPop counts for Odisha coastal rural cells are 1–200 persons.
       *   Linear /50,000 makes all rural cells v < 0.004 (invisible on map).
       *   sqrt(x/200) maps: 1 person→0.07, 50→0.50, 200→1.0, giving
       *   visible variation across the real data range.
       *   Urban cells (>200 persons) cap at 1.0.
       *
       * The engine exposure weights (E = 0.35P + 0.25B + 0.15Road + 0.25Critical)
       * use the raw person count, not this display transform.
       */
      return Math.min(1, Math.sqrt(Math.max(0, cell.exposure.population) / 200));
    case "impact":        return cell.impactExposure.score;
    case "priority":
      // Only render cells that were selected by the greedy top-K picker.
      // Non-selected cells have rank=null and score=0 — returning null
      // filters them out entirely so the map isn't blank with v=0 cells.
      return cell.priority.rank !== null ? cell.priority.score : null;
    default:              return 0;
  }
}

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message },
      servedAt: new Date().toISOString(),
    } satisfies ApiResponse<never>,
    { status }
  );
}
