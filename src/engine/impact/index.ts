/**
 * Impact Engine
 *
 * Core formula:
 *   impactExposure.score = hazard.combined × exposure.combined × susceptibilityScore
 *
 * This is MODEL-DERIVED impact exposure / disruption risk.
 * It is NOT damage prediction, structural failure probability,
 * or official flood forecast. Label accordingly in the UI.
 *
 * Preferred wording:
 *   "infrastructure impact exposure"
 *   "disruption risk"
 *   "expected service disruption"
 *   "impact priority"
 */

import type { DataConfidence } from "../../lib/types/index";
import type { FixtureCell } from "../loader/index";
import type { ProcessedHazard, ProcessedCell } from "../types";
import {
  combinedSusceptibilityScore,
  getSusceptibilityFromFixture,
} from "../susceptibility/index";
import {
  EXPOSURE_WEIGHTS,
  NORMALIZATION_BOUNDS,
} from "../../config/index";

type FixtureStatus = "DEMO_FIXTURE" | "REAL_DATA" | "MIXED";
type SurgeSource = "official" | "scenario";
type SurgeMethod = "flood_fill" | "proximity_threshold" | "official";

// ─────────────────────────────────────────────────────────────
// EXPOSURE COMBINATION
// ─────────────────────────────────────────────────────────────

/**
 * Compute combined exposure score from components.
 * criticalNorm: normalized critical infrastructure count (0 if not yet correlated).
 */
export function combineExposure(
  pop: number,
  buildings: number,
  builtAreaHa: number,
  roadKm: number,
  critCount: number
): number {
  const popN = norm(pop, NORMALIZATION_BOUNDS.population);
  const bldN = norm(buildings, NORMALIZATION_BOUNDS.buildings);
  const roadN = norm(roadKm, NORMALIZATION_BOUNDS.roadKm);
  // Critical infrastructure: normalize against a max of 5 assets per cell
  const critN = Math.min(1, critCount / 5);

  return round4(
    EXPOSURE_WEIGHTS.population * popN +
    EXPOSURE_WEIGHTS.buildings * bldN +
    EXPOSURE_WEIGHTS.roads * roadN +
    EXPOSURE_WEIGHTS.criticalInfrastructure * critN
  );
}

// ─────────────────────────────────────────────────────────────
// DATA CONFIDENCE (component-level)
// ─────────────────────────────────────────────────────────────

/**
 * Build component-level DataConfidence.
 *
 * Confidence is NOT risk. It reflects source quality, freshness, and
 * model completeness per component. Each component gets its own score.
 *
 * DEMO_FIXTURE data has reduced confidence across all components because
 * the values are synthetic approximations, not measurement-derived.
 */
