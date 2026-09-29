/**
 * Normalized Cell Data Model + Temporal Firewall
 *
 * NormalizedCellField: a value with its data provenance attached.
 * Every important cell metric knows where it came from.
 *
 * TemporalFirewall: a platform-level enforcement layer.
 * Prevents post-event / reveal-only data from entering the prediction path.
 * This is enforced in code, not just in the UI.
 *
 * EnrichedCellData: the result of merging fixture + GEE data for a cell.
 * Tracks which fields used real data and which used synthetic fallback.
 */

import type { DataSourceId } from "./sources";
import { isPredictionSafe, isRevealOnly } from "./sources";

// ─────────────────────────────────────────────────────────────
// NORMALIZED CELL FIELD
// ─────────────────────────────────────────────────────────────

/**
 * A value with its data provenance.
 * Every engine-facing cell field should be a NormalizedCellField<T>.
 */
export type NormalizedCellField<T> = {
  value: T;
  sourceId: DataSourceId;
  predictionSafe: boolean;
  available: boolean; // false = fell back to synthetic
};

/** Convenience factory for real GEE-derived fields */
export function realField<T>(value: T, sourceId: DataSourceId): NormalizedCellField<T> {
  return { value, sourceId, predictionSafe: isPredictionSafe(sourceId), available: true };
}

/** Convenience factory for synthetic fallback fields */
export function syntheticField<T>(value: T): NormalizedCellField<T> {
  return { value, sourceId: "DEMO_FIXTURE", predictionSafe: true, available: false };
}

// ─────────────────────────────────────────────────────────────
// ENRICHED CELL DATA
//
// The result of merging fixture + GEE data for one H3 cell.
// Tracks per-field provenance and overall coverage status.
// ─────────────────────────────────────────────────────────────

export type CellCoverageStatus = "FULL_REAL" | "PARTIAL_REAL" | "SYNTHETIC";

export type EnrichedCellData = {
  cellId: string;
  centerLng: number;
  centerLat: number;

  /** Population exposure — real WorldPop 2019 or synthetic fallback */
  population: NormalizedCellField<number>;

  /** Terrain elevation — real NASADEM or synthetic fallback */
  elevationM: NormalizedCellField<number>;

  /** Coastal proximity km — computed from geometry, no external source */
  coastalProximityKm: number;

  /**
   * Event rainfall — ONLY populated from GPM after REVEAL.
   * null during PREDICTION phase (temporal firewall).
   * Forecast rainfall comes from hazard scenario, not here.
   */
  observedRainfallMm: NormalizedCellField<number> | null;

  /**
   * Observed inundation proxy — ONLY populated from Sentinel-1 after REVEAL.
   * null during PREDICTION phase.
   */
  observedFloodedFraction: NormalizedCellField<number> | null;
  observedIsFlooded: boolean | null;

  /** Overall coverage status for this cell */
  coverageStatus: CellCoverageStatus;
};

export type EnrichedCellMap = Map<string, EnrichedCellData>;

// ─────────────────────────────────────────────────────────────
// TEMPORAL FIREWALL
//
// Code-enforced barrier preventing post-event data from
// entering the prediction path. Replaces reliance on developer
// discipline or UI visibility alone.
// ─────────────────────────────────────────────────────────────

export type EnginePhase = "PREDICTION" | "REVEAL" | "EVALUATE";

/**
 * Platform temporal firewall.
 *
 * Throws a TemporalFirewallError if a data source is accessed in
 * a phase where it is not permitted.
 *
 * Usage:
 *   TemporalFirewall.assertAllowed("GPM_FANI_EVENT_96H", "PREDICTION");
 *   // → throws: GPM event observation not allowed in PREDICTION phase
 */
export class TemporalFirewall {
  /**
   * Assert that a source is allowed in the given phase.
   * Throws TemporalFirewallError if not.
   */
  static assertAllowed(sourceId: DataSourceId, phase: EnginePhase): void {
    if (phase === "PREDICTION") {
      if (!isPredictionSafe(sourceId)) {
        throw new TemporalFirewallError(
          `Source "${sourceId}" is not prediction-safe and cannot be used in the PREDICTION phase. ` +
            `It may only be accessed in REVEAL or EVALUATE phase.`
        );
      }
    }
    // REVEAL and EVALUATE: all sources allowed
  }

  /**
   * Check without throwing — returns true if allowed.
   */
  static isAllowed(sourceId: DataSourceId, phase: EnginePhase): boolean {
    if (phase === "PREDICTION") return isPredictionSafe(sourceId);
    return true;
  }

  /**
   * Filter a set of fields, removing any that are not allowed in the phase.
   * Returns only prediction-safe fields during PREDICTION.
   */
  static filterForPhase<T>(
    field: NormalizedCellField<T> | null,
    phase: EnginePhase
  ): NormalizedCellField<T> | null {
    if (!field) return null;
    if (phase === "PREDICTION" && !field.predictionSafe) return null;
    return field;
  }
}

export class TemporalFirewallError extends Error {
  constructor(message: string) {
    super(`[TemporalFirewall] ${message}`);
    this.name = "TemporalFirewallError";
  }
}

// ─────────────────────────────────────────────────────────────
// COVERAGE COMPUTATION
// ─────────────────────────────────────────────────────────────

/**
 * Compute the overall data status for a batch of enriched cells.
 * Used to set fixtureStatus = 'REAL_DATA' | 'MIXED' | 'DEMO_FIXTURE'.
 */
export function computeBatchCoverageStatus(cells: EnrichedCellData[]): {
  totalCells: number;
  realPopulationCells: number;
  realElevationCells: number;
  realCoveragePercent: number;
  overallStatus: "REAL_DATA" | "MIXED" | "DEMO_FIXTURE";
} {
  const total = cells.length;
  if (total === 0) return {
    totalCells: 0, realPopulationCells: 0, realElevationCells: 0,
    realCoveragePercent: 0, overallStatus: "DEMO_FIXTURE",
  };

  const realPop = cells.filter((c) => c.population.available).length;
  const realElev = cells.filter((c) => c.elevationM.available).length;
  const realCovPct = Math.round((Math.min(realPop, realElev) / total) * 100);

  const status =
    realCovPct >= 95
      ? "REAL_DATA"
      : realCovPct > 0
      ? "MIXED"
      : "DEMO_FIXTURE";

  return {
    totalCells: total,
    realPopulationCells: realPop,
    realElevationCells: realElev,
    realCoveragePercent: realCovPct,
    overallStatus: status,
  };
}
