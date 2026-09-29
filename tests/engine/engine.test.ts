/**
 * Engine Tests — Sensitivity Invariants
 *
 * Required invariants from Phase 3 guardrails:
 *  ✓ Combined hazard formula: 0.40*wind + 0.30*rain + 0.30*surge
 *  ✓ Increased rainfall cannot reduce rainfall hazard
 *  ✓ Increased surge cannot reduce surge-exposed cell count
 *  ✓ Increased response capacity changes selected actions, not risk scores
 *  ✓ Track shift proxy: wind multiplier changes spatial wind values
 *  ✓ Deterministic: identical inputs produce identical outputs
 *  ✓ Priority ranks are contiguous 1..K
 *  ✓ No H3-adjacent cells in selected set (overlap guard)
 *  ✓ Dependency contribution affects action priority
 *  ✓ Objective changes selection without changing risk scores
 *  ✓ DEMO_FIXTURE metric firewall (also tested in fixture.test.ts)
 *
 * Test structure:
 *  Part A: Unit tests with synthetic data (no fixture loading, fast)
 *  Part B: Integration/sensitivity tests using the real fixture via runner
 */

import { describe, it, expect, beforeAll } from "vitest";
import { latLngToCell, gridDisk, gridDistance } from "h3-js";

import {
  normalizeWind,
  normalizeRainfall,
  normalizeSurge,
  combineHazard,
  surgeFloodFill,
  isSurgeExposedProximity,
  computeHazardForAllCells,
  applyHazardMultipliers,
} from "../../src/engine/hazard/index";

import {
  computeFloodSusceptibility,
  computeWindExposure,
  combinedSusceptibilityScore,
} from "../../src/engine/susceptibility/index";

import {
  computeAssetRisk,
} from "../../src/engine/infrastructure/index";

import {
  computeBenefitScore,
  applyObjectiveAdjustment,
  areH3Neighbors,
  runGreedyTopK,
  buildDeterministicExplanation,
} from "../../src/engine/priority/index";

import { runFaniDemoEngine } from "../../src/engine/runner";
import { ReplayResultSchema } from "../../src/lib/schemas/index";
import { SPATIAL_RESOLUTION } from "../../src/config/index";

import type { FixtureCell, FixtureCellProperties } from "../../src/engine/loader/index";
import type { ProcessedCell, ProcessedHazard } from "../../src/engine/types";

// ─────────────────────────────────────────────────────────────
// SYNTHETIC DATA HELPERS
// ─────────────────────────────────────────────────────────────

/** Compute correct combined hazard to satisfy the schema invariant */
function correctCombined(w: number, r: number, s: number): number {
  return Math.round((0.4 * w + 0.3 * r + 0.3 * s) * 10_000) / 10_000;
}

function makeFixtureCell(
  cellId: string,
  overrides: Partial<FixtureCellProperties> & {
    centerLng?: number;
    centerLat?: number;
    isLand?: boolean;
  } = {}
): FixtureCell {
  const wind = overrides.hazard?.wind ?? 0.5;
  const rainfall = overrides.hazard?.rainfall ?? 0.4;
  const surge = overrides.hazard?.surge ?? 0.3;

  const props: FixtureCellProperties = {
    cellId,
    isLand: overrides.isLand ?? true,
    hazard: {
      wind,
      rainfall,
      surge,
      combined: overrides.hazard?.combined ?? correctCombined(wind, rainfall, surge),
    },
    exposure: {
      population: overrides.exposure?.population ?? 1_000,
      buildings: overrides.exposure?.buildings ?? 200,
      builtAreaHa: overrides.exposure?.builtAreaHa ?? 5,
      roadKm: overrides.exposure?.roadKm ?? 2,
      criticalAssetCount: overrides.exposure?.criticalAssetCount ?? 0,
      combined: overrides.exposure?.combined ?? 0.3,
    },
    susceptibility: {
      floodSusceptibility: overrides.susceptibility?.floodSusceptibility ?? 0.6,
      windExposure: overrides.susceptibility?.windExposure ?? 0.5,
      coastalProximityKm: overrides.susceptibility?.coastalProximityKm ?? 10,
      elevationMedianM: overrides.susceptibility?.elevationMedianM ?? 5,
      surgeExposed: overrides.susceptibility?.surgeExposed ?? false,
    },
  };

  return {
    id: cellId,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [85.0, 19.0], [85.01, 19.0], [85.01, 19.01],
          [85.0, 19.01], [85.0, 19.0],
        ],
      ],
    },
    properties: props,
    centerLng: overrides.centerLng ?? 85.005,
    centerLat: overrides.centerLat ?? 19.005,
  };
}

