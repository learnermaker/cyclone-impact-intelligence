/**
 * Platform Data Source Registry
 *
 * Every data product used by the Cyclone Impact Intelligence Platform
 * is declared here with its role, temporal status, and provenance.
 *
 * This is the source of truth for:
 *  - What data is prediction-safe vs reveal-only
 *  - Which sources feed which engine components
 *  - Provenance labelling throughout the platform
 *
 * To add a new data product (e.g., another region, another event):
 *  1. Add its DataSourceId
 *  2. Define its DataSource entry
 *  3. Add it to the appropriate DataProfile
 *  4. Write the loader in gee-loader.ts or adapters/
 */

import type { SourceTier } from "../lib/types/index";

// ─────────────────────────────────────────────────────────────
// IDENTIFIERS
// ─────────────────────────────────────────────────────────────

export const DATA_SOURCE_IDS = [
  // ── Static / historical baseline (prediction-safe) ──────────
  "WORLDPOP_2019",            // Population exposure, India 2019
  "NASADEM",                  // Static terrain elevation
  "OSM_INFRASTRUCTURE",       // Roads, critical facilities
  // ── Event observations — historical (NOT prediction-safe) ────
  "GPM_FANI_EVENT_96H",       // Observed Fani rainfall accumulation
  "SENTINEL1_FANI_ACTUAL",    // Post-event SAR inundation proxy
  // ── Forecast / near-real-time (prediction-safe when current) ─
  "GDACS_LIVE",               // Live cyclone events
  "OPENMETEO_ECMWF",          // Meteorological forecast
  "IMD_RSMC",                 // Official IMD cyclone data
  // ── Synthetic fallback ────────────────────────────────────────
  "DEMO_FIXTURE",             // Deterministic synthetic baseline
] as const;

export type DataSourceId = (typeof DATA_SOURCE_IDS)[number];

// ─────────────────────────────────────────────────────────────
// TEMPORAL ROLE
//
// Determines which phase a data product may be used in.
// This is enforced by the TemporalFirewall (cell-model.ts).
// ─────────────────────────────────────────────────────────────

export type TemporalRole =
  | "static"                // Does not change over time (e.g., terrain)
  | "historical_baseline"   // Fixed historical year (e.g., WorldPop 2019)
  | "event_observation"     // Observed during event (includes post-cutoff)
  | "post_event"            // Strictly after event (e.g., SAR flood map)
  | "forecast"              // Future-looking prediction data
  | "near_real_time"        // Current/operational data
  | "synthetic";            // Deterministic fixture — always prediction-safe

// ─────────────────────────────────────────────────────────────
// DATA ROLE
//
// Which engine component this source feeds.
// ─────────────────────────────────────────────────────────────

export type DataRole =
  | "exposure_population"
  | "exposure_buildings"
  | "terrain_elevation"
  | "exposure_infrastructure"
  | "rainfall_observation"    // Historical/event observed rainfall
  | "rainfall_forecast"       // Forecast/scenario rainfall
  | "inundation_observation"  // Observed flood extent
  | "cyclone_track"           // Cyclone position and intensity
  | "synthetic_fixture";      // Synthetic fallback

// ─────────────────────────────────────────────────────────────
// DATA SOURCE TYPE
// ─────────────────────────────────────────────────────────────

export type DataSource = {
  id: DataSourceId;
  name: string;
  provider: string;
  dataset: string;
  version?: string;
  temporalRole: TemporalRole;
  dataRole: DataRole;
  geography: string;
  resolution?: string;
  units?: string;

  /**
   * Can this source be used in the PREDICTION phase?
   *
   * true  = safe to use for T-24h prediction (static/historical/forecast)
   * false = post-event or event-observation — prediction path BLOCKED
   *
   * Enforced by TemporalFirewall, not just UI visibility.
   */
  predictionSafe: boolean;

  /**
   * Is this source available ONLY after an explicit REVEAL action?
   * (stricter than predictionSafe: false)
   */
  revealOnly: boolean;

  tier: SourceTier;
  license: string;
  sourceUrl: string;

  /** Relative path to the processed local file, if available */
  localPath?: string;
};

// ─────────────────────────────────────────────────────────────
// SOURCE REGISTRY
// ─────────────────────────────────────────────────────────────

