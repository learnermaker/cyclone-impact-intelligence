/**
 * Platform Data Profiles
 *
 * A DataProfile declares which data sources are active and how the platform
 * should behave. The same engine and API routes are used for all profiles —
 * only the data inputs change.
 *
 * Profiles:
 *   DEMO          — fully offline, synthetic fixture only
 *   GEE_ENRICHED  — real GEE-derived data where available, DEMO fallback otherwise
 *   LIVE          — operational: live adapters + GEE static enrichment
 *   REPLAY        — historical event with strict temporal firewall
 *
 * Auto-detection: the platform checks which processed files exist at startup
 * and selects GEE_ENRICHED if GEE outputs are present, otherwise DEMO.
 */

import { existsSync } from "fs";
import { join } from "path";
import type { DataSourceId } from "./sources";
import { DATA_SOURCES } from "./sources";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type DataProfileId = "DEMO" | "GEE_ENRICHED" | "LIVE" | "REPLAY";

export type DataProfile = {
  id: DataProfileId;
  label: string;
  description: string;
  /** Sources active in the prediction path */
  predictionSources: DataSourceId[];
  /** Sources available for reveal/evaluation only */
  revealSources: DataSourceId[];
  /** If this profile is unavailable, fall back to this one */
  fallbackProfileId?: DataProfileId;
  /** Whether the profile requires GEE processed files */
  requiresGEE: boolean;
  /** Whether the profile requires live network adapters */
  requiresLiveAdapters: boolean;
};

// ─────────────────────────────────────────────────────────────
// PROFILE DEFINITIONS
// ─────────────────────────────────────────────────────────────

export const DATA_PROFILES: Record<DataProfileId, DataProfile> = {

  DEMO: {
    id: "DEMO",
    label: "Demo (Offline)",
    description:
      "Fully offline mode using deterministic synthetic fixture. " +
      "Works without Earth Engine, internet, or any credentials. " +
      "All values are clearly labelled DEMO_FIXTURE.",
    predictionSources: ["DEMO_FIXTURE", "OSM_INFRASTRUCTURE"],
    revealSources: [],
    requiresGEE: false,
    requiresLiveAdapters: false,
  },

  GEE_ENRICHED: {
    id: "GEE_ENRICHED",
    label: "GEE Enriched",
    description:
      "Real GEE-derived population (WorldPop 2019), terrain (NASADEM), " +
      "and post-event flood proxy (Sentinel-1) where available. " +
      "DEMO_FIXTURE used for cells not covered by GEE exports. " +
      "Rainfall forecast comes from scenario / meteorological adapter.",
    predictionSources: [
      "WORLDPOP_2019",    // Real population — prediction-safe
      "NASADEM",          // Real terrain — prediction-safe
      "OSM_INFRASTRUCTURE",
      "GDACS_LIVE",       // Live cyclone if available
      "OPENMETEO_ECMWF",  // Forecast rainfall if available
      "DEMO_FIXTURE",     // Fallback for uncovered cells
    ],
    revealSources: [
      "SENTINEL1_FANI_ACTUAL",  // Post-event flood proxy — reveal-only
      "GPM_FANI_EVENT_96H",     // Event rainfall observation — reveal/evaluation
    ],
    fallbackProfileId: "DEMO",
    requiresGEE: true,
    requiresLiveAdapters: false,
  },

  LIVE: {
    id: "LIVE",
    label: "Live Operations",
    description:
      "Live/near-live cyclone track from GDACS/IMD, forecast meteorology " +
      "from Open-Meteo ECMWF, enriched by GEE static datasets. " +
      "Degrades to GEE_ENRICHED or DEMO if live services are unavailable.",
    predictionSources: [
      "GDACS_LIVE",
      "OPENMETEO_ECMWF",
      "IMD_RSMC",
      "WORLDPOP_2019",
      "NASADEM",
      "OSM_INFRASTRUCTURE",
      "DEMO_FIXTURE",
    ],
    revealSources: [],
    fallbackProfileId: "GEE_ENRICHED",
    requiresGEE: true,
    requiresLiveAdapters: true,
  },

  REPLAY: {
    id: "REPLAY",
    label: "Historical Replay",
    description:
      "Historical event replay with strict temporal information firewall. " +
      "Prediction phase uses only data available before event cutoff. " +
      "Post-event observations become available only after explicit REVEAL.",
    predictionSources: [
      "WORLDPOP_2019",
      "NASADEM",
      "OSM_INFRASTRUCTURE",
      "DEMO_FIXTURE",
    ],
    revealSources: [
      "SENTINEL1_FANI_ACTUAL",
      "GPM_FANI_EVENT_96H",
    ],
    fallbackProfileId: "DEMO",
    requiresGEE: true,
    requiresLiveAdapters: false,
  },
};

// ─────────────────────────────────────────────────────────────
// AUTO-DETECTION
// ─────────────────────────────────────────────────────────────

const REPO_ROOT = join(process.cwd());

function fileExists(relativePath: string): boolean {
  try {
    return existsSync(join(REPO_ROOT, relativePath));
  } catch {
    return false;
  }
}

/**
 * Check which GEE processed files are present on disk.
 * Returns the set of available DataSourceIds.
 */
export function detectAvailableSources(): Set<DataSourceId> {
  const available = new Set<DataSourceId>();

  for (const source of Object.values(DATA_SOURCES)) {
    if (!source.localPath) continue;
    if (fileExists(source.localPath)) {
      available.add(source.id);
    }
  }

  // DEMO_FIXTURE is always available (hard-coded fixture)
  available.add("DEMO_FIXTURE");
  available.add("OSM_INFRASTRUCTURE");

  return available;
}

/**
 * Auto-detect the best available data profile based on present files.
 * Falls back from GEE_ENRICHED → DEMO if GEE files are missing.
 */
export function detectDataProfile(): DataProfileId {
  const available = detectAvailableSources();
  const geeRequired = ["WORLDPOP_2019", "NASADEM"] as DataSourceId[];

  const hasGEE = geeRequired.every((id) => available.has(id));
  return hasGEE ? "GEE_ENRICHED" : "DEMO";
}

/**
 * Get coverage details: how many of the required prediction sources
 * are available for the given profile.
 */
export function getProfileCoverage(profileId: DataProfileId): {
  available: DataSourceId[];
  unavailable: DataSourceId[];
  fraction: number;
} {
  const profile = DATA_PROFILES[profileId];
  const present = detectAvailableSources();

  const available = profile.predictionSources.filter((id) => present.has(id));
  const unavailable = profile.predictionSources.filter((id) => !present.has(id));
  const fraction = available.length / profile.predictionSources.length;

  return { available, unavailable, fraction };
}

// ─────────────────────────────────────────────────────────────
// CACHED PROFILE (singleton — computed once at server startup)
// ─────────────────────────────────────────────────────────────

let _cachedProfile: DataProfileId | null = null;

export function getActiveProfile(): DataProfileId {
  if (!_cachedProfile) {
    _cachedProfile = detectDataProfile();
  }
  return _cachedProfile;
}

export function resetProfileCache(): void {
  _cachedProfile = null;
}
