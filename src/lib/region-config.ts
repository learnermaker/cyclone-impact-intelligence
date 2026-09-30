/**
 * region-config.ts — India-first, BRICS-portable region configuration.
 *
 * PURPOSE
 * -------
 * The analytical engine is parameterised against a single region at a time.
 * All geography-specific settings live here so the pipeline and engine can be
 * pointed at a different coastal corridor without modifying core algorithms.
 *
 * CURRENT STATE
 * -------------
 * Only the Odisha / Fani 2019 region is fully demonstrated. The `RegionConfig`
 * type documents all the fields a new region would need to supply. Extending
 * to another Indian coastal context (e.g. Andhra, Tamil Nadu, Gujarat) or to
 * another BRICS context (e.g. Mozambique Channel / Bangladesh Bay) would require:
 *   1. GEE preprocessing scripts (WorldPop, NASADEM, GPM, SAR) for the new bbox.
 *   2. An OSM-derived infrastructure JSON for the new region.
 *   3. A new fixture generator using regional cyclone track parameters.
 *   4. Region-specific policy weights (inheriting the defaults is fine to start).
 *
 * USAGE
 * -----
 * Import `ACTIVE_REGION` wherever geography-specific constants are needed.
 * The active region drives AOI bbox, display labels, initial map view, and policy
 * parameter defaults. It does NOT drive hazard/exposure formulas, which remain
 * generic.
 */

import { AOI_BBOX, RESPONSE_CAPACITY, HAZARD_WEIGHTS, EXPOSURE_WEIGHTS, SURGE_MODEL } from "@/config/index";

// ── Type ─────────────────────────────────────────────────────

/**
 * Complete description of a deployable region.
 *
 * All fields are required to ensure that deploying the engine to a new
 * geography produces a well-labelled, auditable configuration rather than
 * silently inheriting stale Odisha values.
 */
export type RegionConfig = {
  /** Short machine-readable identifier, e.g. "odisha-india" */
  id: string;

  /** Display name for UI and docs */
  label: string;

  /** Country / broader geography context */
  country: string;

  /** AOI bounding box [minLng, minLat, maxLng, maxLat] in WGS-84 */
  aoiBbox: readonly [number, number, number, number];

  /** Default map centre [lng, lat] */
  mapCenter: readonly [number, number];

  /** Default map zoom level */
  mapZoom: number;

  /** H3 spatial resolution (7 = ~5.2 km², 8 = ~0.74 km²) */
  h3Resolution: 7 | 8;

  /** Primary cyclone name / year used for demo replay */
  demoCyclone: string;

  /** Prediction cutoff (ISO-8601) */
  predictionCutoffAt: string;

  /** Landfall coordinates */
  landfallLatLng: readonly [number, number];

  /**
   * Policy weights for hazard combination.
   * Must sum to 1.0.
   */
  hazardWeights: {
    wind: number;
    rainfall: number;
    surge: number;
  };

  /**
   * Policy weights for exposure combination.
   * Must sum to 1.0.
   */
  exposureWeights: {
    population: number;
    buildings: number;
    roads: number;
    criticalInfrastructure: number;
  };

  /**
   * Default response capacity (K) for this region's emergency context.
   */
  defaultResponseCapacity: number;

  /** Surge model method preferred for this region */
  surgeMethod: "flood_fill" | "proximity_threshold";

  /**
   * Data source provenance for this region.
   * Used in documentation and provenance metadata.
   */
  dataSources: {
    population: string;
    terrain: string;
    rainfall: string;
    observedFlood: string;
    infrastructure: string;
    landWaterMask: string;
  };

  /**
   * Notes about limitations specific to this region.
   * Shown in provenance/docs — not used at runtime.
   */
  limitations: string[];
};

// ── Active region ─────────────────────────────────────────────

/**
 * Odisha coastal corridor — Fani 2019 demo region.
 *
 * India-first. This is the only fully demonstrated region.
 * Other regions can be added following this template.
 */
export const ODISHA_REGION: RegionConfig = {
  id:    "odisha-india",
  label: "Odisha coastal corridor, India",
  country: "India",

  aoiBbox:   AOI_BBOX,
  mapCenter: [85.65, 20.0],
  mapZoom:   7.5,
  h3Resolution: 8,

  demoCyclone:        "Cyclone Fani 2019",
  predictionCutoffAt: "2019-05-02T05:00:00Z",
  landfallLatLng:     [19.8, 85.83],

  hazardWeights:  HAZARD_WEIGHTS,
  exposureWeights: EXPOSURE_WEIGHTS,

  defaultResponseCapacity: RESPONSE_CAPACITY.default,
  surgeMethod: SURGE_MODEL.preferredMethod,

  dataSources: {
    population:     "WorldPop 2019 (WorldPop/GP/100m/pop) — GEE-executed",
    terrain:        "NASADEM (NASA/NASADEM_HGT/001) — GEE-executed",
    rainfall:       "GPM IMERG (NASA/GPM_L3/IMERG_V07) — reveal-only",
    observedFlood:  "Sentinel-1 GRD (COPERNICUS/S1_GRD) — reveal-only inundation proxy",
    infrastructure: "OpenStreetMap Jan 2019 curated subset (ODbL 1.0) — 15 assets, incomplete",
    landWaterMask:  "DEMO_HEURISTIC_PIECEWISE_V2 — piecewise coastline + Chilika ellipse. " +
                    "JRC GSW v1.4 is the recommended long-term replacement.",
  },

  limitations: [
    "Land/water mask is a heuristic piecewise coastline, not JRC GSW (long-term fix pending GEE pipeline).",
    "Infrastructure inventory has 15 curated assets — incomplete relative to the full AOI.",
    "Building and road exposure use synthetic DEMO_FIXTURE counts (Open Buildings not integrated).",
    "Surge is a flood-fill screening approximation, not a hydrodynamic model.",
    "GEE WorldPop/NASADEM coverage is ~30% of AOI land cells; remainder uses synthetic fallback.",
  ],
};

/**
 * The region currently active in the running application.
 *
 * To deploy to a different region:
 *   1. Create a new `RegionConfig` constant following the ODISHA_REGION template.
 *   2. Point `ACTIVE_REGION` to the new constant.
 *   3. Run the GEE preprocessing scripts for the new AOI.
 *   4. Regenerate the H3 fixture.
 */
export const ACTIVE_REGION: RegionConfig = ODISHA_REGION;