export const DATA_SOURCES: Record<DataSourceId, DataSource> = {

  // ── WorldPop 2019 ─────────────────────────────────────────────

  WORLDPOP_2019: {
    id: "WORLDPOP_2019",
    name: "WorldPop 2019 India (100m)",
    provider: "WorldPop / GEE",
    dataset: "WorldPop/GP/100m/pop",
    version: "2019",
    temporalRole: "historical_baseline",
    dataRole: "exposure_population",
    geography: "India / Odisha coastal corridor",
    resolution: "100m → H3 resolution 8",
    units: "persons per H3 cell (sum)",
    predictionSafe: true,   // Pre-event historical baseline — safe for T-24h
    revealOnly: false,
    tier: "AUTHORITATIVE_OPEN",
    license: "CC BY 4.0",
    sourceUrl: "https://hub.worldpop.org/doi/10.5258/SOTON/WP00532",
    localPath: "data/processed/worldpop_2019_h3r8_odisha.json",
  },

  // ── NASADEM ────────────────────────────────────────────────────

  NASADEM: {
    id: "NASADEM",
    name: "NASADEM (NASA, 30m)",
    provider: "NASA / GEE",
    dataset: "NASA/NASADEM_HGT/001",
    temporalRole: "static",
    dataRole: "terrain_elevation",
    geography: "Odisha coastal corridor",
    resolution: "30m → H3 resolution 8",
    units: "metres above sea level",
    predictionSafe: true,   // Static terrain — always safe
    revealOnly: false,
    tier: "AUTHORITATIVE_OPEN",
    license: "Public domain (NASA)",
    sourceUrl: "https://developers.google.com/earth-engine/datasets/catalog/NASA_NASADEM_HGT_001",
    localPath: "data/processed/nasadem_h3r8_odisha.json",
  },

  // ── OSM Infrastructure ────────────────────────────────────────

  OSM_INFRASTRUCTURE: {
    id: "OSM_INFRASTRUCTURE",
    name: "OpenStreetMap January 2019 (curated subset)",
    provider: "OpenStreetMap / curated",
    dataset: "OSM Geofabrik India Jan 2019",
    version: "January 2019",
    temporalRole: "historical_baseline",
    dataRole: "exposure_infrastructure",
    geography: "Odisha coastal corridor",
    units: "15 curated assets (hospitals, shelters, bridges, power, water)",
    predictionSafe: true,
    revealOnly: false,
    tier: "AUTHORITATIVE_OPEN",
    license: "ODbL 1.0",
    sourceUrl: "https://download.geofabrik.de/asia/india.html",
    localPath: "data/fixtures/fani-demo/infrastructure.json",
  },

  // ── GPM IMERG Fani Event (OBSERVATION — NOT prediction-safe) ──

  GPM_FANI_EVENT_96H: {
    id: "GPM_FANI_EVENT_96H",
    name: "GPM IMERG V07 — Fani event observation (Apr 30–May 4, 2019)",
    provider: "NASA / GEE",
    dataset: "NASA/GPM_L3/IMERG_V07",
    temporalRole: "event_observation",
    dataRole: "rainfall_observation",
    geography: "Odisha coastal corridor",
    resolution: "0.1° (~11km) → H3 resolution 8",
    units: "mm accumulated (96h window, Apr 30–May 4 — includes post-T-24h cutoff)",
    predictionSafe: false,  // POST-EVENT HISTORICAL OBSERVATION — window includes post-cutoff rainfall
    revealOnly: true,        // POST-EVENT HISTORICAL OBSERVATION / REPLAY EVALUATION ONLY
    // The 96h window (2019-04-30 to 2019-05-04) crosses the T-24h prediction cutoff
    // (2019-05-02T05:00:00Z). It is NOT safe to use as a T-24h forecast input.
    // Use only for event characterisation and replay evaluation after REVEAL.
    tier: "AUTHORITATIVE_OPEN",
    license: "Public domain (NASA)",
    sourceUrl: "https://developers.google.com/earth-engine/datasets/catalog/NASA_GPM_L3_IMERG_V07",
    localPath: "data/processed/gpm_imerg_fani_96h.json",
  },

  // ── Sentinel-1 Fani Actual (POST-EVENT — reveal-only) ─────────

  SENTINEL1_FANI_ACTUAL: {
    id: "SENTINEL1_FANI_ACTUAL",
    name: "Sentinel-1 GRD SAR — Fani post-event inundation proxy (May 4–10, 2019)",
    provider: "Copernicus / ESA / GEE",
    dataset: "COPERNICUS/S1_GRD",
    temporalRole: "post_event",
    dataRole: "inundation_observation",
    geography: "Odisha coastal corridor",
    resolution: "10m SAR → H3 resolution 8",
    units: "flooded fraction per H3 cell [0,1]",
    predictionSafe: false,  // POST-EVENT — must never enter prediction path
    revealOnly: true,        // Only available after explicit REVEAL step
    tier: "AUTHORITATIVE_OPEN",
    license: "Copernicus Sentinel data — ESA terms apply",
    sourceUrl: "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD",
    localPath: "data/historical/fani/actual/sentinel1_flood_extent.json",
  },

  // ── Live adapters ──────────────────────────────────────────────

  GDACS_LIVE: {
    id: "GDACS_LIVE",
    name: "GDACS — Global Disaster Alert and Coordination System",
    provider: "GDACS / UN",
    dataset: "GDACS API v2",
    temporalRole: "near_real_time",
    dataRole: "cyclone_track",
    geography: "Bay of Bengal",
    predictionSafe: true,   // Current operational data
    revealOnly: false,
    tier: "AUTHORITATIVE_OPEN",
    license: "GDACS terms — attribution required",
    sourceUrl: "https://www.gdacs.org/gdacsapi",
  },

  OPENMETEO_ECMWF: {
    id: "OPENMETEO_ECMWF",
    name: "Open-Meteo / ECMWF IFS Forecast",
    provider: "Open-Meteo / ECMWF",
    dataset: "ECMWF IFS",
    temporalRole: "forecast",
    dataRole: "rainfall_forecast",
    geography: "Bay of Bengal / Odisha",
    resolution: "0.1°",
    units: "wind km/h, rainfall mm, pressure hPa",
    predictionSafe: true,   // Forward-looking forecast
    revealOnly: false,
    tier: "AUTHORITATIVE_OPEN",
    license: "CC BY 4.0",
    sourceUrl: "https://open-meteo.com/en/docs/ecmwf-api",
  },

  IMD_RSMC: {
    id: "IMD_RSMC",
    name: "IMD RSMC New Delhi — Official Cyclone Data",
    provider: "India Meteorological Department",
    dataset: "IMD RSMC archive / advisory",
    temporalRole: "near_real_time",
    dataRole: "cyclone_track",
    geography: "Indian Ocean / Bay of Bengal",
    predictionSafe: true,
    revealOnly: false,
    tier: "OFFICIAL",
    license: "Official government data — attribution required",
    sourceUrl: "https://rsmcnewdelhi.imd.gov.in",
  },

  // ── Synthetic fallback ─────────────────────────────────────────

  DEMO_FIXTURE: {
    id: "DEMO_FIXTURE",
    name: "Cyclone Impact Intelligence Demo Fixture",
    provider: "Deterministic generation",
    dataset: "Synthetic approximation of Fani 2019 parameters",
    temporalRole: "synthetic",
    dataRole: "synthetic_fixture",
    geography: "Odisha coastal corridor",
    resolution: "H3 resolution 8 (0.74 km²/cell)",
    predictionSafe: true,   // Synthetic — no real data
    revealOnly: false,
    tier: "DEMO_FIXTURE",
    license: "Proprietary — project data",
    sourceUrl: "",
    localPath: "data/fixtures/fani-demo/cells.geojson",
  },
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

export function getSource(id: DataSourceId): DataSource {
  return DATA_SOURCES[id];
}

export function isPredictionSafe(id: DataSourceId): boolean {
  return DATA_SOURCES[id].predictionSafe;
}

export function isRevealOnly(id: DataSourceId): boolean {
  return DATA_SOURCES[id].revealOnly;
}

/** Build a minimal SourceRef for provenance embedding in engine outputs */
export function sourceToRef(id: DataSourceId) {
  const s = DATA_SOURCES[id];
  return {
    id: s.id,
    tier: s.tier,
    description: s.name,
    url: s.sourceUrl || undefined,
  } as const;
}
