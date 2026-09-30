/**
 * Cyclone Impact Intelligence — Engine Configuration
 *
 * This file is the single source of truth for all policy parameters,
 * weights, thresholds, and AOI bounds used by the engine.
 *
 * IMPORTANT LABELLING RULES (from architecture doc):
 *  - Every weight here is a POLICY PARAMETER, not a scientific constant.
 *    Do not imply these were learned from data or derived from literature.
 *  - Surge screening is a SCREENING APPROXIMATION, not an operational forecast.
 *  - Criticality weights are POLICY DEFAULTS, not engineering assessments.
 *  - Vulnerability defaults are APPROXIMATIONS for decision support.
 *
 * Updating any value in HAZARD_WEIGHTS, EXPOSURE_WEIGHTS, CRITICALITY_WEIGHTS,
 * or VULNERABILITY_DEFAULTS increments PARAMETERS_VERSION.
 *
 * The PARAMETERS_VERSION flows into every ReplayManifest so judges and
 * reviewers know exactly which parameter set produced a given result.
 */

import type { InfrastructureAssetType } from "@/lib/types/index";

// ─────────────────────────────────────────────────────────────
// VERSIONING
// ─────────────────────────────────────────────────────────────

/** Semantic version of the engine code */
export const ENGINE_VERSION = "0.1.0";

/**
 * Semantic version of the parameter set.
 * Increment when any weight or threshold changes so ReplayManifests
 * remain reproducible and auditable.
 *
 * History:
 *   0.1.0 — initial values (2026-09-28)
 */
export const PARAMETERS_VERSION = "0.1.0";

/** Semantic version of bundled data assets */
export const DATA_VERSION = "0.1.0-demo-fixture";

// ─────────────────────────────────────────────────────────────
// SPATIAL CONFIGURATION
// ─────────────────────────────────────────────────────────────

/**
 * H3 spatial resolution for impact cells.
 *
 * Resolution 8 ≈ 0.74 km² per cell.
 * If browser performance suffers, reduce to 7 (≈ 5.2 km²) without
 * changing any other engine code — all H3 operations read this constant.
 *
 * See: https://h3geo.org/docs/core-library/restable/
 */
export const SPATIAL_RESOLUTION = 8 as const;

/**
 * Area of interest: Odisha coastal corridor, India.
 * Primary focus: Puri, Khurda, Ganjam, Jagatsinghpur districts.
 * Landfall reference point for Fani 2019: near Puri (~19.80°N, 85.83°E).
 *
 * [minLng, minLat, maxLng, maxLat]
 */
export const AOI_BBOX = [83.5, 17.5, 87.5, 22.0] as const;

/** AOI label used in provenance metadata */
export const AOI_LABEL = "Odisha coastal corridor, India";

// ─────────────────────────────────────────────────────────────
// HAZARD WEIGHTS
//
// Combined hazard: H = w_wind*Hwind + w_rain*Hrain + w_surge*Hsurge
// All inputs normalized to [0, 1] before combination.
// Weights must sum to 1.0.
// ─────────────────────────────────────────────────────────────

export const HAZARD_WEIGHTS = {
  wind: 0.40,
  rainfall: 0.30,
  surge: 0.30,
} as const;

/** Compile-time check: hazard weights must sum to 1.0 */
const _hazardWeightSum =
  HAZARD_WEIGHTS.wind + HAZARD_WEIGHTS.rainfall + HAZARD_WEIGHTS.surge;
if (Math.abs(_hazardWeightSum - 1.0) > 0.001) {
  throw new Error(
    `HAZARD_WEIGHTS must sum to 1.0, got ${_hazardWeightSum}`
  );
}

// ─────────────────────────────────────────────────────────────
// EXPOSURE WEIGHTS
//
// Combined exposure: E = w_pop*Epop + w_bld*Ebld + w_road*Eroad + w_crit*Ecrit
// All inputs normalized to [0, 1] before combination.
// Weights must sum to 1.0.
// ─────────────────────────────────────────────────────────────

export const EXPOSURE_WEIGHTS = {
  population: 0.35,
  buildings: 0.25,
  roads: 0.15,
  criticalInfrastructure: 0.25,
} as const;

const _exposureWeightSum =
  EXPOSURE_WEIGHTS.population +
  EXPOSURE_WEIGHTS.buildings +
  EXPOSURE_WEIGHTS.roads +
  EXPOSURE_WEIGHTS.criticalInfrastructure;
if (Math.abs(_exposureWeightSum - 1.0) > 0.001) {
  throw new Error(
    `EXPOSURE_WEIGHTS must sum to 1.0, got ${_exposureWeightSum}`
  );
}

