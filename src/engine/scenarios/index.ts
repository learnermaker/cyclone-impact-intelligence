/**
 * Scenario Engine
 *
 * Applies user-defined scenario overrides to a base HazardScenario
 * and produces a modified scenario for what-if analysis.
 *
 * IMPORTANT: every scenario output carries label:
 *   "SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST"
 *
 * Scenario adjustments are bounded by SCENARIO_BOUNDS in config.
 */

import type { HazardScenario, Scenario } from "@/lib/types/index";
import { SCENARIO_BOUNDS, DEMO_SCENARIO_PRESET } from "@/config/index";

/**
 * Apply scenario overrides to a base HazardScenario.
 * Returns a new HazardScenario with SCENARIO tier and display label.
 */
export function applyScenarioOverrides(
  base: HazardScenario,
  overrides: Scenario["hazardOverrides"]
): HazardScenario {
  if (!overrides) return base;

  const windKph =
    base.cyclone.maxWindKph * (overrides.windMultiplier ?? 1.0);
  const rainfall24h =
    base.rainfall.forecast24hMm * (overrides.rainfallMultiplier ?? 1.0);
  const rainfall48h =
    base.rainfall.forecast48hMm * (overrides.rainfallMultiplier ?? 1.0);
  const surgeHeight = overrides.surgeHeightM ?? base.surge.heightM;

  return {
    ...base,
    cyclone: {
      ...base.cyclone,
      maxWindKph: clampScenarioWind(windKph),
    },
    rainfall: {
      ...base.rainfall,
      forecast24hMm: Math.max(0, rainfall24h),
      forecast48hMm: Math.max(0, rainfall48h),
    },
    surge: {
      ...base.surge,
      heightM: clampScenarioSurge(surgeHeight),
      source: "scenario" as const,
    },
    displayLabel: "SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST",
    tier: "SCENARIO",
  };
}

function clampScenarioWind(windKph: number): number {
  const { min, max } = SCENARIO_BOUNDS.windMultiplier;
  // Apply reasonable absolute bounds
  return Math.max(0, Math.min(300, windKph));
}

function clampScenarioSurge(surgeM: number): number {
  return Math.max(SCENARIO_BOUNDS.surgeHeightM.min, Math.min(SCENARIO_BOUNDS.surgeHeightM.max, surgeM));
}

/**
 * Build a demo Bay of Bengal scenario (not Fani) as a HazardScenario.
 */
export function buildDemoScenario(): HazardScenario {
  const p = DEMO_SCENARIO_PRESET;
  return {
    eventId: p.eventId,
    source: {
      id: "demo-scenario",
      tier: "DEMO_FIXTURE",
      description: "Pre-configured Bay of Bengal demonstration scenario",
    },
    issuedAt: new Date().toISOString(),
    cyclone: {
      name: p.name,
      ...p.cyclone,
    },
    forecast: {
      track: [
        { latitude: p.cyclone.latitude, longitude: p.cyclone.longitude },
        { latitude: 18.5, longitude: 86.0 },
        { latitude: 19.8, longitude: 85.83 },
      ],
      uncertaintyRadiusKm: 60,
    },
    rainfall: {
      ...p.rainfall,
      source: {
        id: "demo-scenario-rainfall",
        tier: "DEMO_FIXTURE",
        description: "Synthetic rainfall for demo scenario",
      },
    },
    surge: {
      ...p.surge,
      modelMethod: "proximity_threshold",
      confidence: 0.5,
    },
    displayLabel: "DEMO SCENARIO — SIMULATED ONLY",
    tier: "DEMO_FIXTURE",
  };
}
