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
      summary: {
        hasRealPopulation:  geeStatus.worldpop,
        hasRealElevation:   geeStatus.nasadem,
        hasFloodObservation: geeStatus.sentinel1,
        hasRainfallObservation: geeStatus.gpm,
        overallStatus:
          (geeStatus.worldpop && geeStatus.nasadem) ? "GEE_ENRICHED"
          : geeStatus.worldpop || geeStatus.nasadem ? "PARTIAL_GEE"
          : "DEMO_ONLY",
      },
    },
    servedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
