/**
 * Exposure Engine
 *
 * Aggregates population, building, road, and critical-infrastructure
 * counts into H3 resolution-8 cells.
 *
 * Data sources (for Fani replay / real data):
 *   - WorldPop 2019 (population)
 *   - Open Buildings Temporal 2019 (buildings)
 *   - OSM January 2019 (roads)
 *   - Curated infrastructure GeoJSON (critical assets)
 *
 * Combined exposure: E = 0.35*pop + 0.25*bld + 0.15*road + 0.25*critical
 * Weights configurable in src/config/index.ts.
 *
 * All inputs normalized to [0, 1] using NORMALIZATION_BOUNDS before combination.
 *
 * Phase 3: Implementation.
 */

import type { ImpactCell } from "@/lib/types/index";
import { EXPOSURE_WEIGHTS, NORMALIZATION_BOUNDS } from "@/config/index";

export type RawExposureInput = {
  cellId: string;
  population: number;
  buildings: number;
  builtAreaHa: number;
  roadKm: number;
  criticalAssetCount: number;
};

/**
 * Normalize a population count to [0, 1].
 */
export function normalizePopulation(population: number): number {
  const { min, max } = NORMALIZATION_BOUNDS.population;
  return Math.min(1, Math.max(0, (population - min) / (max - min)));
}

/**
 * Normalize a building count to [0, 1].
 */
export function normalizeBuildings(buildings: number): number {
  const { min, max } = NORMALIZATION_BOUNDS.buildings;
  return Math.min(1, Math.max(0, (buildings - min) / (max - min)));
}

/**
 * Normalize a road km to [0, 1].
 */
export function normalizeRoadKm(roadKm: number): number {
  const { min, max } = NORMALIZATION_BOUNDS.roadKm;
  return Math.min(1, Math.max(0, (roadKm - min) / (max - min)));
}

/**
 * Compute combined exposure from normalized components.
 */
export function combineExposureScores(
  normalizedPop: number,
  normalizedBuildings: number,
  normalizedRoadKm: number,
  normalizedCritical: number
): number {
  return (
    EXPOSURE_WEIGHTS.population * normalizedPop +
    EXPOSURE_WEIGHTS.buildings * normalizedBuildings +
    EXPOSURE_WEIGHTS.roads * normalizedRoadKm +
    EXPOSURE_WEIGHTS.criticalInfrastructure * normalizedCritical
  );
}

/**
 * Aggregate raw exposure inputs into cell exposure objects.
 *
 * Phase 3: TODO — implement H3 aggregation from GeoJSON sources.
 */
export function aggregateExposure(
  _rawInputs: RawExposureInput[]
): Pick<ImpactCell, "cellId" | "exposure">[] {
  // TODO Phase 3: implement H3 aggregation
  throw new Error("aggregateExposure: not yet implemented (Phase 3)");
}
