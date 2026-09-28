/**
 * Hazard Engine
 *
 * Responsibilities:
 *  1. Normalize wind, rainfall, and surge to [0, 1].
 *  2. Apply scenario overrides (multipliers, surge height change).
 *  3. Determine surge exposure per cell using one of two methods:
 *       PREFERRED — flood_fill: elevation threshold + coastal/tidal connectivity BFS
 *       FALLBACK  — proximity_threshold: elevation + configurable distance threshold
 *                   MUST be labelled "SCREENING APPROXIMATION" in UI metadata.
 *  4. Compute combined hazard: H = 0.40*wind + 0.30*rain + 0.30*surge
 *
 * Invariants (tested):
 *  - combined = 0.40*wind + 0.30*rain + 0.30*surge (±0.0001 rounding)
 *  - increasing rainfallMultiplier can only increase or preserve rain score
 *  - increasing surgeHeightM can only increase or preserve surge-exposed cell count
 *  - all normalized values remain in [0, 1]
 *
 * Surge model label requirement (from locked guardrails):
 *  If surgeMethod = 'proximity_threshold', the ProcessedHazard.surgeLabel
 *  must be set. API routes must propagate this to the UI.
 */

import { gridDisk } from "h3-js";
import type { FixtureCell } from "../loader/index";
import type { ProcessedHazard } from "../types";
import {
  HAZARD_WEIGHTS,
  NORMALIZATION_BOUNDS,
  SURGE_MODEL,
} from "../../config/index";

// ─────────────────────────────────────────────────────────────
// NORMALIZATION
// ─────────────────────────────────────────────────────────────

export function normalizeWind(windKph: number): number {
  const { min, max } = NORMALIZATION_BOUNDS.windKph;
  return Math.min(1, Math.max(0, (windKph - min) / (max - min)));
}

export function normalizeRainfall(rainfall24hMm: number): number {
  const { min, max } = NORMALIZATION_BOUNDS.rainfall24hMm;
  return Math.min(1, Math.max(0, (rainfall24hMm - min) / (max - min)));
}

export function normalizeSurge(surgeM: number): number {
  const { min, max } = NORMALIZATION_BOUNDS.surgeM;
  return Math.min(1, Math.max(0, (surgeM - min) / (max - min)));
}

/**
 * Compute combined hazard score.
 * INVARIANT: result = 0.40*wind + 0.30*rain + 0.30*surge (checked by Zod schema)
 */
export function combineHazard(
  wind: number,
  rainfall: number,
  surge: number
): number {
  return round4(
    HAZARD_WEIGHTS.wind * wind +
    HAZARD_WEIGHTS.rainfall * rainfall +
    HAZARD_WEIGHTS.surge * surge
  );
}

// ─────────────────────────────────────────────────────────────
// SURGE EXPOSURE — PREFERRED: FLOOD-FILL
// ─────────────────────────────────────────────────────────────

/**
 * Determine surge-exposed cells via coastal connectivity flood-fill.
 *
 * Algorithm:
 *  1. Find seed cells: land cells very close to the coast (< seedDistKm) that
 *     are at or below the surge height.
 *  2. BFS-expand through H3 neighbors, only crossing into cells where
 *     elevationMedianM >= 0 AND elevationMedianM <= surgeHeightM.
 *
 * This is the preferred method. It avoids the arbitrary distance cutoff
 * of the proximity fallback and produces spatially connected flood extent.
 *
 * @param cells - All fixture cells keyed by cellId
 * @param surgeHeightM - Scenario surge height in metres
 * @param seedDistKm - Max coastal proximity for seed cells (default 2 km)
 */
export function surgeFloodFill(
  cells: Map<string, FixtureCell>,
  surgeHeightM: number,
  seedDistKm = 2.0
): Set<string> {
  const exposed = new Set<string>();
  const queue: string[] = [];

  // Step 1: Seed cells — land, within seedDistKm of coast, at/below surge height
  for (const [cellId, cell] of cells) {
    const { isLand, susceptibility: s } = cell.properties;
    if (
      isLand &&
      s.coastalProximityKm <= seedDistKm &&
      s.elevationMedianM >= 0 &&
      s.elevationMedianM <= surgeHeightM
    ) {
      exposed.add(cellId);
      queue.push(cellId);
    }
  }

  // Step 2: BFS expansion via H3 grid neighbors
  while (queue.length > 0) {
    const current = queue.shift()!;
    // gridDisk(cell, 1) returns the cell itself + 6 neighbors
    const neighbors = gridDisk(current, 1).filter((n) => n !== current);

    for (const neighborId of neighbors) {
      if (exposed.has(neighborId)) continue;

      const neighbor = cells.get(neighborId);
      if (!neighbor) continue; // cell not in fixture (ocean or outside AOI)

      const { isLand, susceptibility: s } = neighbor.properties;
      if (
        isLand &&
        s.elevationMedianM >= 0 &&
        s.elevationMedianM <= surgeHeightM
      ) {
        exposed.add(neighborId);
        queue.push(neighborId);
      }
    }
  }

  return exposed;
}

