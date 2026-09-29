/**
 * Internal engine types
 *
 * These types flow through the engine pipeline.
 * They deliberately omit geometry (heavy GeoJSON) — geometry is re-attached
 * only in API routes when the client needs it for map rendering.
 *
 * Pipeline:
 *   FixtureCell
 *     → ProcessedHazard  (hazard engine)
 *     → ProcessedCell    (impact engine — adds impactExposure, infrastructure, priority)
 *     → PriorityRecommendation[]  (priority optimizer)
 *     → EngineRunResult  (runner — returned to API routes)
 */

import type {
  DataConfidence,
  PriorityObjective,
  PriorityRecommendation,
  SourceTier,
  ReplayManifest,
} from "../lib/types/index";
import type { SurgeModelMethod } from "../lib/types/index";
import type { InfrastructureAssetType } from "../lib/types/index";

// ─────────────────────────────────────────────────────────────
// PROCESSED HAZARD
// ─────────────────────────────────────────────────────────────

export type ProcessedHazard = {
  wind: number;      // [0,1] — may be modified by scenario multiplier
  rainfall: number;  // [0,1] — may be modified by scenario multiplier
  surge: number;     // [0,1] — may be modified by surge model
  combined: number;  // 0.40*wind + 0.30*rain + 0.30*surge (invariant)
  surgeExposed: boolean;
  /** Which surge model was used for this cell's surgeExposed determination */
  surgeMethod: SurgeModelMethod;
  /**
   * If surgeMethod = 'proximity_threshold', show this label on all
   * UI elements that display surge exposure for this cell.
   * Required by the locked guardrail.
   */
  surgeLabel?: "SCREENING APPROXIMATION — configurable proximity threshold, not a validated Fani surge boundary";
};

// ─────────────────────────────────────────────────────────────
// PROCESSED CELL (engine-internal, no geometry)
// ─────────────────────────────────────────────────────────────

export type ProcessedCell = {
  cellId: string;
  isLand: boolean;
  centerLng: number;
  centerLat: number;

  hazard: ProcessedHazard;

  exposure: {
    population: number;
    buildings: number;
    builtAreaHa: number;
    roadKm: number;
    /** Updated by infrastructure engine to count assets in this cell */
    criticalAssetCount: number;
    combined: number; // weighted sum, [0,1]
  };

  susceptibility: {
    floodSusceptibility: number;
    windExposure: number;
    coastalProximityKm: number;
    elevationMedianM: number;
    surgeExposed: boolean;
  };

  impactExposure: {
    score: number;
    probability: number;
    severity: number;
    confidence: DataConfidence;
  };

  infrastructure: {
    assetCount: number;
    combinedCriticality: number;
    dependencyCentrality: number;
  };

  priority: {
    score: number;
    rank: number | null;
    interventionBenefit: number;
  };
};

// ─────────────────────────────────────────────────────────────
// PROCESSED ASSET
// ─────────────────────────────────────────────────────────────

export type ProcessedAsset = {
  assetId: string;
  name?: string;
  type: InfrastructureAssetType;
  /** GeoJSON Point geometry [lng, lat] */
  coordinates: [number, number];
  criticality: number;
  vulnerability: number;
  exposure: {
    /** Hazard score from the containing H3 cell */
    hazard: number;
    /** Population from surrounding cells */
    population: number;
  };
  dependencyCentrality: number;
  /** hazardExposure × vulnerability × criticality × dependencyCentrality */
  risk: number;
  confidence: DataConfidence;
  /** H3 cell that contains this asset at SPATIAL_RESOLUTION */
  containingCellId: string | null;
  provenance: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────
// ENGINE RUN RESULT
// ─────────────────────────────────────────────────────────────

export type EngineStats = {
  totalCells: number;
  landCells: number;
  surgeExposedCells: number;
  highHazardCells: number;      // combined > 0.5
  totalPopulationExposed: number;
  peakHazard: number;
  peakImpact: number;
  topKSelected: number;
};

/** GEE enrichment coverage statistics */
export type EnrichmentStats = {
  /** Active data profile ID */
  profileId: string;
  totalLandCells: number;
  realPopulationCells: number;    // cells with WorldPop 2019 real value
  realElevationCells: number;     // cells with NASADEM real value
  realCoveragePercent: number;    // min(pop,elev) coverage / total
  overallStatus: "REAL_DATA" | "MIXED" | "DEMO_FIXTURE";
  activeGEESources: string[];     // DataSourceId[]
};

export type EngineRunResult = {
  scenario: {
    eventId: string;
    tier: SourceTier;
    displayLabel: string;
    windKph: number;
    rainfall24hMm: number;
    surgeM: number;
    surgeMethod: SurgeModelMethod;
  };
  manifest: ReplayManifest;
  /**
   * All processed land cells — Map for O(1) lookup by cellId.
   * API routes MUST filter this before returning to the client.
   * Never expose the full Map to a browser response.
   */
  cells: Map<string, ProcessedCell>;
  assets: ProcessedAsset[];
  recommendations: PriorityRecommendation[];
  stats: EngineStats;
  fixtureStatus: "DEMO_FIXTURE" | "REAL_DATA" | "MIXED";
  /** Active data profile used for this run */
  dataProfileId: string;
  /** GEE enrichment coverage statistics */
  enrichmentStats: EnrichmentStats;
  computedAt: string;
};

// ─────────────────────────────────────────────────────────────
// SCENARIO OPTIONS (engine runner input)
// ─────────────────────────────────────────────────────────────

export type EngineRunOptions = {
  /** Wind multiplier (default 1.0) */
  windMultiplier?: number;
  /** Rainfall multiplier (default 1.0) */
  rainfallMultiplier?: number;
  /** Scenario surge height in metres (default from fixture hazard scenario) */
  surgeHeightM?: number;
  /** Response capacity K (default from config) */
  responseCapacity?: number;
  /** Priority objective (default "balanced") */
  objective?: PriorityObjective;
  /** Surge model method (default "flood_fill") */
  surgeMethod?: SurgeModelMethod;
  /**
   * Data profile to use. Defaults to auto-detected active profile.
   * "DEMO" → synthetic fixture only
   * "GEE_ENRICHED" → real WorldPop + NASADEM where available, fixture fallback
   * "REPLAY" → same as GEE_ENRICHED with strict temporal firewall
   * "LIVE" → GEE_ENRICHED + live adapters
   */
  dataProfile?: string;
};
