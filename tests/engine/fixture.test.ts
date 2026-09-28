/**
 * Fixture Contract Tests
 *
 * Validates that the committed Fani demo fixture satisfies all invariants:
 *   1. metadata.json validates against DemoFixtureMetadataSchema
 *   2. hazard_scenario.json validates against HazardScenarioSchema
 *   3. cells.geojson has correct structure, H3 resolution 8, and valid ranges
 *   4. All synthetic formulas produce values in the expected bounds
 *   5. DEMO_FIXTURE metric firewall: no evaluation metrics can be generated
 *   6. Information firewall: no source has referenceDate after prediction cutoff
 *   7. Infrastructure fixture has no negative exposure values
 *
 * These tests run offline (no network) and verify the static committed fixture.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getResolution, isValidCell } from "h3-js";

import {
  DemoFixtureMetadataSchema,
  HazardScenarioSchema,
  ReplayResultSchema,
  validatePredictionFirewall,
} from "../../src/lib/schemas/index";

// ─────────────────────────────────────────────────────────────
// FIXTURE LOADING
// ─────────────────────────────────────────────────────────────

const FIXTURE_DIR = join(process.cwd(), "data", "fixtures", "fani-demo");
const PREDICTION_CUTOFF = "2019-05-02T05:00:00Z";

// Sample size for per-cell validation (avoids parsing all 43k cells in full)
const SAMPLE_SIZE = 500;

type CellFeature = {
  type: "Feature";
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties: {
    cellId: string;
    isLand: boolean;
    hazard: { wind: number; rainfall: number; surge: number; combined: number };
    exposure: {
      population: number;
      buildings: number;
      builtAreaHa: number;
      roadKm: number;
      criticalAssetCount: number;
      combined: number;
    };
    susceptibility: {
      floodSusceptibility: number;
      windExposure: number;
      coastalProximityKm: number;
      elevationMedianM: number;
      surgeExposed: boolean;
    };
  };
};

type GeoJSONFixture = {
  type: string;
  name: string;
  metadata: Record<string, unknown>;
  features: CellFeature[];
};

let metadata: Record<string, unknown>;
let hazardScenario: Record<string, unknown>;
let cellsGeojson: GeoJSONFixture;
let sampleCells: CellFeature[];
let landCells: CellFeature[];
let infrastructure: { _metadata: Record<string, unknown>; assets: unknown[] };

beforeAll(() => {
  metadata = JSON.parse(
    readFileSync(join(FIXTURE_DIR, "metadata.json"), "utf-8")
  );
  hazardScenario = JSON.parse(
    readFileSync(join(FIXTURE_DIR, "hazard_scenario.json"), "utf-8")
  );
  cellsGeojson = JSON.parse(
    readFileSync(join(FIXTURE_DIR, "cells.geojson"), "utf-8")
  );
  infrastructure = JSON.parse(
    readFileSync(join(FIXTURE_DIR, "infrastructure.json"), "utf-8")
  );

  landCells = cellsGeojson.features.filter((f) => f.properties.isLand);

  // Deterministic sample: every Nth feature spread across the full dataset
  const step = Math.floor(cellsGeojson.features.length / SAMPLE_SIZE);
  sampleCells = cellsGeojson.features
    .filter((_, i) => i % step === 0)
    .slice(0, SAMPLE_SIZE);
});

// ─────────────────────────────────────────────────────────────
// 1. METADATA SCHEMA
// ─────────────────────────────────────────────────────────────

describe("metadata.json — DemoFixtureMetadataSchema", () => {
  it("validates against DemoFixtureMetadataSchema", () => {
    const result = DemoFixtureMetadataSchema.safeParse(metadata);
    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it("has dataStatus = DEMO_FIXTURE", () => {
    expect(metadata.dataStatus).toBe("DEMO_FIXTURE");
  });

  it("has synthetic = true", () => {
    expect(metadata.synthetic).toBe(true);
  });

  it("has the exact evaluationWarning literal", () => {
    expect(metadata.evaluationWarning).toBe(
      "SYNTHETIC — DO NOT use to generate claimed historical accuracy metrics"
    );
  });

  it("references Cyclone Fani 2019", () => {
    expect(metadata.historicalEventReference).toBe("Cyclone Fani 2019");
  });
});

// ─────────────────────────────────────────────────────────────
// 2. HAZARD SCENARIO SCHEMA
// ─────────────────────────────────────────────────────────────

describe("hazard_scenario.json — HazardScenarioSchema", () => {
  it("validates against HazardScenarioSchema", () => {
    const result = HazardScenarioSchema.safeParse(hazardScenario);
    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it("is tagged as DEMO_FIXTURE tier", () => {
    expect(hazardScenario.tier).toBe("DEMO_FIXTURE");
  });

  it("has HISTORICAL_REPLAY display label", () => {
    expect(hazardScenario.displayLabel).toBe(
      "HISTORICAL REPLAY — PRE-EVENT RECONSTRUCTION"
    );
  });

  it("issuedAt is at or before the prediction cutoff", () => {
    const issued = new Date(hazardScenario.issuedAt as string);
    const cutoff = new Date(PREDICTION_CUTOFF);
    expect(issued.getTime()).toBeLessThanOrEqual(cutoff.getTime());
  });

  it("surge.source is scenario (not official at T-24h)", () => {
    const s = hazardScenario as { surge: { source: string } };
    expect(s.surge.source).toBe("scenario");
  });

  it("forecast track has ≥ 4 points", () => {
    const s = hazardScenario as { forecast: { track: unknown[] } };
    expect(s.forecast.track.length).toBeGreaterThanOrEqual(4);
  });

  it("passes prediction firewall — no source after cutoff", () => {
    const s = hazardScenario as {
      source: { referenceDate?: string };
      rainfall: { source: { referenceDate?: string } };
    };
    const sources = [s.source, s.rainfall.source];
    const { valid, errors } = validatePredictionFirewall(PREDICTION_CUTOFF, sources);
    expect(valid, errors.join("; ")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. CELLS.GEOJSON — STRUCTURE
// ─────────────────────────────────────────────────────────────

describe("cells.geojson — structure", () => {
  it("is a GeoJSON FeatureCollection", () => {
    expect(cellsGeojson.type).toBe("FeatureCollection");
  });

  it("metadata header carries DEMO_FIXTURE tag", () => {
    const m = cellsGeojson.metadata as { dataStatus: string; synthetic: boolean };
    expect(m.dataStatus).toBe("DEMO_FIXTURE");
    expect(m.synthetic).toBe(true);
  });

  it("contains a substantial number of features", () => {
    // Natural H3 res-8 count for Odisha coastal zone is thousands, not 300-500
    expect(cellsGeojson.features.length).toBeGreaterThan(10_000);
  });

  it("has meaningful land cell coverage", () => {
    expect(landCells.length).toBeGreaterThan(5_000);
  });

  it("has surge-exposed cells in the coastal band", () => {
    const surgeCount = cellsGeojson.features.filter(
      (f) => f.properties.susceptibility.surgeExposed
    ).length;
    expect(surgeCount).toBeGreaterThan(100);
    expect(surgeCount).toBeLessThan(5_000);
  });

  it("evaluationWarning survives JSON round-trip", () => {
    const m = cellsGeojson.metadata as { evaluationWarning: string };
    expect(m.evaluationWarning).toContain("SYNTHETIC");
  });
});

// ─────────────────────────────────────────────────────────────
// 4. H3 RESOLUTION VALIDATION
// ─────────────────────────────────────────────────────────────

describe("cells.geojson — H3 resolution 8", () => {
  it("all sampled cells have valid H3 cell IDs", () => {
    for (const cell of sampleCells) {
      expect(isValidCell(cell.id), `Invalid H3 index: ${cell.id}`).toBe(true);
    }
  });

  it("all sampled cells are exactly at resolution 8", () => {
    for (const cell of sampleCells) {
      const res = getResolution(cell.id);
      expect(res, `Cell ${cell.id} has resolution ${res}`).toBe(8);
    }
  });

  it("cellId property matches the feature id", () => {
    for (const cell of sampleCells) {
      expect(cell.properties.cellId).toBe(cell.id);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 5. PROPERTY VALUE BOUNDS
// ─────────────────────────────────────────────────────────────

describe("cells.geojson — property value invariants", () => {
  it("all hazard components are in [0, 1]", () => {
    for (const cell of sampleCells) {
      const { wind, rainfall, surge, combined } = cell.properties.hazard;
      expect(wind).toBeUnitInterval();
      expect(rainfall).toBeUnitInterval();
      expect(surge).toBeUnitInterval();
      expect(combined).toBeUnitInterval();
    }
  });

  it("hazard.combined = 0.40*wind + 0.30*rain + 0.30*surge ±0.01", () => {
    for (const cell of sampleCells) {
      const { wind, rainfall, surge, combined } = cell.properties.hazard;
      const expected = 0.40 * wind + 0.30 * rainfall + 0.30 * surge;
      expect(
        Math.abs(combined - expected),
        `Cell ${cell.id}: combined=${combined}, expected≈${expected.toFixed(4)}`
      ).toBeLessThan(0.011);
    }
  });

  it("all exposure values are non-negative", () => {
    for (const cell of sampleCells) {
      const e = cell.properties.exposure;
      expect(e.population).toBeGreaterThanOrEqual(0);
      expect(e.buildings).toBeGreaterThanOrEqual(0);
      expect(e.builtAreaHa).toBeGreaterThanOrEqual(0);
      expect(e.roadKm).toBeGreaterThanOrEqual(0);
      expect(e.combined).toBeUnitInterval();
    }
  });

  it("ocean cells have zero population and zero road km", () => {
    const oceanSample = sampleCells.filter((c) => !c.properties.isLand).slice(0, 50);
    for (const cell of oceanSample) {
      expect(cell.properties.exposure.population).toBe(0);
      expect(cell.properties.exposure.roadKm).toBe(0);
    }
  });

  it("susceptibility scores are in [0, 1]", () => {
    for (const cell of sampleCells) {
      const s = cell.properties.susceptibility;
      expect(s.floodSusceptibility).toBeUnitInterval();
      expect(s.windExposure).toBeUnitInterval();
    }
  });

  it("land cells have non-negative elevation", () => {
    const landSample = sampleCells.filter((c) => c.properties.isLand);
    for (const cell of landSample) {
      expect(cell.properties.susceptibility.elevationMedianM).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 6. SPATIAL PATTERN CHECKS (determinism proxies)
// ─────────────────────────────────────────────────────────────

describe("cells.geojson — spatial patterns", () => {
  it("cells near the Fani track have high wind values", () => {
    const highWind = cellsGeojson.features.filter(
      (f) => f.properties.isLand && f.properties.hazard.wind > 0.6
    );
    // Should be many cells near the track
    expect(highWind.length).toBeGreaterThan(100);
  });

  it("coastal cells have higher flood susceptibility than inland cells", () => {
    const coastal = sampleCells.filter(
      (c) => c.properties.isLand && c.properties.susceptibility.coastalProximityKm < 10
    );
    const inland = sampleCells.filter(
      (c) => c.properties.isLand && c.properties.susceptibility.coastalProximityKm > 50
    );

    if (coastal.length === 0 || inland.length === 0) return;

    const avgCoastalSusc =
      coastal.reduce((s, c) => s + c.properties.susceptibility.floodSusceptibility, 0) /
      coastal.length;
    const avgInlandSusc =
      inland.reduce((s, c) => s + c.properties.susceptibility.floodSusceptibility, 0) /
      inland.length;

    expect(avgCoastalSusc).toBeGreaterThan(avgInlandSusc);
  });

  it("same cell ID always produces the same values (determinism)", () => {
    // Re-read and check first land cell
    const reread = JSON.parse(
      readFileSync(join(FIXTURE_DIR, "cells.geojson"), "utf-8")
    ) as GeoJSONFixture;

    const original = cellsGeojson.features[0];
    const rereaded = reread.features[0];

    expect(original?.id).toBe(rereaded?.id);
    expect(original?.properties.hazard.combined).toBe(
      rereaded?.properties.hazard.combined
    );
  });
});

// ─────────────────────────────────────────────────────────────
// 7. DEMO_FIXTURE METRIC FIREWALL
// ─────────────────────────────────────────────────────────────

describe("DEMO_FIXTURE metric firewall", () => {
  it("ReplayResultSchema REJECTS claimed metrics from synthetic data", () => {
    const badResult = {
      eventId: "fani-2019",
      manifest: {
        manifestId: "fw-test-1",
        event: "fani-2019",
        cutoffAt: PREDICTION_CUTOFF,
        engineVersion: "0.1.0",
        dataVersion: "0.1.0-demo",
        parametersVersion: "0.1.0",
        fixtureStatus: "DEMO_FIXTURE",
        sources: [{ id: "s1", tier: "DEMO_FIXTURE", description: "test" }],
        generatedAt: "2026-09-28T00:00:00Z",
      },
      predictions: [],
      actualEvidenceId: "placeholder",
      metrics: { topKRecall: 0.87 }, // claimed from synthetic data — must be rejected
      baselineMetrics: {},
      computedAt: "2026-09-28T00:00:00Z",
      // no metricsUnavailableReason — should fail
    };
    expect(ReplayResultSchema.safeParse(badResult).success).toBe(false);
  });

  it("ReplayResultSchema ACCEPTS DEMO_FIXTURE with metricsUnavailableReason", () => {
    const goodResult = {
      eventId: "fani-2019",
      manifest: {
        manifestId: "fw-test-2",
        event: "fani-2019",
        cutoffAt: PREDICTION_CUTOFF,
        engineVersion: "0.1.0",
        dataVersion: "0.1.0-demo",
        parametersVersion: "0.1.0",
        fixtureStatus: "DEMO_FIXTURE",
        sources: [{ id: "s1", tier: "DEMO_FIXTURE", description: "test" }],
        generatedAt: "2026-09-28T00:00:00Z",
      },
      predictions: [],
      actualEvidenceId: "placeholder",
      metrics: {},
      baselineMetrics: {},
      computedAt: "2026-09-28T00:00:00Z",
      metricsUnavailableReason:
        "Synthetic fixture — metrics require real Copernicus EMSR357 validation data",
    };
    expect(ReplayResultSchema.safeParse(goodResult).success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 8. INFRASTRUCTURE FIXTURE
// ─────────────────────────────────────────────────────────────

describe("infrastructure.json — invariants", () => {
  it("has at least 10 curated assets", () => {
    expect(infrastructure.assets.length).toBeGreaterThanOrEqual(10);
  });

  it("all assets have non-negative exposure values", () => {
    for (const asset of infrastructure.assets as Array<{
      exposure: { hazard: number; population: number };
      risk: number;
    }>) {
      expect(asset.exposure.hazard).toBeGreaterThanOrEqual(0);
      expect(asset.exposure.population).toBeGreaterThanOrEqual(0);
      expect(asset.risk).toBeGreaterThanOrEqual(0);
    }
  });

  it("all criticality values are in [0, 1]", () => {
    for (const asset of infrastructure.assets as Array<{ criticality: number }>) {
      expect(asset.criticality).toBeUnitInterval();
    }
  });

  it("all vulnerability values are in [0, 1]", () => {
    for (const asset of infrastructure.assets as Array<{ vulnerability: number }>) {
      expect(asset.vulnerability).toBeUnitInterval();
    }
  });

  it("has hospitals with criticality = 1.0", () => {
    const hospitals = (
      infrastructure.assets as Array<{ type: string; criticality: number }>
    ).filter((a) => a.type === "hospital");
    expect(hospitals.length).toBeGreaterThan(0);
    expect(hospitals.some((h) => h.criticality === 1.0)).toBe(true);
  });

  it("infrastructure metadata carries DEMO_FIXTURE marker", () => {
    expect(
      (infrastructure._metadata as { dataStatus: string }).dataStatus
    ).toBe("DEMO_FIXTURE");
  });
});