// ─────────────────────────────────────────────────────────────
// INFRASTRUCTURE CRITICALITY
//
// Default policy weights by asset type.
// These are NOT engineering assessments or learned values.
// They represent a policy judgement about relative importance
// in a disaster-response context.
// ─────────────────────────────────────────────────────────────

export const CRITICALITY_WEIGHTS: Record<InfrastructureAssetType, number> = {
  hospital: 1.0,
  emergency_service: 0.95,
  shelter: 0.9,
  bridge: 0.85,
  power: 0.85,
  water: 0.85,
  arterial_road: 0.8,
  school: 0.6,
  other: 0.4,
} as const;

// ─────────────────────────────────────────────────────────────
// VULNERABILITY DEFAULTS
//
// Default structural/operational vulnerability by asset type [0, 1].
// Reflects construction quality, redundancy, and resilience.
//
// IMPORTANT: these are APPROXIMATIONS for MVP decision support.
// They are not derived from structural engineering assessments.
// Real deployments should replace these with site-specific data.
// ─────────────────────────────────────────────────────────────

export const VULNERABILITY_DEFAULTS: Record<InfrastructureAssetType, number> = {
  hospital: 0.55,       // Often concrete, but critical load / generator risk
  emergency_service: 0.50,
  shelter: 0.65,        // Variable construction quality
  bridge: 0.60,         // Flood/surge scour risk
  power: 0.70,          // Exposed equipment, transformer vulnerability
  water: 0.65,          // Pump stations / intake vulnerability
  arterial_road: 0.50,  // Road surface damage / flooding
  school: 0.60,         // Variable construction quality
  other: 0.60,
} as const;

// ─────────────────────────────────────────────────────────────
// PRIORITY OPTIMIZER
// ─────────────────────────────────────────────────────────────

/**
 * Benefit function weights for priority scoring:
 *   Benefit = w_ie * impactExposure + w_crit * criticality + w_dep * dependency
 *
 * impactExposure already encodes hazard × exposure × susceptibility.
 */
export const PRIORITY_BENEFIT_WEIGHTS = {
  impactExposure: 0.50,
  criticality: 0.30,
  dependency: 0.20,
} as const;

const _priorityWeightSum =
  PRIORITY_BENEFIT_WEIGHTS.impactExposure +
  PRIORITY_BENEFIT_WEIGHTS.criticality +
  PRIORITY_BENEFIT_WEIGHTS.dependency;
if (Math.abs(_priorityWeightSum - 1.0) > 0.001) {
  throw new Error(
    `PRIORITY_BENEFIT_WEIGHTS must sum to 1.0, got ${_priorityWeightSum}`
  );
}

/** Default and bounds for response capacity (number of intervention teams/assets) */
export const RESPONSE_CAPACITY = {
  default: 10,
  min: 1,
  max: 200,
} as const;

// ─────────────────────────────────────────────────────────────
// SURGE MODEL
//
// Two methods are supported.
//
// PRIMARY — flood_fill:
//   Cells are surge-exposed if their elevation ≤ surge height AND
//   they are connected to coastal/tidal water via a flood-fill
//   traversal constrained by the elevation threshold.
//   This is the preferred method when elevation + coast geometry is available.
//
// FALLBACK — proximity_threshold:
//   Cells are surge-exposed if elevation ≤ surge height AND
//   distance to coast ≤ SURGE_PROXIMITY_THRESHOLD_KM.
//   THIS IS A SCREENING APPROXIMATION — not scientifically derived.
//   The threshold must be configurable and clearly labelled as such.
//   It is not an assertion about real hydrodynamic flood extent.
//
// Do NOT claim either method is an operational hydrodynamic surge forecast.
// ─────────────────────────────────────────────────────────────

export const SURGE_MODEL = {
  /** Preferred method — use flood_fill when coast geometry is available */
  preferredMethod: "flood_fill" as const,
  /** Fallback method when flood_fill inputs are unavailable */
  fallbackMethod: "proximity_threshold" as const,

  /**
   * Distance threshold for proximity fallback (km).
   *
   * SCREENING APPROXIMATION — this value is configurable and must be
   * labelled as such in all UI and documentation. It is not scientifically derived.
   * Adjust based on the coastal topography of the AOI if needed.
   */
  proximityThresholdKm: 25,

  /** Scenario surge levels shown in the UI slider (metres) */
  scenarioLevelsM: [1.0, 1.5, 2.0, 2.5] as const,

  /** Default scenario surge when no official product is available */
  defaultScenarioSurgeM: 1.5,
} as const;

