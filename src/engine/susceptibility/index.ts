/**
 * Susceptibility Engine
 *
 * Susceptibility is conceptually SEPARATE from hazard and from vulnerability.
 *
 *   HAZARD        = how intense the physical forcing is (wind, rain, surge magnitude)
 *   SUSCEPTIBILITY = how exposed a location's terrain/position makes it to that forcing
 *   VULNERABILITY  = structural/operational fragility of specific assets (in infrastructure module)
 *
 * Susceptibility is a LOCATION property, not an asset property.
 *
 * Components computed here:
 *   floodSusceptibility — elevation-based: lower elevation → more susceptible to flooding
 *                         elevation contributes here SPECIFICALLY to flood susceptibility,
 *                         NOT as a generic "vulnerability" score.
 *   windExposure        — terrain-based: closer to coast / less sheltered → higher wind exposure
 *   surgeExposed        — updated by hazard engine (flood-fill or proximity)
 *
 * The fixture pre-computes approximate values for these. This module
 * can recompute them from raw elevation + coastal proximity if needed.
 */

import type { FixtureCell } from "../loader/index";
import type { ProcessedCell } from "../types";

export type SusceptibilityResult = {
  floodSusceptibility: number;  // [0, 1]
  windExposure: number;         // [0, 1]
  coastalProximityKm: number;   // raw km
  elevationMedianM: number;     // raw metres
  surgeExposed: boolean;        // updated by hazard engine
};

// ─────────────────────────────────────────────────────────────
// INDIVIDUAL SUSCEPTIBILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Flood susceptibility from elevation.
 *
 * IMPORTANT: This is NOT a generic vulnerability score.
 * Elevation is one terrain factor for flood susceptibility.
 * A hospital at 2m is not "twice as vulnerable" as one at 4m —
 * that determination belongs to the infrastructure module.
 *
 * Simple linear model with 22m ceiling.
 * Configurable ceiling allows sensitivity testing.
 */
export function computeFloodSusceptibility(
  elevationM: number,
  ceilingM = 22
): number {
  if (elevationM <= 0) return 1.0;   // at/below sea level: fully susceptible
  if (elevationM <= 0.5) return 0.98;
  return Math.max(0, round4(1 - Math.min(1, elevationM / ceilingM)));
}

/**
 * Wind exposure from coastal proximity (terrain roughness proxy).
 *
 * Coastal cells experience less terrain attenuation.
 * Further inland = more sheltering from terrain roughness.
 * 80 km scale: at 80 km inland, exposure ≈ 0 (fully sheltered).
 */
export function computeWindExposure(coastalProximityKm: number): number {
  return round4(Math.max(0, 1 - Math.min(1, coastalProximityKm / 80)));
}

/**
 * Combined susceptibility score used in impact formula.
 *
 * For surge-exposed cells:
 *   susceptibilityScore = floodSusceptibility (flood is the dominant mechanism)
 *
 * For non-surge cells:
 *   susceptibilityScore = 0.6 * floodSusceptibility + 0.4 * windExposure
 *   (wind and rainfall flooding still relevant)
 *
 * Minimum floor of 0.2 for inland land cells — even far-inland cells are
 * exposed to wind and rainfall in a severe cyclone.
 */
export function combinedSusceptibilityScore(
  floodSusceptibility: number,
  windExposure: number,
  surgeExposed: boolean
): number {
  if (surgeExposed) {
    return floodSusceptibility;
  }
  const combined = 0.6 * floodSusceptibility + 0.4 * windExposure;
  return round4(Math.max(0.2, combined));
}

// ─────────────────────────────────────────────────────────────
// EXTRACT FROM FIXTURE CELL
// ─────────────────────────────────────────────────────────────

/**
 * Extract susceptibility from a fixture cell's pre-computed values.
 * The surgeExposed flag is overridden by the hazard engine result.
 */
export function getSusceptibilityFromFixture(
  cell: FixtureCell,
  surgeExposedOverride: boolean
): SusceptibilityResult {
  const s = cell.properties.susceptibility;
  return {
    floodSusceptibility: s.floodSusceptibility,
    windExposure: s.windExposure,
    coastalProximityKm: s.coastalProximityKm,
    elevationMedianM: s.elevationMedianM,
    surgeExposed: surgeExposedOverride,
  };
}

/**
 * Recompute susceptibility from raw elevation and coastal proximity.
 * Used when scenario changes require recalculating susceptibility
 * (e.g., different surge height changes surgeExposed status).
 */
export function recomputeSusceptibility(
  elevationMedianM: number,
  coastalProximityKm: number,
  surgeExposed: boolean
): SusceptibilityResult {
  return {
    floodSusceptibility: computeFloodSusceptibility(elevationMedianM),
    windExposure: computeWindExposure(coastalProximityKm),
    coastalProximityKm,
    elevationMedianM,
    surgeExposed,
  };
}

/**
 * Apply susceptibility to a processed cell's susceptibility field.
 * Used by the engine runner to update the cell after hazard computation.
 */
export function applySusceptibilityToCell(
  cell: ProcessedCell,
  surgeExposed: boolean
): void {
  // Update surgeExposed from the hazard engine result
  cell.susceptibility.surgeExposed = surgeExposed;
  // Recalculate flood susceptibility (unchanged unless elevation changes)
  cell.susceptibility.floodSusceptibility = computeFloodSusceptibility(
    cell.susceptibility.elevationMedianM
  );
  cell.susceptibility.windExposure = computeWindExposure(
    cell.susceptibility.coastalProximityKm
  );
}

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