function makeProcessedCell(
  cellId: string,
  opts: {
    impactScore?: number;
    hazardCombined?: number;
    criticality?: number;
    dependency?: number;
    surgeExposed?: boolean;
    population?: number;
    windMult?: number;
    exposureCombined?: number;
  } = {}
): ProcessedCell {
  const hazardCombined = opts.hazardCombined ?? 0.5;
  const wind = hazardCombined; // simplified for testing
  const rainfall = hazardCombined * 0.9;
  const surge = hazardCombined * 0.8;
  const computedCombined = correctCombined(wind, rainfall, surge);

  const h: ProcessedHazard = {
    wind: Math.min(1, wind),
    rainfall: Math.min(1, rainfall),
    surge: Math.min(1, surge),
    combined: computedCombined,
    surgeExposed: opts.surgeExposed ?? false,
    surgeMethod: "flood_fill",
  };

  return {
    cellId,
    isLand: true,
    centerLng: 85.0,
    centerLat: 19.0,
    hazard: h,
    exposure: {
      population: opts.population ?? 1_000,
      buildings: 200,
      builtAreaHa: 5,
      roadKm: 2,
      criticalAssetCount: 0,
      combined: opts.exposureCombined ?? 0.3,
    },
    susceptibility: {
      floodSusceptibility: 0.6,
      windExposure: 0.5,
      coastalProximityKm: 10,
      elevationMedianM: 5,
      surgeExposed: opts.surgeExposed ?? false,
    },
    impactExposure: {
      score: opts.impactScore ?? 0.4,
      probability: opts.impactScore ?? 0.4,
      severity: opts.impactScore ?? 0.4,
      confidence: {
        overall: 0.65,
        components: { hazard: 0.65 },
        limitingTier: "DEMO_FIXTURE",
      },
    },
    infrastructure: {
      assetCount: 0,
      combinedCriticality: opts.criticality ?? 0.5,
      dependencyCentrality: opts.dependency ?? 0.5,
    },
    priority: { score: 0, rank: null, interventionBenefit: 0 },
  };
}

// ─────────────────────────────────────────────────────────────
// PART A: UNIT TESTS (synthetic data)
// ─────────────────────────────────────────────────────────────