// ─────────────────────────────────────────────────────────────
// NORMALIZATION BOUNDS
//
// Used to normalize raw values to [0, 1] for the engine.
// Defined per-variable to keep normalization transparent.
// ─────────────────────────────────────────────────────────────

export const NORMALIZATION_BOUNDS = {
  /** Wind: normalize against Category 5 upper bound (250 km/h) */
  windKph: { min: 0, max: 250 },

  /** Rainfall 24h: normalize against extreme event threshold (300 mm) */
  rainfall24hMm: { min: 0, max: 300 },

  /** Surge: normalize against max scenario level */
  surgeM: { min: 0, max: 5.0 },

  /** Population per cell: normalize against high-density urban estimate */
  population: { min: 0, max: 50_000 },

  /** Buildings per cell */
  buildings: { min: 0, max: 5_000 },

  /** Road km per cell */
  roadKm: { min: 0, max: 20 },
} as const;

// ─────────────────────────────────────────────────────────────
// ADVISORY SEVERITY THRESHOLDS
//
// Impact exposure score thresholds that drive default advisory severity.
// These are policy defaults — operators can override.
// ─────────────────────────────────────────────────────────────

export const ADVISORY_SEVERITY_THRESHOLDS = {
  CRITICAL: 0.75,
  HIGH: 0.50,
  MEDIUM: 0.25,
  LOW: 0.0,
} as const;

// ─────────────────────────────────────────────────────────────
// DEMO / BAY OF BENGAL SCENARIO
//
// A preset generic scenario for the LIVE mode "Load Demo Scenario" button.
// Must NOT be labelled as Cyclone Fani.
// Must be labelled "DEMO SCENARIO — SIMULATED ONLY".
// Uses Fani-like parameter ranges to demonstrate the engine.
// ─────────────────────────────────────────────────────────────

export const DEMO_SCENARIO_PRESET = {
  eventId: "demo-bay-of-bengal-scenario",
  name: "Bay of Bengal Category 4 (Demo)",
  displayLabel: "DEMO SCENARIO — SIMULATED ONLY" as const,
  tier: "DEMO_FIXTURE" as const,
  cyclone: {
    latitude: 13.5,          // Bay of Bengal pre-landfall position
    longitude: 86.5,
    maxWindKph: 220,
    pressureHpa: 950,
    movementKph: 22,
    movementDirectionDeg: 345, // NNW toward Odisha coast
    category: "VSCS",          // Very Severe Cyclonic Storm
  },
  rainfall: {
    forecast24hMm: 200,
    forecast48hMm: 280,
  },
  surge: {
    heightM: SURGE_MODEL.defaultScenarioSurgeM,
    source: "scenario" as const,
  },
  responseCapacity: RESPONSE_CAPACITY.default,
} as const;

// ─────────────────────────────────────────────────────────────
// SCENARIO SLIDER BOUNDS
// ─────────────────────────────────────────────────────────────

export const SCENARIO_BOUNDS = {
  windMultiplier: { min: 0.5, max: 2.0, step: 0.1 },
  rainfallMultiplier: { min: 0.5, max: 2.0, step: 0.1 },
  surgeHeightM: { min: 0.5, max: 4.0, step: 0.5 },
  trackShiftKm: { min: -100, max: 100, step: 10 },
} as const;

// ─────────────────────────────────────────────────────────────
// ILLUSTRATIVE INSURANCE POLICY — FANI DEMO
//
// A synthetic policy for illustration purposes only.
// No real contract. No real payout.
// Parameters loosely calibrated to Fani's documented event values.
// ─────────────────────────────────────────────────────────────

export const DEMO_INSURANCE_POLICY = {
  policyId: "demo-policy-odisha-cyclone-2019",
  region: AOI_LABEL,
  label: "ILLUSTRATIVE POLICY" as const,
  thresholds: {
    windMs: 44.7,           // ~161 km/h — VSCS sustained wind threshold
    rain24hMm: 200,         // Heavy rainfall threshold
    surgeM: 1.5,            // Moderate surge threshold
  },
  payout: 10_000_000,       // Indicative INR 1 crore — illustrative only
  description:
    "Synthetic parametric trigger policy for demonstration. " +
    "Not a real contract. Values are illustrative only.",
} as const;

// ─────────────────────────────────────────────────────────────
// FANI REPLAY — KNOWN PARAMETERS
//
// Well-documented public parameters for Cyclone Fani 2019.
// These come from IMD RSMC post-event reports and published literature.
// Used to construct the Fani demo fixture.
// Source: https://rsmcnewdelhi.imd.gov.in/archive-report.php
// ─────────────────────────────────────────────────────────────

