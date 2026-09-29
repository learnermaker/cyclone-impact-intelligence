/**
 * Engine Runner — main entry point
 *
 * Orchestrates the full platform pipeline:
 *   1. Determine data profile (DEMO | GEE_ENRICHED | LIVE | REPLAY)
 *   2. Load fixture cells (server-side singleton)
 *   3. Apply GEE enrichment (real WorldPop/NASADEM overrides where available)
 *   4. Apply scenario overrides via hazard engine
 *   5. Compute impact (hazard × exposure × susceptibility)
 *   6. Correlate infrastructure, compute asset risk
 *   7. Run priority optimizer
 *   8. Return EngineRunResult with provenance
 *
 * DATA PROFILES:
 *   DEMO         — synthetic fixture only, fully offline
 *   GEE_ENRICHED — real WorldPop+NASADEM where available, fixture fallback
 *   REPLAY       — GEE_ENRICHED + strict temporal firewall
 *   LIVE         — GEE_ENRICHED + live adapters
 *
 * TEMPORAL FIREWALL:
 *   GPM event data and Sentinel-1 actual are NEVER loaded here.
 *   They are accessed only by the explicit REVEAL step (/api/replay/reveal).
 */

import {
  loadFixtureCells,
  loadFixtureInfrastructure,
  loadFixtureHazardScenario,
  getFixtureMetadata,
  getAllLandCells,
  type FixtureCell,
} from "./loader/index";
import { computeHazardForAllCells } from "./hazard/index";
import { computeImpactForAllCells } from "./impact/index";
import { correlateAndComputeInfrastructure } from "./infrastructure/index";
import { runGreedyTopK } from "./priority/index";
import { computeFloodSusceptibility } from "./susceptibility/index";
import { loadGEEEnrichment, type GEEEnrichmentLayer } from "./loader/gee-loader";
import { getActiveProfile } from "../data-layer/profiles";
import {
  ENGINE_VERSION,
  DATA_VERSION,
  PARAMETERS_VERSION,
  FANI_KNOWN_PARAMETERS,
  RESPONSE_CAPACITY,
  SURGE_MODEL,
  getParametersSnapshot,
} from "../config/index";
import type { ReplayManifest, SourceRef } from "../lib/types/index";
import type { EngineRunOptions, EngineRunResult, EngineStats, EnrichmentStats } from "./types";

// ─────────────────────────────────────────────────────────────
// GEE ENRICHMENT APPLICATION
//
// Merges real GEE values into fixture cells before engine processing.
// Only updates fields we have real data for. Everything else is preserved.
// ─────────────────────────────────────────────────────────────

function applyGEEEnrichment(
  cells: Map<string, FixtureCell>,
  enrichment: GEEEnrichmentLayer,
  profileId: string
): { mergedCells: Map<string, FixtureCell>; stats: EnrichmentStats } {
  const mergedCells = new Map<string, FixtureCell>();
  let realPopCount = 0;
  let realElevCount = 0;

  for (const [cellId, cell] of cells) {
    if (!cell.properties.isLand) {
      mergedCells.set(cellId, cell);
      continue;
    }

    const realPop = enrichment.population.get(cellId);
    const realElev = enrichment.elevationM.get(cellId);

    if (realPop === undefined && realElev === undefined) {
      // No GEE coverage for this cell — use fixture as-is
      mergedCells.set(cellId, cell);
      continue;
    }

    if (realPop !== undefined) realPopCount++;
    if (realElev !== undefined) realElevCount++;

    // Use real elevation if available; otherwise keep synthetic
    const newElev = realElev ?? cell.properties.susceptibility.elevationMedianM;

    // Recompute flood susceptibility from real elevation
    // This ensures the terrain signal is correct, not just substituted
    const newFloodSusc = realElev !== undefined
      ? computeFloodSusceptibility(realElev)
      : cell.properties.susceptibility.floodSusceptibility;

    // Use real population if available; keep synthetic buildings/roads
    const newPop = realPop ?? cell.properties.exposure.population;

    // Create merged cell — preserving geometry and all other fields
    const mergedCell: FixtureCell = {
      id: cell.id,
      geometry: cell.geometry,
      centerLng: cell.centerLng,
      centerLat: cell.centerLat,
      properties: {
        ...cell.properties,
        exposure: {
          ...cell.properties.exposure,
          population: newPop,
          // NOTE: buildings/roads remain synthetic — we don't have real data for them
          // combined will be recomputed by combineExposure() in impact engine
        },
        susceptibility: {
          ...cell.properties.susceptibility,
          elevationMedianM: newElev,
          floodSusceptibility: newFloodSusc,
        },
      },
    };

    mergedCells.set(cellId, mergedCell);
  }

  // Compute overall coverage and status
  const totalLandCells = Array.from(cells.values()).filter((c) => c.properties.isLand).length;
  const realCovPct = totalLandCells > 0
    ? Math.round((Math.min(realPopCount, realElevCount) / totalLandCells) * 100)
    : 0;

  const overallStatus: "REAL_DATA" | "MIXED" | "DEMO_FIXTURE" =
    realCovPct >= 95 ? "REAL_DATA" : realCovPct > 0 ? "MIXED" : "DEMO_FIXTURE";

  const stats: EnrichmentStats = {
    profileId,
    totalLandCells,
    realPopulationCells: realPopCount,
    realElevationCells: realElevCount,
    realCoveragePercent: realCovPct,
    overallStatus,
    activeGEESources: enrichment.sources as string[],
  };

  return { mergedCells, stats };
}

