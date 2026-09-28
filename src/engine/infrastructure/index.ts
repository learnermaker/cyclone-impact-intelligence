/**
 * Infrastructure Engine
 *
 * Responsibilities:
 *  1. Load infrastructure assets from fixture.
 *  2. Correlate each asset to its containing H3 cell using latLngToCell.
 *  3. Compute asset-level risk from the cell's processed hazard.
 *  4. Update each processed cell's infrastructure stats
 *     (assetCount, combinedCriticality, dependencyCentrality).
 *
 * Asset risk formula:
 *   risk = hazardExposure × vulnerability × criticality × dependencyCentrality
 *
 * IMPORTANT: risk here means MODELLED DISRUPTION RISK, not structural failure
 * probability. The infrastructure inventory may be incomplete.
 * UI wording: "Mapped assets in available datasets"
 *
 * Dependency centrality is a SPATIAL PROXY — not from OSRM or full routing.
 */

import { latLngToCell, gridDisk } from "h3-js";
import type { DataConfidence } from "../../lib/types/index";
import type { FixtureInfrastructure } from "../loader/index";
import type { ProcessedCell, ProcessedAsset } from "../types";
import {
  CRITICALITY_WEIGHTS,
  VULNERABILITY_DEFAULTS,
  SPATIAL_RESOLUTION,
} from "../../config/index";
import type { InfrastructureAssetType } from "../../lib/types/index";

// ─────────────────────────────────────────────────────────────
// ASSET RISK
// ─────────────────────────────────────────────────────────────

/**
 * Compute asset-level risk score.
 * All inputs must be in [0, 1].
 */
export function computeAssetRisk(
  hazardExposure: number,
  vulnerability: number,
  criticality: number,
  dependencyCentrality: number
): number {
  return round4(hazardExposure * vulnerability * criticality * dependencyCentrality);
}

/**
 * Estimate service population for an asset from neighboring cells.
 * Uses population sum within gridDisk(cellId, 1) — a 1-ring influence area.
 */
