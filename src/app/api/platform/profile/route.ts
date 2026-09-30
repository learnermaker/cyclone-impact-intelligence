/**
 * GET /api/platform/profile
 *
 * Returns the current platform data profile, source coverage,
 * and GEE availability status.
 *
 * This is the single source of truth for the UI's DataProfilePanel.
 * No engine run required — just checks file availability.
 */
import { NextResponse } from "next/server";
import {
  getActiveProfile,
  getProfileCoverage,
  DATA_PROFILES,
  detectAvailableSources,
} from "../../../../data-layer/profiles";
import { DATA_SOURCES } from "../../../../data-layer/sources";
import { checkGEEAvailability } from "../../../../engine/loader/gee-loader";
import type { ApiResponse } from "../../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const profileId = getActiveProfile();
  const profile   = DATA_PROFILES[profileId];
  const coverage  = getProfileCoverage(profileId);
  const available = detectAvailableSources();
  const geeStatus = checkGEEAvailability();

  // Build source status list
  const predictionSources = profile.predictionSources.map((sourceId) => {
    const src = DATA_SOURCES[sourceId];
    return {
      id: sourceId,
      name: src.name,
      role: src.dataRole,
      temporalRole: src.temporalRole,
      predictionSafe: src.predictionSafe,
      tier: src.tier,
      available: available.has(sourceId),
      localPath: src.localPath ?? null,
    };
  });

  const revealSources = profile.revealSources.map((sourceId) => {
    const src = DATA_SOURCES[sourceId];
    return {
      id: sourceId,
      name: src.name,
      role: src.dataRole,
      temporalRole: src.temporalRole,
      predictionSafe: src.predictionSafe,
      revealOnly: src.revealOnly,
      tier: src.tier,
      available: available.has(sourceId),
      localPath: src.localPath ?? null,
    };
  });

  // ── Actual cell coverage from GEE file metadata ─────────────────────────────
  // Read declared cellCount from each GEE file header to compute per-source
  // coverage vs the total fixture land cells (totalLandCells from fixture stats).
  // This is faster than running the engine and avoids a full fixture load.
  function readGEECellCount(relativePath: string): number {
    try {
      const fs = require("fs") as typeof import("fs");
      const path = require("path") as typeof import("path");
      const raw = fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
      const j = JSON.parse(raw) as { metadata?: { cellCount?: number } };
      return j.metadata?.cellCount ?? 0;
    } catch { return 0; }
  }

  // Total land cells from fixture (approximate — fixture loads are singleton-cached)
  // Hardcoded from audit: 25,432 coastal land cells in the Odisha AOI at H3 r8
  const TOTAL_LAND_CELLS_AOI = 25_432;
  const worldpopCells = readGEECellCount("data/processed/worldpop_2019_h3r8_odisha.json");
  const nasademCells  = readGEECellCount("data/processed/nasadem_h3r8_odisha.json");

  const worldpopCoverPct = TOTAL_LAND_CELLS_AOI > 0 ? Math.round((worldpopCells / TOTAL_LAND_CELLS_AOI) * 100) : 0;
  const nasademCoverPct  = TOTAL_LAND_CELLS_AOI > 0 ? Math.round((nasademCells  / TOTAL_LAND_CELLS_AOI) * 100) : 0;

  // Coverage status: only REAL_DATA if ≥95% of land cells have both products
  const minCoverPct = Math.min(worldpopCoverPct, nasademCoverPct);
  const coverageLabel =
    minCoverPct >= 95 ? "REAL_DATA"
    : minCoverPct > 0  ? "MIXED"
    : "DEMO_ONLY";

  const response: ApiResponse<unknown> = {
    ok: true,
    data: {
      activeProfile: {
        id: profileId,
        label: profile.label,
        description: profile.description,
        requiresGEE: profile.requiresGEE,
        requiresLiveAdapters: profile.requiresLiveAdapters,
      },
      coverage: {
        available: coverage.available,
        unavailable: coverage.unavailable,
        fractionPercent: Math.round(coverage.fraction * 100),
      },
      predictionSources,
      revealSources,
      geeFiles: {
        worldpop:  { available: geeStatus.worldpop,  role: "population (WorldPop 2019)" },
        nasadem:   { available: geeStatus.nasadem,   role: "elevation (NASADEM)" },
        gpm:       { available: geeStatus.gpm,       role: "rainfall observation (GPM IMERG, reveal-only)" },
        sentinel1: { available: geeStatus.sentinel1, role: "flood extent proxy (Sentinel-1, reveal-only)" },
      },
      // Per-source actual cell coverage vs total AOI land cells
      geeCoverage: {
        totalAoiLandCells: TOTAL_LAND_CELLS_AOI,
        worldpop: {
          cells: worldpopCells,
          coveragePercent: worldpopCoverPct,
          coverageLabel: worldpopCells > 0 ? "REAL_DATA (partial)" : "DEMO_FIXTURE",
        },
        nasadem: {
          cells: nasademCells,
          coveragePercent: nasademCoverPct,
          coverageLabel: nasademCells > 0 ? "REAL_DATA (partial)" : "DEMO_FIXTURE",
        },
        buildings: {
          cells: 0,
          coveragePercent: 0,
          coverageLabel: "DEMO_FIXTURE (synthetic)",
          note: "Open Buildings not integrated — see LIMITATIONS.md",
        },
        overallCoverageNote:
          minCoverPct > 0
            ? `GEE data covers ~${minCoverPct}% of AOI land cells. Remaining cells use DEMO_FIXTURE fallback.`
            : "No GEE data available — all cells use DEMO_FIXTURE",
      },
      summary: {
        hasRealPopulation:      geeStatus.worldpop,
        hasRealElevation:       geeStatus.nasadem,
        hasFloodObservation:    geeStatus.sentinel1,
        hasRainfallObservation: geeStatus.gpm,
        // Honest coverage status — never claim REAL_DATA unless ≥95% coverage
        overallStatus: coverageLabel === "REAL_DATA" ? "GEE_ENRICHED"
                     : coverageLabel === "MIXED"    ? "GEE_ENRICHED_MIXED"
                     : "DEMO_ONLY",
        coveragePercent: minCoverPct,
        coverageLabel,
      },
    },
    servedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