export function buildDataConfidence(
  fixtureStatus: FixtureStatus,
  surgeSource: SurgeSource,
  surgeMethod: SurgeMethod
): DataConfidence {
  const isDemoFixture = fixtureStatus === "DEMO_FIXTURE";

  const hazardConf = isDemoFixture ? 0.62 : 0.88;
  const surgeConf =
    surgeSource === "official" ? 0.88
    : surgeMethod === "flood_fill" ? 0.72
    : 0.52; // proximity_threshold is most uncertain
  const popConf = isDemoFixture ? 0.55 : 0.92;
  const bldConf = isDemoFixture ? 0.50 : 0.88;
  const infraConf = isDemoFixture ? 0.45 : 0.72;

  const overall = round4(
    (hazardConf + surgeConf + popConf + bldConf + infraConf) / 5
  );

  const limitingTier =
    isDemoFixture ? "DEMO_FIXTURE"
    : surgeSource === "scenario" || surgeMethod === "proximity_threshold"
      ? "SCENARIO"
      : "MODEL_DERIVED";

  const notes: string[] = [];
  if (isDemoFixture) {
    notes.push("Confidence reduced — values are synthetic demo fixture approximations");
  }
  if (surgeMethod === "proximity_threshold") {
    notes.push(
      "Surge confidence reduced — proximity threshold is a screening approximation, not a validated flood model"
    );
  }

  return {
    overall,
    components: {
      hazard: hazardConf,
      surge: surgeConf,
      population: popConf,
      buildings: bldConf,
      infrastructure: infraConf,
    },
    limitingTier,
    notes: notes.length > 0 ? notes : undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// IMPACT EXPOSURE COMPUTATION
// ─────────────────────────────────────────────────────────────

/**
 * Compute impact exposure for a single cell.
 *
 * impactExposure.score = hazard.combined × exposure.combined × susceptibilityScore
 *
 * All factors are in [0, 1]; result is clamped to [0, 1].
 */
export function computeCellImpactExposure(
  hazard: ProcessedHazard,
  exposureCombined: number,
  floodSusceptibility: number,
  windExposure: number,
  surgeExposed: boolean
): { score: number; probability: number; severity: number } {
  const susc = combinedSusceptibilityScore(
    floodSusceptibility,
    windExposure,
    surgeExposed
  );

  const score = round4(
    Math.min(1, hazard.combined * exposureCombined * susc)
  );

  // For MVP: probability = score (no calibrated model yet)
  // Severity: slightly higher weighting toward higher-hazard portion
  const severity = round4(
    Math.min(1, (hazard.combined * 0.6 + score * 0.4))
  );

  return { score, probability: score, severity };
}

// ─────────────────────────────────────────────────────────────
// FULL PIPELINE: FIXTURE CELLS → PROCESSED CELLS
// ─────────────────────────────────────────────────────────────

/**
 * Run impact computation for all cells.
 *
 * Returns a Map<cellId, ProcessedCell> with:
 *   - hazard from hazardMap (scenario-applied)
 *   - exposure from fixture
 *   - susceptibility from fixture + hazard surgeExposed override
 *   - impactExposure computed from the above
 *   - infrastructure stats initialised to 0 (populated by infrastructure engine)
 *   - priority initialised to null rank (populated by priority engine)
 */
export function computeImpactForAllCells(
  cells: Map<string, FixtureCell>,
  hazardMap: Map<string, ProcessedHazard>,
  fixtureStatus: FixtureStatus,
  surgeSource: SurgeSource,
  surgeMethod: SurgeMethod
): Map<string, ProcessedCell> {
  const confidence = buildDataConfidence(fixtureStatus, surgeSource, surgeMethod);
  const result = new Map<string, ProcessedCell>();

  for (const [cellId, cell] of cells) {
    if (!cell.properties.isLand) continue; // skip ocean cells in processing

    const hazard = hazardMap.get(cellId);
    if (!hazard) continue;

    const susceptibility = getSusceptibilityFromFixture(cell, hazard.surgeExposed);

    const raw = cell.properties.exposure;
    const exposureCombined = combineExposure(
      raw.population,
      raw.buildings,
      raw.builtAreaHa,
      raw.roadKm,
      raw.criticalAssetCount
    );

    const { score, probability, severity } = computeCellImpactExposure(
      hazard,
      exposureCombined,
      susceptibility.floodSusceptibility,
      susceptibility.windExposure,
      hazard.surgeExposed
    );

    const processedCell: ProcessedCell = {
      cellId,
      isLand: true,
      centerLng: cell.centerLng,
      centerLat: cell.centerLat,

      hazard,

      exposure: {
        population: raw.population,
        buildings: raw.buildings,
        builtAreaHa: raw.builtAreaHa,
        roadKm: raw.roadKm,
        criticalAssetCount: raw.criticalAssetCount,
        combined: exposureCombined,
      },

      susceptibility: {
        floodSusceptibility: susceptibility.floodSusceptibility,
        windExposure: susceptibility.windExposure,
        coastalProximityKm: susceptibility.coastalProximityKm,
        elevationMedianM: susceptibility.elevationMedianM,
        surgeExposed: hazard.surgeExposed,
      },

      impactExposure: {
        score,
        probability,
        severity,
        confidence,
      },

      // Infrastructure stats — populated later by infrastructure engine
      infrastructure: {
        assetCount: 0,
        combinedCriticality: 0,
        dependencyCentrality: 0,
      },

      // Priority — populated later by priority engine
      priority: {
        score: 0,
        rank: null,
        interventionBenefit: 0,
      },
    };

    result.set(cellId, processedCell);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function norm(value: number, bounds: { min: number; max: number }): number {
  return Math.min(1, Math.max(0, (value - bounds.min) / (bounds.max - bounds.min)));
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