export function estimateServicePopulation(
  containingCellId: string,
  cells: Map<string, ProcessedCell>
): number {
  if (!containingCellId) return 0;
  try {
    const ring = gridDisk(containingCellId, 1);
    return ring.reduce((sum, cid) => {
      const cell = cells.get(cid);
      return sum + (cell?.exposure.population ?? 0);
    }, 0);
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// H3 CELL CORRELATION
// ─────────────────────────────────────────────────────────────

/**
 * Find the H3 cell containing an asset given its coordinates.
 * Returns null if latLngToCell throws (malformed coordinates).
 */
export function assetContainingCell(
  lat: number,
  lng: number
): string | null {
  try {
    return latLngToCell(lat, lng, SPATIAL_RESOLUTION);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN: CORRELATE AND COMPUTE
// ─────────────────────────────────────────────────────────────

/**
 * Process all infrastructure assets:
 *  1. Find containing H3 cell for each asset.
 *  2. Set exposure.hazard from that cell's hazard score.
 *  3. Estimate service population from surrounding cells.
 *  4. Compute risk = hazard × vulnerability × criticality × dependency.
 *  5. Update processed cells with infrastructure stats.
 *
 * Returns the array of ProcessedAssets (with computed risk and confidence).
 * Mutates processedCells in place to update infrastructure stats.
 */
export function correlateAndComputeInfrastructure(
  fixtureInfra: FixtureInfrastructure,
  processedCells: Map<string, ProcessedCell>,
  fixtureStatus: "DEMO_FIXTURE" | "REAL_DATA" | "MIXED"
): ProcessedAsset[] {
  // Group assets by containing cell for stat aggregation
  const assetsByCell = new Map<
    string,
    { criticality: number; dependencyCentrality: number }[]
  >();

  const processedAssets: ProcessedAsset[] = [];

  for (const raw of fixtureInfra.assets) {
    // Validate type
    const assetType = CRITICALITY_WEIGHTS[raw.type as InfrastructureAssetType] !== undefined
      ? (raw.type as InfrastructureAssetType)
      : ("other" as InfrastructureAssetType);

    // GeoJSON Point: coordinates are [lng, lat]
    const [lng, lat] = raw.geometry.coordinates;
    if (lng === undefined || lat === undefined) continue;

    const containingCellId = assetContainingCell(lat, lng);

    // Get hazard from the containing cell
    const cell = containingCellId ? processedCells.get(containingCellId) : undefined;
    const hazardExposure = cell?.hazard.combined ?? 0;

    // Service population from surrounding cells
    const servicePopulation = containingCellId
      ? estimateServicePopulation(containingCellId, processedCells)
      : 0;

    // Use fixture values if they override defaults
    const criticality = raw.criticality > 0
      ? raw.criticality
      : CRITICALITY_WEIGHTS[assetType];
    const vulnerability = raw.vulnerability > 0
      ? raw.vulnerability
      : VULNERABILITY_DEFAULTS[assetType];
    const dependencyCentrality = raw.dependencyCentrality > 0
      ? raw.dependencyCentrality
      : DEFAULT_DEPENDENCY[assetType];

    const risk = computeAssetRisk(
      hazardExposure,
      vulnerability,
      criticality,
      dependencyCentrality
    );

    const confidence = buildAssetConfidence(fixtureStatus, hazardExposure > 0);

    const processedAsset: ProcessedAsset = {
      assetId: raw.assetId,
      name: raw.name,
      type: assetType,
      coordinates: [lng, lat],
      criticality,
      vulnerability,
      exposure: {
        hazard: round4(hazardExposure),
        population: servicePopulation,
      },
      dependencyCentrality,
      risk,
      confidence,
      containingCellId,
      provenance: raw.provenance ?? {},
    };

    processedAssets.push(processedAsset);

    // Accumulate cell stats
    if (containingCellId) {
      const existing = assetsByCell.get(containingCellId) ?? [];
      existing.push({ criticality, dependencyCentrality });
      assetsByCell.set(containingCellId, existing);
    }
  }

  // Update processed cells with infrastructure stats
  for (const [cellId, assetList] of assetsByCell) {
    const cell = processedCells.get(cellId);
    if (!cell) continue;

    const avgCriticality = round4(
      assetList.reduce((s, a) => s + a.criticality, 0) / assetList.length
    );
    const avgDependency = round4(
      assetList.reduce((s, a) => s + a.dependencyCentrality, 0) / assetList.length
    );

    cell.infrastructure.assetCount = assetList.length;
    cell.infrastructure.combinedCriticality = avgCriticality;
    cell.infrastructure.dependencyCentrality = avgDependency;
    cell.exposure.criticalAssetCount = assetList.length;

    // Recompute exposure.combined with updated criticalAssetCount
    const critN = Math.min(1, assetList.length / 5);
    const oldCombined = cell.exposure.combined;
    // Adjust: remove old critInfra contribution and add new
    const CRIT_WEIGHT = 0.25; // EXPOSURE_WEIGHTS.criticalInfrastructure
    cell.exposure.combined = round4(
      Math.min(1, oldCombined - CRIT_WEIGHT * 0 + CRIT_WEIGHT * critN)
    );
  }

  return processedAssets;
}

// ─────────────────────────────────────────────────────────────
// CONFIDENCE FOR ASSETS
// ─────────────────────────────────────────────────────────────

function buildAssetConfidence(
  fixtureStatus: string,
  hasHazardData: boolean
): DataConfidence {
  const isDemoFixture = fixtureStatus === "DEMO_FIXTURE";
  const infraConf = isDemoFixture ? 0.55 : 0.72;
  const hazardConf = hasHazardData ? (isDemoFixture ? 0.62 : 0.85) : 0;
  const overall = round4((infraConf + hazardConf) / 2);

  return {
    overall,
    components: {
      infrastructure: infraConf,
      hazard: hazardConf,
    },
    limitingTier: isDemoFixture ? "DEMO_FIXTURE" : "MODEL_DERIVED",
    notes: isDemoFixture
      ? ["Asset location approximate; risk computed from synthetic fixture hazard"]
      : undefined,
  };
}

// ─────────────────────────────────────────────────────────────
// DEFAULT DEPENDENCY CENTRALITY (per asset type)
// Higher = more other critical assets / population depend on this asset
// ─────────────────────────────────────────────────────────────

const DEFAULT_DEPENDENCY: Record<InfrastructureAssetType, number> = {
  hospital: 0.90,
  emergency_service: 0.87,
  shelter: 0.70,
  bridge: 0.95,  // Bridges create access chokepoints — very high
  power: 0.85,
  water: 0.80,
  arterial_road: 0.75,
  school: 0.50,
  other: 0.40,
};

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