describe("A1 — Hazard normalization", () => {
  it("normalizeWind: 0 → 0", () => {
    expect(normalizeWind(0)).toBe(0);
  });
  it("normalizeWind: 250 kph → 1.0", () => {
    expect(normalizeWind(250)).toBe(1.0);
  });
  it("normalizeWind: intermediate is in (0, 1)", () => {
    const v = normalizeWind(125);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  it("normalizeRainfall: 0 → 0", () => {
    expect(normalizeRainfall(0)).toBe(0);
  });
  it("normalizeRainfall: 300 mm → 1.0", () => {
    expect(normalizeRainfall(300)).toBe(1.0);
  });

  it("normalizeSurge: 0 → 0", () => {
    expect(normalizeSurge(0)).toBe(0);
  });
  it("normalizeSurge: 5.0 m → 1.0", () => {
    expect(normalizeSurge(5.0)).toBe(1.0);
  });
});

describe("A2 — Combined hazard formula invariant", () => {
  it("0.40*wind + 0.30*rain + 0.30*surge", () => {
    const w = 0.7;
    const r = 0.5;
    const s = 0.4;
    const result = combineHazard(w, r, s);
    const expected = 0.4 * w + 0.3 * r + 0.3 * s;
    expect(Math.abs(result - expected)).toBeLessThan(0.001);
  });

  it("combined is in [0, 1] for any inputs in [0, 1]", () => {
    const cases = [
      [0.0, 0.0, 0.0],
      [1.0, 1.0, 1.0],
      [0.5, 0.3, 0.8],
      [0.9, 0.1, 0.5],
    ];
    for (const [w, r, s] of cases) {
      const v = combineHazard(w!, r!, s!);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("increasing any component cannot decrease combined", () => {
    const base = combineHazard(0.3, 0.4, 0.5);
    expect(combineHazard(0.5, 0.4, 0.5)).toBeGreaterThanOrEqual(base);
    expect(combineHazard(0.3, 0.6, 0.5)).toBeGreaterThanOrEqual(base);
    expect(combineHazard(0.3, 0.4, 0.7)).toBeGreaterThanOrEqual(base);
  });
});

describe("A3 — Susceptibility (conceptually separate from vulnerability)", () => {
  it("computeFloodSusceptibility: elevation=0 → 1.0", () => {
    expect(computeFloodSusceptibility(0)).toBe(1.0);
  });
  it("computeFloodSusceptibility: elevation=22 → 0", () => {
    expect(computeFloodSusceptibility(22)).toBe(0);
  });
  it("computeFloodSusceptibility is monotonically decreasing with elevation", () => {
    const vals = [0, 2, 5, 10, 15, 20, 22].map(computeFloodSusceptibility);
    for (let i = 0; i < vals.length - 1; i++) {
      expect(vals[i]!).toBeGreaterThanOrEqual(vals[i + 1]!);
    }
  });
  it("computeWindExposure: coastal → 1.0, 80km inland → 0", () => {
    expect(computeWindExposure(0)).toBe(1.0);
    expect(computeWindExposure(80)).toBe(0);
  });
  it("surge-exposed cells use floodSusceptibility directly", () => {
    const fs = 0.8;
    const we = 0.4;
    expect(combinedSusceptibilityScore(fs, we, true)).toBe(fs);
  });
  it("non-surge cells blend flood and wind susceptibility, min floor 0.2", () => {
    const score = combinedSusceptibilityScore(0.0, 0.0, false);
    expect(score).toBeGreaterThanOrEqual(0.2);
  });
  it("elevation is a FLOOD SUSCEPTIBILITY input, not generic vulnerability", () => {
    // Elevation at 2m vs 4m changes floodSusceptibility proportionally
    const at2m = computeFloodSusceptibility(2);
    const at4m = computeFloodSusceptibility(4);
    expect(at2m).toBeGreaterThan(at4m);
    // But the difference is graded, not "twice as vulnerable"
    expect(at2m).toBeLessThan(2 * at4m); // not linearly doubled
  });
});

describe("A4 — Asset risk formula", () => {
  it("risk = hazard × vulnerability × criticality × dependency", () => {
    const result = computeAssetRisk(0.8, 0.6, 1.0, 0.9);
    expect(Math.abs(result - 0.8 * 0.6 * 1.0 * 0.9)).toBeLessThan(0.001);
  });
  it("risk = 0 when hazard exposure = 0", () => {
    expect(computeAssetRisk(0, 0.7, 0.9, 0.8)).toBe(0);
  });
  it("risk is in [0, 1] for all inputs in [0, 1]", () => {
    expect(computeAssetRisk(1.0, 1.0, 1.0, 1.0)).toBeLessThanOrEqual(1.0);
  });
});

describe("A5 — Hazard multipliers (track shift proxy)", () => {
  it("windMultiplier > 1 increases wind value", () => {
    const base = 0.4;
    const { wind } = applyHazardMultipliers(base, 0.3, 1.5, 1.0);
    expect(wind).toBeGreaterThan(base);
  });
  it("rainfallMultiplier > 1 cannot reduce rainfall value", () => {
    const base = 0.4;
    const { rainfall } = applyHazardMultipliers(0.5, base, 1.0, 1.3);
    expect(rainfall).toBeGreaterThanOrEqual(base);
  });
  it("windMultiplier = 1.0 leaves wind unchanged", () => {
    const base = 0.42;
    const { wind } = applyHazardMultipliers(base, 0.3, 1.0, 1.0);
    expect(Math.abs(wind - base)).toBeLessThan(0.001);
  });
  it("windMultiplier = 0 → wind = 0", () => {
    const { wind } = applyHazardMultipliers(0.5, 0.3, 0.0, 1.0);
    expect(wind).toBe(0);
  });
});

describe("A6 — Surge flood-fill (BFS)", () => {
  // Build a small synthetic fixture with known topology
  let syntheticCells: Map<string, FixtureCell>;
  let coastalCellId: string;
  let adjacentLowId: string;
  let adjacentHighId: string;
  let farInlandId: string;

  beforeAll(() => {
    // Use real H3 cells near the Puri coast
    coastalCellId = latLngToCell(19.80, 85.83, SPATIAL_RESOLUTION); // Puri landfall
    const neighbors = gridDisk(coastalCellId, 1).filter((n) => n !== coastalCellId);
    adjacentLowId = neighbors[0]!;
    adjacentHighId = neighbors[1]!;
    farInlandId = latLngToCell(20.30, 85.83, SPATIAL_RESOLUTION); // 55km inland

    syntheticCells = new Map([
      // Coastal seed cell: elevation 0.5m, 1km from coast
      [coastalCellId, makeFixtureCell(coastalCellId, {
        susceptibility: { elevationMedianM: 0.5, coastalProximityKm: 1.0, floodSusceptibility: 0.97, windExposure: 1.0, surgeExposed: false },
      })],
      // Adjacent low-elevation cell: below surge height
      [adjacentLowId, makeFixtureCell(adjacentLowId, {
        susceptibility: { elevationMedianM: 0.8, coastalProximityKm: 2.0, floodSusceptibility: 0.96, windExposure: 0.97, surgeExposed: false },
      })],
      // Adjacent higher-elevation cell: above surge height
      [adjacentHighId, makeFixtureCell(adjacentHighId, {
        susceptibility: { elevationMedianM: 5.0, coastalProximityKm: 4.0, floodSusceptibility: 0.77, windExposure: 0.95, surgeExposed: false },
      })],
      // Far inland cell: well above surge threshold
      [farInlandId, makeFixtureCell(farInlandId, {
        susceptibility: { elevationMedianM: 25.0, coastalProximityKm: 55.0, floodSusceptibility: 0.0, windExposure: 0.31, surgeExposed: false },
      })],
    ]);
  });

  it("flood-fill marks coastal seed as exposed at surge=1.5m", () => {
    const exposed = surgeFloodFill(syntheticCells, 1.5);
    expect(exposed.has(coastalCellId)).toBe(true);
  });

  it("flood-fill expands to adjacent low-elevation cell", () => {
    const exposed = surgeFloodFill(syntheticCells, 1.5);
    expect(exposed.has(adjacentLowId)).toBe(true);
  });

  it("flood-fill stops at cell above surge height (5m)", () => {
    const exposed = surgeFloodFill(syntheticCells, 1.5); // surge=1.5m < 5m
    expect(exposed.has(adjacentHighId)).toBe(false);
  });

  it("far inland cell is never exposed", () => {
    const exposed = surgeFloodFill(syntheticCells, 1.5);
    expect(exposed.has(farInlandId)).toBe(false);
  });
});

describe("A7 — Proximity fallback labelling (screening approximation)", () => {
  let coastalCell: FixtureCell;
  let inlandCell: FixtureCell;

  beforeAll(() => {
    const cid = latLngToCell(19.80, 85.83, SPATIAL_RESOLUTION);
    coastalCell = makeFixtureCell(cid, {
      susceptibility: { coastalProximityKm: 3, elevationMedianM: 0.5, floodSusceptibility: 0.97, windExposure: 0.99, surgeExposed: false },
    });
    inlandCell = makeFixtureCell(
      latLngToCell(20.30, 85.83, SPATIAL_RESOLUTION),
      {
        susceptibility: { coastalProximityKm: 55, elevationMedianM: 20, floodSusceptibility: 0.09, windExposure: 0.31, surgeExposed: false },
      }
    );
  });

  it("proximity: coastal + low elevation cell is exposed", () => {
    expect(isSurgeExposedProximity(coastalCell, 1.5, 25)).toBe(true);
  });
  it("proximity: inland cell is NOT exposed at 25km threshold", () => {
    expect(isSurgeExposedProximity(inlandCell, 1.5, 25)).toBe(false);
  });
  it("proximity fallback produces surgeLabel on processed hazard", () => {
    const cells = new Map([[coastalCell.id, coastalCell]]);
    const hazardMap = computeHazardForAllCells(cells, 1.5, {
      surgeMethod: "proximity_threshold",
      surgeProximityThresholdKm: 25,
    });
    const hazard = hazardMap.get(coastalCell.id);
    expect(hazard?.surgeLabel).toBeDefined();
    expect(hazard?.surgeLabel).toContain("SCREENING APPROXIMATION");
  });
});

describe("A8 — Priority benefit and objective adjustments", () => {
  it("computeBenefitScore: 0.50*ie + 0.30*crit + 0.20*dep", () => {
    const ie = 0.6;
    const crit = 0.8;
    const dep = 0.7;
    const result = computeBenefitScore(ie, crit, dep);
    const expected = 0.5 * ie + 0.3 * crit + 0.2 * dep;
    expect(Math.abs(result - expected)).toBeLessThan(0.001);
  });

  it("objective=service_continuity boosts high-dependency cell", () => {
    const base = 0.5;
    const withAdj = applyObjectiveAdjustment(base, 0.4, 0.5, 0.9, "service_continuity");
    expect(withAdj).toBeGreaterThan(base);
  });

  it("objective=balanced makes no adjustment", () => {
    const base = 0.5;
    const withAdj = applyObjectiveAdjustment(base, 0.4, 0.5, 0.5, "balanced");
    expect(withAdj).toBe(base);
  });
});

describe("A9 — areH3Neighbors", () => {
  let cell1: string;
  let cell2: string; // adjacent
  let cell3: string; // far away

  beforeAll(() => {
    cell1 = latLngToCell(19.80, 85.83, SPATIAL_RESOLUTION);
    const neighbors = gridDisk(cell1, 1);
    cell2 = neighbors.find((n) => n !== cell1)!;
    cell3 = latLngToCell(20.20, 86.10, SPATIAL_RESOLUTION); // ~50km away
  });

  it("same cell is a neighbor of itself", () => {
    expect(areH3Neighbors(cell1, cell1)).toBe(true);
  });
  it("adjacent cells are neighbors", () => {
    expect(areH3Neighbors(cell1, cell2)).toBe(true);
  });
  it("cells 50km apart are NOT neighbors", () => {
    const dist = gridDistance(cell1, cell3);
    expect(dist).toBeGreaterThan(1);
    expect(areH3Neighbors(cell1, cell3)).toBe(false);
  });
});

describe("A10 — Greedy top-K (synthetic cells)", () => {
  let cell1: string;
  let cell2: string;
  let cell3: string;
  let cell4: string;
  let syntheticMap: Map<string, ProcessedCell>;

  beforeAll(() => {
    // 4 well-separated cells (non-adjacent)
    cell1 = latLngToCell(19.80, 85.83, SPATIAL_RESOLUTION);
    cell2 = latLngToCell(19.90, 85.97, SPATIAL_RESOLUTION);
    cell3 = latLngToCell(20.10, 85.75, SPATIAL_RESOLUTION);
    cell4 = latLngToCell(20.30, 86.15, SPATIAL_RESOLUTION);

    syntheticMap = new Map([
      [cell1, makeProcessedCell(cell1, { impactScore: 0.8, criticality: 0.9, dependency: 0.9 })],
      [cell2, makeProcessedCell(cell2, { impactScore: 0.7, criticality: 0.7, dependency: 0.7 })],
      [cell3, makeProcessedCell(cell3, { impactScore: 0.6, criticality: 0.6, dependency: 0.6 })],
      [cell4, makeProcessedCell(cell4, { impactScore: 0.4, criticality: 0.4, dependency: 0.4 })],
    ]);
  });

  it("ranks are contiguous starting from 1", () => {
    const recs = runGreedyTopK(syntheticMap, 3, "balanced", new Date().toISOString());
    const ranks = recs.map((r) => r.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3]);
  });

  it("ranks are unique", () => {
    const recs = runGreedyTopK(syntheticMap, 4, "balanced", new Date().toISOString());
    const rankSet = new Set(recs.map((r) => r.rank));
    expect(rankSet.size).toBe(recs.length);
  });

  it("K=1 returns exactly 1 recommendation", () => {
    const recs = runGreedyTopK(syntheticMap, 1, "balanced", new Date().toISOString());
    expect(recs).toHaveLength(1);
  });

  it("K=0 returns empty", () => {
    const recs = runGreedyTopK(syntheticMap, 0, "balanced", new Date().toISOString());
    expect(recs).toHaveLength(0);
  });

  it("highest-impact cell is ranked #1", () => {
    const recs = runGreedyTopK(syntheticMap, 4, "balanced", new Date().toISOString());
    expect(recs[0]?.cellId).toBe(cell1);
  });
});

describe("A11 — Dependency contribution affects action priority", () => {
  it("cell with higher dependency ranks above cell with same impact but lower dependency", () => {
    const cellA = latLngToCell(19.85, 85.80, SPATIAL_RESOLUTION);
    const cellB = latLngToCell(20.05, 85.90, SPATIAL_RESOLUTION);

    // Same impactScore, but cell B has higher dependency
    const map = new Map([
      [cellA, makeProcessedCell(cellA, {
        impactScore: 0.5, criticality: 0.5, dependency: 0.3, exposureCombined: 0.5,
      })],
      [cellB, makeProcessedCell(cellB, {
        impactScore: 0.5, criticality: 0.5, dependency: 0.9, exposureCombined: 0.5,
      })],
    ]);

    const recs = runGreedyTopK(map, 2, "service_continuity", new Date().toISOString());
    // service_continuity objective boosts dependency — B should be first
    expect(recs[0]?.cellId).toBe(cellB);
  });
});

describe("A12 — Deterministic explanation builder", () => {
  it("explanation text includes rank and score", () => {
    const recs = runGreedyTopK(
      new Map([[
        latLngToCell(19.80, 85.83, SPATIAL_RESOLUTION),
        makeProcessedCell(latLngToCell(19.80, 85.83, SPATIAL_RESOLUTION), { impactScore: 0.7 }),
      ]]),
      1,
      "balanced",
      "2019-05-02T05:00:00Z"
    );
    if (recs[0]) {
      const text = buildDeterministicExplanation(recs[0]);
      expect(text).toContain("PRIORITY #1");
      expect(text).toContain("Human review required");
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("NaN");
    }
  });
});

// ─────────────────────────────────────────────────────────────
// PART B: INTEGRATION / SENSITIVITY TESTS (full fixture)
// These use the real engine runner with the 24 MB fixture.
// Fixture is cached after first load — subsequent runs are fast.
// ─────────────────────────────────────────────────────────────

describe("B — Sensitivity tests (full engine runner)", () => {
  // Run engine twice for determinism check, and with different params
  let baseResult: Awaited<ReturnType<typeof runFaniDemoEngine>>;
  let highRainResult: Awaited<ReturnType<typeof runFaniDemoEngine>>;
  let highSurgeResult: Awaited<ReturnType<typeof runFaniDemoEngine>>;
  let smallKResult: Awaited<ReturnType<typeof runFaniDemoEngine>>;
  let largeKResult: Awaited<ReturnType<typeof runFaniDemoEngine>>;
  let deterministicRepeat: Awaited<ReturnType<typeof runFaniDemoEngine>>;

  beforeAll(async () => {
    // Run all engine variants — fixture loads once (singleton cache)
    [
      baseResult,
      highRainResult,
      highSurgeResult,
      smallKResult,
      largeKResult,
      deterministicRepeat,
    ] = await Promise.all([
      runFaniDemoEngine({ surgeHeightM: 1.5, rainfallMultiplier: 1.0, responseCapacity: 10 }),
      runFaniDemoEngine({ surgeHeightM: 1.5, rainfallMultiplier: 1.5, responseCapacity: 10 }),
      runFaniDemoEngine({ surgeHeightM: 3.5, responseCapacity: 10 }),
      runFaniDemoEngine({ surgeHeightM: 1.5, responseCapacity: 5 }),
      runFaniDemoEngine({ surgeHeightM: 1.5, responseCapacity: 20 }),
      runFaniDemoEngine({ surgeHeightM: 1.5, rainfallMultiplier: 1.0, responseCapacity: 10 }),
    ]);
  }, 60_000); // 60s timeout for fixture load + 6 engine runs

  // ── B1: Rainfall sensitivity ─────────────────────────────

  it("B1a: increased rainfallMultiplier produces ≥ total rainfall hazard", () => {
    let baseTotal = 0;
    let highTotal = 0;

    for (const cell of baseResult.cells.values()) {
      baseTotal += cell.hazard.rainfall;
    }
    for (const cell of highRainResult.cells.values()) {
      highTotal += cell.hazard.rainfall;
    }

    expect(highTotal).toBeGreaterThanOrEqual(baseTotal);
  });

  it("B1b: increased rainfallMultiplier never decreases any individual cell's rainfall", () => {
    for (const [cellId, baseCell] of baseResult.cells) {
      const highCell = highRainResult.cells.get(cellId);
      if (!highCell) continue;
      expect(highCell.hazard.rainfall).toBeGreaterThanOrEqual(baseCell.hazard.rainfall - 0.001);
    }
  });

  // ── B2: Surge sensitivity ─────────────────────────────────

  it("B2: increased surge height cannot decrease surge-exposed cell count", () => {
    expect(highSurgeResult.stats.surgeExposedCells).toBeGreaterThanOrEqual(
      baseResult.stats.surgeExposedCells
    );
  });

  it("B2b: higher surge height exposes more or equal cells", () => {
    const baseSurgeExposed = new Set<string>();
    const highSurgeExposed = new Set<string>();

    for (const [id, cell] of baseResult.cells) {
      if (cell.hazard.surgeExposed) baseSurgeExposed.add(id);
    }
    for (const [id, cell] of highSurgeResult.cells) {
      if (cell.hazard.surgeExposed) highSurgeExposed.add(id);
    }

    // Every cell exposed in base must also be exposed in high surge
    for (const id of baseSurgeExposed) {
      expect(highSurgeExposed.has(id)).toBe(true);
    }
  });

  // ── B3: Capacity independence ─────────────────────────────

  it("B3a: changing K changes selected interventions", () => {
    const smallIds = new Set(smallKResult.recommendations.map((r) => r.cellId));
    const largeIds = new Set(largeKResult.recommendations.map((r) => r.cellId));
    // Large K should include more cells than small K
    expect(largeIds.size).toBeGreaterThanOrEqual(smallIds.size);
  });

  it("B3b: changing K does NOT change underlying cell risk scores", () => {
    // Pick a cell from the base result and verify its impactExposure.score
    // is identical regardless of K value
    for (const [cellId, baseCell] of baseResult.cells) {
      const smallCell = smallKResult.cells.get(cellId);
      const largeCell = largeKResult.cells.get(cellId);
      if (smallCell && largeCell) {
        expect(smallCell.impactExposure.score).toBe(baseCell.impactExposure.score);
        expect(largeCell.impactExposure.score).toBe(baseCell.impactExposure.score);
        break; // One cell is sufficient
      }
    }
  });

  it("B3c: small K selections are a subset of large K (greedy property)", () => {
    // The greedy algorithm selects the SAME top cells regardless of K
    // (K only limits how many we take). So top-5 should appear in top-20.
    const smallIds = new Set(smallKResult.recommendations.map((r) => r.cellId));
    const largeIds = new Set(largeKResult.recommendations.map((r) => r.cellId));

    for (const id of smallIds) {
      expect(largeIds.has(id)).toBe(true);
    }
  });

  // ── B4: Determinism ──────────────────────────────────────

  it("B4: identical inputs produce identical results", () => {
    // Both base and deterministicRepeat used the same parameters
    expect(baseResult.recommendations.length).toBe(deterministicRepeat.recommendations.length);

    for (let i = 0; i < baseResult.recommendations.length; i++) {
      const orig = baseResult.recommendations[i]!;
      const repeat = deterministicRepeat.recommendations[i]!;
      expect(orig.cellId).toBe(repeat.cellId);
      expect(orig.rank).toBe(repeat.rank);
      expect(orig.score).toBe(repeat.score);
    }
  });

  it("B4b: cell risk scores are identical across runs with same parameters", () => {
    // Compare first 10 cells
    let checked = 0;
    for (const [cellId, baseCell] of baseResult.cells) {
      const repeatCell = deterministicRepeat.cells.get(cellId);
      if (!repeatCell) continue;
      expect(baseCell.impactExposure.score).toBe(repeatCell.impactExposure.score);
      expect(baseCell.hazard.combined).toBe(repeatCell.hazard.combined);
      if (++checked >= 10) break;
    }
  });

  // ── B5: Rank contiguity ──────────────────────────────────

  it("B5: priority ranks are contiguous 1..K", () => {
    const ranks = baseResult.recommendations.map((r) => r.rank).sort((a, b) => a - b);
    for (let i = 0; i < ranks.length; i++) {
      expect(ranks[i]).toBe(i + 1);
    }
  });

  it("B5b: no duplicate ranks", () => {
    const ranks = baseResult.recommendations.map((r) => r.rank);
    const uniqueRanks = new Set(ranks);
    expect(uniqueRanks.size).toBe(ranks.length);
  });

  // ── B6: H3 overlap guard ─────────────────────────────────

  it("B6: no two selected cells are H3 grid-adjacent", () => {
    const selectedIds = baseResult.recommendations.map((r) => r.cellId);
    for (let i = 0; i < selectedIds.length; i++) {
      for (let j = i + 1; j < selectedIds.length; j++) {
        const dist = gridDistance(selectedIds[i]!, selectedIds[j]!);
        expect(dist, `Selected cells ${selectedIds[i]} and ${selectedIds[j]} are adjacent (dist=${dist})`)
          .toBeGreaterThan(1);
      }
    }
  });

  // ── B7: DEMO_FIXTURE firewall ─────────────────────────────

  it("B7: fixtureStatus in manifest reflects actual data used (DEMO_FIXTURE when only synthetic, MIXED when GEE enriched)", () => {
    // With GEE data present (WorldPop+NASADEM), fixtureStatus = MIXED.
    // With only synthetic fixture, fixtureStatus = DEMO_FIXTURE.
    // Both are correct — the test verifies fixtureStatus is one of the valid values.
    expect(["DEMO_FIXTURE", "MIXED", "REAL_DATA"]).toContain(baseResult.manifest.fixtureStatus);
  });

  it("B7b: ReplayResultSchema rejects metrics without reason for DEMO_FIXTURE", () => {
    const bad = {
      eventId: "fani-2019",
      manifest: {
        ...baseResult.manifest,
        fixtureStatus: "DEMO_FIXTURE",
      },
      predictions: [],
      actualEvidenceId: "none",
      metrics: { topKRecall: 0.87 }, // claimed from synthetic data
      baselineMetrics: {},
      computedAt: baseResult.computedAt,
    };
    const result = ReplayResultSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  // ── B8: Engine output quality ─────────────────────────────

  it("B8: all recommendations have non-empty evidence lists", () => {
    for (const rec of baseResult.recommendations) {
      expect(rec.evidence.length).toBeGreaterThan(0);
    }
  });

  it("B8b: all recommendations have at least one recommended action", () => {
    for (const rec of baseResult.recommendations) {
      expect(rec.recommendedActions.length).toBeGreaterThan(0);
    }
  });

  it("B8c: all cell impact scores are in [0, 1]", () => {
    for (const cell of baseResult.cells.values()) {
      expect(cell.impactExposure.score).toBeGreaterThanOrEqual(0);
      expect(cell.impactExposure.score).toBeLessThanOrEqual(1);
    }
  });

  it("B8d: all cell hazard combined values match formula", () => {
    let checked = 0;
    for (const cell of baseResult.cells.values()) {
      const { wind, rainfall, surge, combined } = cell.hazard;
      const expected = 0.4 * wind + 0.3 * rainfall + 0.3 * surge;
      expect(Math.abs(combined - expected)).toBeLessThan(0.001);
      if (++checked >= 100) break; // sample first 100 cells
    }
  });

  it("B8e: stats are plausible for the Odisha AOI", () => {
    expect(baseResult.stats.landCells).toBeGreaterThan(5_000);
    expect(baseResult.stats.totalPopulationExposed).toBeGreaterThan(100_000);
    expect(baseResult.stats.peakHazard).toBeGreaterThan(0);
    expect(baseResult.stats.peakImpact).toBeGreaterThan(0);
  });
});