// ─────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────

export async function runFaniDemoEngine(
  options: EngineRunOptions = {}
): Promise<EngineRunResult> {
  const computedAt = new Date().toISOString();

  const {
    windMultiplier = 1.0,
    rainfallMultiplier = 1.0,
    surgeHeightM = 1.5,
    responseCapacity = RESPONSE_CAPACITY.default,
    objective = "balanced",
    surgeMethod = SURGE_MODEL.preferredMethod,
    dataProfile: requestedProfile,
  } = options;

  // ── Step 1: Determine data profile ───────────────────────────
  // Use requested profile, or auto-detect based on available files
  const profileId = requestedProfile ?? getActiveProfile();

  // ── Step 2: Load fixture ──────────────────────────────────────
  const rawCells = loadFixtureCells();
  const infraFixture = loadFixtureInfrastructure();
  const hazardScenarioFixture = loadFixtureHazardScenario() as {
    surge?: { source?: string };
    tier?: string;
    displayLabel?: string;
    cyclone?: { maxWindKph?: number };
    rainfall?: { forecast24hMm?: number };
    eventId?: string;
  };
  const fixtureMeta = getFixtureMetadata();

  // ── Step 3: Apply GEE enrichment (if profile supports it) ─────
  // DEMO profile: skip GEE (fully synthetic)
  // GEE_ENRICHED / REPLAY / LIVE: load and merge real data
  let cells: Map<string, FixtureCell>;
  let enrichmentStats: EnrichmentStats;

  if (profileId !== "DEMO") {
    const enrichment = loadGEEEnrichment();

    if (enrichment.populationCoverage > 0 || enrichment.elevationCoverage > 0) {
      const merged = applyGEEEnrichment(rawCells, enrichment, profileId);
      cells = merged.mergedCells;
      enrichmentStats = merged.stats;
    } else {
      // GEE files don't exist — fall back to fixture (still report the profile)
      cells = rawCells;
      const landCount = getAllLandCells(rawCells).length;
      enrichmentStats = {
        profileId,
        totalLandCells: landCount,
        realPopulationCells: 0,
        realElevationCells: 0,
        realCoveragePercent: 0,
        overallStatus: "DEMO_FIXTURE",
        activeGEESources: [],
      };
    }
  } else {
    // Pure DEMO — no GEE
    cells = rawCells;
    const landCount = getAllLandCells(rawCells).length;
    enrichmentStats = {
      profileId: "DEMO",
      totalLandCells: landCount,
      realPopulationCells: 0,
      realElevationCells: 0,
      realCoveragePercent: 0,
      overallStatus: "DEMO_FIXTURE",
      activeGEESources: [],
    };
  }

  // fixtureStatus derives from enrichment coverage
  const fixtureStatus =
    enrichmentStats.overallStatus === "REAL_DATA" ? "REAL_DATA"
    : enrichmentStats.overallStatus === "MIXED" ? "MIXED"
    : (fixtureMeta.dataStatus === "DEMO_FIXTURE" ? "DEMO_FIXTURE" : "REAL_DATA") as
      "DEMO_FIXTURE" | "REAL_DATA" | "MIXED";

  const surgeSource = (hazardScenarioFixture.surge?.source ?? "scenario") as
    | "official" | "scenario";

  const isScenarioModified =
    windMultiplier !== 1.0 || rainfallMultiplier !== 1.0 || surgeHeightM !== 1.5;

  const tier: import("../lib/types/index").SourceTier = isScenarioModified
    ? "SCENARIO"
    : fixtureStatus === "DEMO_FIXTURE" ? "DEMO_FIXTURE"
    : "MODEL_DERIVED";

  const displayLabel = isScenarioModified
    ? "SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST"
    : (hazardScenarioFixture.displayLabel as string | undefined) ??
      "HISTORICAL REPLAY — PRE-EVENT RECONSTRUCTION";

  // ── Step 4: Hazard computation ────────────────────────────────
  const normalizedSurgeMethod: "flood_fill" | "proximity_threshold" =
    surgeMethod === "official" ? "flood_fill" : surgeMethod;

  const hazardMap = computeHazardForAllCells(cells, surgeHeightM, {
    windMultiplier,
    rainfallMultiplier,
    surgeHeightM,
    surgeMethod: normalizedSurgeMethod,
    surgeProximityThresholdKm: SURGE_MODEL.proximityThresholdKm,
  });

  // ── Step 5: Impact computation ────────────────────────────────
  const processedCells = computeImpactForAllCells(
    cells,
    hazardMap,
    fixtureStatus,
    surgeSource,
    normalizedSurgeMethod
  );

  // ── Step 6: Infrastructure correlation ───────────────────────
  const assets = correlateAndComputeInfrastructure(
    infraFixture,
    processedCells,
    fixtureStatus
  );

  // ── Step 7: Priority optimization ────────────────────────────
  const recommendations = runGreedyTopK(
    processedCells,
    responseCapacity,
    objective,
    computedAt
  );

  // ── Step 8: Statistics ────────────────────────────────────────
  const landCells = getAllLandCells(cells);
  const stats = computeStats(processedCells, landCells.length, recommendations.length);

  // ── Step 9: Manifest ──────────────────────────────────────────
  const sourceTier = fixtureStatus === "DEMO_FIXTURE" ? "DEMO_FIXTURE" as const : "MODEL_DERIVED" as const;
  const sources: SourceRef[] = [
    {
      id: "fani-demo-fixture",
      tier: sourceTier,
      description:
        fixtureStatus === "DEMO_FIXTURE"
          ? "Fani 2019 demo fixture — synthetic approximation"
          : "Fani 2019 GEE-enriched fixture — real WorldPop/NASADEM with fixture fallback",
      referenceDate: FANI_KNOWN_PARAMETERS.predictionCutoffAt,
      processedAt: fixtureMeta.generationTimestamp,
      license: "See THIRD_PARTY_LICENSES.md",
    },
  ];

  // Add GEE sources to manifest
  for (const geeSourceId of enrichmentStats.activeGEESources) {
    sources.push({
      id: geeSourceId,
      tier: "AUTHORITATIVE_OPEN" as const,
      description: `GEE-derived: ${geeSourceId}`,
    });
  }

  const manifest: ReplayManifest = {
    manifestId: `fani-${profileId}-${computedAt}`,
    event: "fani-2019-t24h",
    cutoffAt: FANI_KNOWN_PARAMETERS.predictionCutoffAt,
    engineVersion: ENGINE_VERSION,
    dataVersion: DATA_VERSION,
    parametersVersion: PARAMETERS_VERSION,
    fixtureStatus,
    sources,
    generatedAt: computedAt,
  };

  return {
    scenario: {
      eventId: (hazardScenarioFixture.eventId as string | undefined) ?? "fani-2019-t24h",
      tier,
      displayLabel,
      windKph: (hazardScenarioFixture.cyclone?.maxWindKph ?? 220) * windMultiplier,
      rainfall24hMm: (hazardScenarioFixture.rainfall?.forecast24hMm ?? 200) * rainfallMultiplier,
      surgeM: surgeHeightM,
      surgeMethod: normalizedSurgeMethod,
    },
    manifest,
    cells: processedCells,
    assets,
    recommendations,
    stats,
    fixtureStatus,
    dataProfileId: profileId,
    enrichmentStats,
    computedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// STATISTICS
// ─────────────────────────────────────────────────────────────

function computeStats(
  cells: Map<string, import("./types").ProcessedCell>,
  totalLandCells: number,
  topKSelected: number
): EngineStats {
  let surgeExposed = 0;
  let highHazard = 0;
  let totalPop = 0;
  let peakHazard = 0;
  let peakImpact = 0;

  for (const cell of cells.values()) {
    if (cell.hazard.surgeExposed) surgeExposed++;
    if (cell.hazard.combined > 0.5) highHazard++;
    totalPop += cell.exposure.population;
    if (cell.hazard.combined > peakHazard) peakHazard = cell.hazard.combined;
    if (cell.impactExposure.score > peakImpact) peakImpact = cell.impactExposure.score;
  }

  return {
    totalCells: totalLandCells,
    landCells: cells.size,
    surgeExposedCells: surgeExposed,
    highHazardCells: highHazard,
    totalPopulationExposed: totalPop,
    peakHazard: Math.round(peakHazard * 10000) / 10000,
    peakImpact: Math.round(peakImpact * 10000) / 10000,
    topKSelected,
  };
}
