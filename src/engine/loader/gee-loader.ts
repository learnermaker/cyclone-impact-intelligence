/**
 * GEE Data Loader
 *
 * Loads GEE-derived data products from data/processed/ and
 * data/historical/fani/actual/ and normalizes them for engine consumption.
 *
 * TEMPORAL FIREWALL — enforced here:
 *   Prediction-safe sources (WorldPop, NASADEM) → available in all phases
 *   Reveal-only sources (Sentinel-1, GPM event) → only returned when
 *   phase = 'REVEAL' | 'EVALUATE'; throws TemporalFirewallError otherwise
 *
 * The engine never imports @google/earthengine.
 * GEE is a preprocessing layer only.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  TemporalFirewall,
  type EnginePhase,
} from "../../data-layer/cell-model";
import type { DataSourceId } from "../../data-layer/sources";

const REPO_ROOT = process.cwd();

// ─────────────────────────────────────────────────────────────
// FILE PATHS
// ─────────────────────────────────────────────────────────────

const GEE_PATHS: Record<string, string> = {
  worldpop:    "data/processed/worldpop_2019_h3r8_odisha.json",
  nasadem:     "data/processed/nasadem_h3r8_odisha.json",
  gpm:         "data/processed/gpm_imerg_fani_96h.json",
  sentinel1:   "data/historical/fani/actual/sentinel1_flood_extent.json",
};

// ─────────────────────────────────────────────────────────────
// IN-MEMORY CACHES (loaded once per process)
// ─────────────────────────────────────────────────────────────

type GEEFileContent = {
  metadata: Record<string, unknown>;
  data: Record<string, unknown>;
};

const _cache = new Map<string, GEEFileContent>();

function loadFile(key: string): GEEFileContent | null {
  if (_cache.has(key)) return _cache.get(key)!;

  const path = join(REPO_ROOT, GEE_PATHS[key] ?? "");
  if (!path || !existsSync(path)) return null;

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as GEEFileContent;
    _cache.set(key, raw);
    return raw;
  } catch {
    return null;
  }
}

export function clearGEECache(): void {
  _cache.clear();
}

// ─────────────────────────────────────────────────────────────
// PREDICTION-SAFE ENRICHMENT
// (WorldPop 2019, NASADEM — always available)
// ─────────────────────────────────────────────────────────────

export type GEEEnrichmentLayer = {
  /** Map<cellId, population count> from WorldPop 2019 */
  population: Map<string, number>;
  /** Map<cellId, elevation metres> from NASADEM */
  elevationM: Map<string, number>;
  /** Number of cells with real population data */
  populationCoverage: number;
  /** Number of cells with real elevation data */
  elevationCoverage: number;
  /** Source IDs used */
  sources: DataSourceId[];
};

/**
 * Load prediction-safe GEE enrichment data.
 * Safe to call in any engine phase.
 */
export function loadGEEEnrichment(): GEEEnrichmentLayer {
  const wpFile = loadFile("worldpop");
  const ndFile = loadFile("nasadem");

  const population = new Map<string, number>();
  const elevationM = new Map<string, number>();
  const sources: DataSourceId[] = [];

  if (wpFile) {
    for (const [cellId, val] of Object.entries(wpFile.data)) {
      if (typeof val === "number" && val >= 0) {
        population.set(cellId, Math.round(val));
      }
    }
    if (population.size > 0) sources.push("WORLDPOP_2019");
  }

  if (ndFile) {
    for (const [cellId, val] of Object.entries(ndFile.data)) {
      if (typeof val === "number") {
        elevationM.set(cellId, Math.max(0, val));
      }
    }
    if (elevationM.size > 0) sources.push("NASADEM");
  }

  return {
    population,
    elevationM,
    populationCoverage: population.size,
    elevationCoverage: elevationM.size,
    sources,
  };
}

// ─────────────────────────────────────────────────────────────
// REVEAL-ONLY DATA
// (GPM event, Sentinel-1 — blocked in PREDICTION phase)
// ─────────────────────────────────────────────────────────────

export type GEERevealData = {
  /** Map<cellId, accumulated rainfall mm> from GPM IMERG */
  rainfallMm: Map<string, number>;
  /** Map<cellId, flooded fraction [0,1]> from Sentinel-1 */
  floodedFraction: Map<string, number>;
  /** Map<cellId, boolean> — isFlooded from Sentinel-1 */
  isFlooded: Map<string, boolean>;
  /** CellIds identified as flooded (isFlooded = true) */
  floodedCellIds: string[];
  sources: DataSourceId[];
};

/**
 * Load GEE reveal-only data.
 *
 * TEMPORAL FIREWALL: This function asserts that the caller is in
 * REVEAL or EVALUATE phase. Calling it in PREDICTION throws
 * TemporalFirewallError, preventing accidental data leakage.
 */
export function loadGEERevealData(phase: EnginePhase): GEERevealData {
  // Enforce temporal firewall for both sources
  TemporalFirewall.assertAllowed("GPM_FANI_EVENT_96H", phase);
  TemporalFirewall.assertAllowed("SENTINEL1_FANI_ACTUAL", phase);

  const gpmFile = loadFile("gpm");
  const s1File  = loadFile("sentinel1");

  const rainfallMm    = new Map<string, number>();
  const floodedFraction = new Map<string, number>();
  const isFlooded     = new Map<string, boolean>();
  const sources: DataSourceId[] = [];

  if (gpmFile) {
    for (const [cellId, val] of Object.entries(gpmFile.data)) {
      if (typeof val === "number" && val >= 0) {
        rainfallMm.set(cellId, val);
      }
    }
    if (rainfallMm.size > 0) sources.push("GPM_FANI_EVENT_96H");
  }

  type S1Value = { floodedFraction?: number; isFlooded?: boolean; changeDb?: number };
  if (s1File) {
    for (const [cellId, val] of Object.entries(s1File.data)) {
      const v = val as S1Value;
      if (typeof v.floodedFraction === "number") {
        floodedFraction.set(cellId, v.floodedFraction);
      }
      if (typeof v.isFlooded === "boolean") {
        isFlooded.set(cellId, v.isFlooded);
      }
    }
    if (isFlooded.size > 0) sources.push("SENTINEL1_FANI_ACTUAL");
  }

  const floodedCellIds = Array.from(isFlooded.entries())
    .filter(([, flooded]) => flooded)
    .map(([cellId]) => cellId);

  return {
    rainfallMm,
    floodedFraction,
    isFlooded,
    floodedCellIds,
    sources,
  };
}

// ─────────────────────────────────────────────────────────────
// AVAILABILITY CHECK (used by profiles.ts and API routes)
// ─────────────────────────────────────────────────────────────

export type GEEAvailabilityReport = {
  worldpop: boolean;
  nasadem: boolean;
  gpm: boolean;
  sentinel1: boolean;
  anyPredictionSafe: boolean;
  anyRevealOnly: boolean;
};

export function checkGEEAvailability(): GEEAvailabilityReport {
  const worldpop  = existsSync(join(REPO_ROOT, GEE_PATHS["worldpop"]!));
  const nasadem   = existsSync(join(REPO_ROOT, GEE_PATHS["nasadem"]!));
  const gpm       = existsSync(join(REPO_ROOT, GEE_PATHS["gpm"]!));
  const sentinel1 = existsSync(join(REPO_ROOT, GEE_PATHS["sentinel1"]!));

  return {
    worldpop,
    nasadem,
    gpm,
    sentinel1,
    anyPredictionSafe: worldpop || nasadem,
    anyRevealOnly: gpm || sentinel1,
  };
}