// ─────────────────────────────────────────────────────────────
// SURGE EXPOSURE — FALLBACK: PROXIMITY THRESHOLD
//
// Used when flood-fill inputs are unavailable.
// The 25 km threshold is configurable and must be labelled as a
// SCREENING APPROXIMATION in all metadata and UI contexts.
// ─────────────────────────────────────────────────────────────

/**
 * Proximity-based surge screening (fallback only).
 *
 * LABEL REQUIREMENT: Any cell marked as surge-exposed by this method
 * must carry surgeLabel = "SCREENING APPROXIMATION..." in its ProcessedHazard.
 *
 * @param cell - Fixture cell to evaluate
 * @param surgeHeightM - Scenario surge height
 * @param thresholdKm - Configurable distance threshold (NOT scientifically validated)
 */
export function isSurgeExposedProximity(
  cell: FixtureCell,
  surgeHeightM: number,
  thresholdKm: number
): boolean {
  const s = cell.properties.susceptibility;
  return (
    cell.properties.isLand &&
    s.elevationMedianM >= 0 &&
    s.elevationMedianM <= surgeHeightM &&
    s.coastalProximityKm <= thresholdKm
  );
}

// ─────────────────────────────────────────────────────────────
// SCENARIO OVERRIDE APPLICATION
// ─────────────────────────────────────────────────────────────

/**
 * Apply scenario multipliers to a cell's base hazard values.
 *
 * Multipliers can only scale WITHIN [0, 1] — they cannot exceed 1.0.
 * Increasing windMultiplier always increases or preserves wind score.
 * Increasing rainfallMultiplier always increases or preserves rainfall score.
 */
export function applyHazardMultipliers(
  baseWind: number,
  baseRainfall: number,
  windMultiplier: number,
  rainfallMultiplier: number
): { wind: number; rainfall: number } {
  return {
    wind: Math.min(1, Math.max(0, baseWind * windMultiplier)),
    rainfall: Math.min(1, Math.max(0, baseRainfall * rainfallMultiplier)),
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN HAZARD COMPUTATION
// ─────────────────────────────────────────────────────────────

export type HazardEngineOptions = {
  windMultiplier?: number;
  rainfallMultiplier?: number;
  surgeHeightM?: number;
  surgeMethod?: "flood_fill" | "proximity_threshold";
  surgeProximityThresholdKm?: number;
};

/**
 * Compute processed hazard for all cells.
 *
 * When surgeHeightM changes from the fixture default, the surge exposure
 * is recomputed using the selected surge method.
 *
 * Returns a Map<cellId, ProcessedHazard> for O(1) lookup.
 */
export function computeHazardForAllCells(
  cells: Map<string, FixtureCell>,
  baseSurgeM: number,
  options: HazardEngineOptions = {}
): Map<string, ProcessedHazard> {
  const {
    windMultiplier = 1.0,
    rainfallMultiplier = 1.0,
    surgeHeightM = baseSurgeM,
    surgeMethod = SURGE_MODEL.preferredMethod,
    surgeProximityThresholdKm = SURGE_MODEL.proximityThresholdKm,
  } = options;

  // Compute surge exposure for ALL cells using the selected method
  const surgeExposedSet =
    surgeMethod === "flood_fill"
      ? surgeFloodFill(cells, surgeHeightM)
      : null; // proximity: computed per-cell below

  const surgeNorm = normalizeSurge(surgeHeightM);

  // Label required when using the proximity fallback
  const proximityLabel =
    "SCREENING APPROXIMATION — configurable proximity threshold, not a validated Fani surge boundary" as const;

  const result = new Map<string, ProcessedHazard>();

  for (const [cellId, cell] of cells) {
    if (!cell.properties.isLand) {
      // Ocean cells have zero hazard
      result.set(cellId, {
        wind: 0,
        rainfall: 0,
        surge: 0,
        combined: 0,
        surgeExposed: false,
        surgeMethod,
      });
      continue;
    }

    // Apply scenario multipliers to base fixture values
    const base = cell.properties.hazard;
    const { wind, rainfall } = applyHazardMultipliers(
      base.wind,
      base.rainfall,
      windMultiplier,
      rainfallMultiplier
    );

    // Surge exposure for this cell
    let surgeExposed: boolean;
    if (surgeMethod === "flood_fill" && surgeExposedSet) {
      surgeExposed = surgeExposedSet.has(cellId);
    } else {
      surgeExposed = isSurgeExposedProximity(
        cell,
        surgeHeightM,
        surgeProximityThresholdKm
      );
    }

    // Surge severity: full value if exposed, zero otherwise
    const surge = surgeExposed ? surgeNorm : 0;
    const combined = combineHazard(wind, rainfall, surge);

    const hazard: ProcessedHazard = {
      wind: round4(wind),
      rainfall: round4(rainfall),
      surge: round4(surge),
      combined,
      surgeExposed,
      surgeMethod,
    };

    if (surgeMethod === "proximity_threshold") {
      hazard.surgeLabel = proximityLabel;
    }

    result.set(cellId, hazard);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