export const FANI_KNOWN_PARAMETERS = {
  eventId: "fani-2019",
  name: "Cyclone Fani",
  year: 2019,

  /**
   * Prediction cutoff for T−24h replay.
   * Landfall was ~0500 UTC 3 May 2019 near Puri.
   * T−24h = 0500 UTC 2 May 2019.
   */
  predictionCutoffAt: "2019-05-02T05:00:00Z",

  /** Approximate landfall coordinates */
  landfallLatitude: 19.8,
  landfallLongitude: 85.83,
  landfallLocation: "Near Puri, Odisha",

  /** Peak intensity (documented in IMD report) */
  peakWindKph: 250,
  peakWindMs: 69.4,
  minPressureHpa: 932,

  /** Intensity at T−24h (approximate, from IMD track data) */
  windKphAt_T24h: 220,
  pressureHpaAt_T24h: 944,

  /** Documented 48h rainfall accumulation over coastal Odisha */
  rainfall48hMm: 280,

  /** Documented surge height from IMD/INCOIS reports (approximate) */
  surgeHeightM: 3.5,

  /** Most affected districts */
  affectedDistricts: [
    "Puri",
    "Khurda",
    "Ganjam",
    "Jagatsinghpur",
    "Kendrapara",
  ],
} as const;

// ─────────────────────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────────────────────

export const MAP_CONFIG = {
  /** OpenFreeMap public instance — no key required */
  defaultStyleUrl: "https://tiles.openfreemap.org/styles/liberty",

  /** Initial map view: Odisha coast */
  initialViewState: {
    longitude: 85.83,
    latitude: 19.8,
    zoom: 7,
  },

  /** Bounding box for initial fit — covers entire Odisha AOI */
  initialBounds: AOI_BBOX,

  /** Layer paint properties — centralized for consistency */
  layerColors: {
    wind: "#f97316",          // orange
    rainfall: "#3b82f6",      // blue
    surge: "#06b6d4",         // cyan
    combinedHazard: "#ef4444", // red
    population: "#8b5cf6",    // purple
    priority: "#dc2626",      // dark red
    actualImpact: "#1e40af",  // dark blue
  },
} as const;

// ─────────────────────────────────────────────────────────────
// GEMINI
// ─────────────────────────────────────────────────────────────

export const GEMINI_CONFIG = {
  /**
   * Model ID — must match a stable model in the Gemini API.
   * Verified stable with function calling: gemini-3.8-flash (September 2026)
   * Override via GEMINI_MODEL env var.
   *
   * NOTE: gemini-3.1-flash-lite does NOT support function calling in the standard
   * configuration — use gemini-3.8-flash or newer for full tool/function support.
   */
  defaultModel: "gemini-3.8-flash",

  /** Max tokens for advisory generation responses */
  maxOutputTokens: 1024,

  /** Timeout before falling back to deterministic explanation (ms).
   *  gemini-3.8-flash with function calling requires ~15-25s;
   *  gemini-3.1-flash-lite text-only requires ~5-10s.
   */
  timeoutMs: 30_000,

  /** System prompt role */
  systemPromptRole: "You are an operational disaster-risk analyst assistant." as const,
} as const;

// ─────────────────────────────────────────────────────────────
// EXPORT: configuration snapshot for ReplayManifest
//
// Returns a serializable snapshot of the active parameter set.
// Include in every ReplayManifest so results are reproducible.
// ─────────────────────────────────────────────────────────────

export function getParametersSnapshot() {
  return {
    engineVersion: ENGINE_VERSION,
    parametersVersion: PARAMETERS_VERSION,
    dataVersion: DATA_VERSION,
    spatialResolution: SPATIAL_RESOLUTION,
    hazardWeights: HAZARD_WEIGHTS,
    exposureWeights: EXPOSURE_WEIGHTS,
    priorityBenefitWeights: PRIORITY_BENEFIT_WEIGHTS,
    // Policy weights — must be present for replay reproducibility
    criticalityWeights: CRITICALITY_WEIGHTS,
    vulnerabilityDefaults: VULNERABILITY_DEFAULTS,
    surgeModel: {
      preferredMethod: SURGE_MODEL.preferredMethod,
      fallbackMethod: SURGE_MODEL.fallbackMethod,
      proximityThresholdKm: SURGE_MODEL.proximityThresholdKm,
    },
    advisorySeverityThresholds: ADVISORY_SEVERITY_THRESHOLDS,
  } as const;
}
