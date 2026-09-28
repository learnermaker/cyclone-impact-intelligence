/**
 * Contract tests — validate that the Zod schemas correctly accept and reject
 * edge-case values as specified in the data quality rules.
 */

import { describe, it, expect } from "vitest";
import {
  CoordinateSchema,
  DataConfidenceSchema,
  ImpactCellSchema,
  DemoFixtureMetadataSchema,
  ReplayResultSchema,
  HazardScenarioSchema,
  validatePredictionFirewall,
  validateUniquePriorityRanks,
  validateImpactCellCollection,
  PriorityRecommendationSchema,
} from "../../src/lib/schemas/index";

// ── Coordinate ────────────────────────────────────────────────

describe("CoordinateSchema", () => {
  it("accepts valid coordinates", () => {
    expect(
      CoordinateSchema.safeParse({ latitude: 19.8, longitude: 85.83 }).success
    ).toBe(true);
  });

  it("rejects latitude > 90", () => {
    expect(
      CoordinateSchema.safeParse({ latitude: 91, longitude: 85.83 }).success
    ).toBe(false);
  });

  it("rejects longitude < -180", () => {
    expect(
      CoordinateSchema.safeParse({ latitude: 19.8, longitude: -181 }).success
    ).toBe(false);
  });
});

// ── DataConfidence ────────────────────────────────────────────

describe("DataConfidenceSchema", () => {
  it("accepts valid component confidence", () => {
    const result = DataConfidenceSchema.safeParse({
      overall: 0.74,
      components: { hazard: 0.86, surge: 0.55 },
      limitingTier: "SCENARIO",
    });
    expect(result.success).toBe(true);
  });

  it("rejects confidence outside [0, 1]", () => {
    expect(
      DataConfidenceSchema.safeParse({
        overall: 1.2,
        components: {},
        limitingTier: "MODEL_DERIVED",
      }).success
    ).toBe(false);
  });
});

// ── Hazard combined score consistency ─────────────────────────

describe("ImpactCell hazard.combined consistency", () => {
  // Build a minimal valid cell for testing the refinement
  const makeCell = (combined: number) => ({
    cellId: "88...",
    geometry: { type: "Polygon" as const, coordinates: [] },
    hazard: { wind: 0.5, rainfall: 0.4, surge: 0.3, combined },
    exposure: {
      population: 1000,
      buildings: 200,
      builtAreaHa: 5,
      roadKm: 2,
      criticalAssetCount: 1,
      combined: 0.5,
    },
    susceptibility: {
      floodSusceptibility: 0.6,
      windExposure: 0.4,
      coastalProximityKm: 8,
      elevationMedianM: 3,
      surgeExposed: true,
    },
    impactExposure: {
      score: 0.5,
      probability: 0.5,
      severity: 0.5,
      confidence: {
        overall: 0.7,
        components: { hazard: 0.8, surge: 0.55 },
        limitingTier: "SCENARIO" as const,
      },
    },
    infrastructure: {
      assetCount: 2,
      combinedCriticality: 0.85,
      dependencyCentrality: 0.6,
    },
    priority: { score: 0.7, rank: 1, interventionBenefit: 0.65 },
    provenance: {
      sources: [
        {
          id: "test-source",
          tier: "DEMO_FIXTURE" as const,
          description: "test",
        },
      ],
      engineVersion: "0.1.0",
      computedAt: "2019-05-02T05:00:00Z",
    },
  });

  it("accepts correct combined = 0.40*0.5 + 0.30*0.4 + 0.30*0.3 = 0.41", () => {
    const cell = makeCell(0.41);
    const result = ImpactCellSchema.safeParse(cell);
    expect(result.success).toBe(true);
  });

  it("rejects combined that does not match formula", () => {
    const cell = makeCell(0.99); // wrong value
    const result = ImpactCellSchema.safeParse(cell);
    expect(result.success).toBe(false);
  });
});

// ── Information firewall ──────────────────────────────────────

describe("validatePredictionFirewall", () => {
  const cutoff = "2019-05-02T05:00:00Z";

  it("passes for sources with referenceDate before cutoff", () => {
    const { valid } = validatePredictionFirewall(cutoff, [
      {
        id: "worldpop-2019",
        tier: "AUTHORITATIVE_OPEN",
        description: "WorldPop 2019",
        referenceDate: "2019-01-01T00:00:00Z",
      },
    ]);
    expect(valid).toBe(true);
  });

  it("fails when a source has referenceDate after cutoff", () => {
    const { valid, errors } = validatePredictionFirewall(cutoff, [
      {
        id: "post-event-sentinel",
        tier: "AUTHORITATIVE_OPEN",
        description: "Post-event SAR",
        referenceDate: "2019-05-05T00:00:00Z", // after landfall
      },
    ]);
    expect(valid).toBe(false);
    expect(errors[0]).toContain("post-event-sentinel");
  });
});

// ── Unique priority ranks ─────────────────────────────────────

describe("validateUniquePriorityRanks", () => {
  const makeRec = (rank: number) =>
    PriorityRecommendationSchema.parse({
      rank,
      cellId: `cell-${rank}`,
      score: 0.5,
      expectedBenefit: 0.5,
      drivers: {
        hazard: 0.5,
        exposure: 0.5,
        susceptibility: 0.5,
        criticality: 0.8,
        dependencyCentrality: 0.6,
      },
      recommendedActions: ["Pre-position team"],
      evidence: [],
      confidence: {
        overall: 0.7,
        components: {},
        limitingTier: "MODEL_DERIVED" as const,
      },
      provenance: {
        engineVersion: "0.1.0",
        generatedAt: "2019-05-02T05:00:00Z",
        objective: "balanced" as const,
        responseCapacity: 10,
      },
    });

  it("passes for contiguous ranks [1, 2, 3]", () => {
    expect(() =>
      validateUniquePriorityRanks([makeRec(1), makeRec(2), makeRec(3)])
    ).not.toThrow();
  });

  it("throws for duplicate rank", () => {
    expect(() =>
      validateUniquePriorityRanks([makeRec(1), makeRec(1)])
    ).toThrow();
  });
});

// ── DemoFixtureMetadata ───────────────────────────────────────

describe("DemoFixtureMetadataSchema", () => {
  it("accepts valid demo fixture metadata", () => {
    const result = DemoFixtureMetadataSchema.safeParse({
      dataStatus: "DEMO_FIXTURE",
      historicalEventReference: "Cyclone Fani 2019",
      synthetic: true,
      description: "Synthetic Fani fixture for development",
      evaluationWarning:
        "SYNTHETIC — DO NOT use to generate claimed historical accuracy metrics",
      parameterBasis: ["IMD RSMC post-event report 2019"],
      createdAt: "2026-09-28T00:00:00Z",
      version: "0.1.0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects synthetic=false", () => {
    const result = DemoFixtureMetadataSchema.safeParse({
      dataStatus: "DEMO_FIXTURE",
      historicalEventReference: "Cyclone Fani 2019",
      synthetic: false, // must be true
      description: "test",
      evaluationWarning:
        "SYNTHETIC — DO NOT use to generate claimed historical accuracy metrics",
      parameterBasis: ["source"],
      createdAt: "2026-09-28T00:00:00Z",
      version: "0.1.0",
    });
    expect(result.success).toBe(false);
  });
});

// ── ReplayResult DEMO_FIXTURE firewall ─────────────────────────

describe("ReplayResultSchema — DEMO_FIXTURE metric firewall", () => {
  const baseManifest = {
    manifestId: "test-1",
    event: "fani-2019",
    cutoffAt: "2019-05-02T05:00:00Z",
    engineVersion: "0.1.0",
    dataVersion: "0.1.0-demo",
    parametersVersion: "0.1.0",
    fixtureStatus: "DEMO_FIXTURE" as const,
    sources: [
      { id: "s1", tier: "DEMO_FIXTURE" as const, description: "test source" },
    ],
    generatedAt: "2026-09-28T00:00:00Z",
  };

  it("accepts DEMO_FIXTURE result with metrics absent and reason set", () => {
    const result = ReplayResultSchema.safeParse({
      eventId: "fani-2019",
      manifest: baseManifest,
      predictions: [],
      actualEvidenceId: "placeholder",
      metrics: {},
      baselineMetrics: {},
      computedAt: "2026-09-28T00:00:00Z",
      metricsUnavailableReason:
        "Synthetic fixture — metrics require real Copernicus validation data",
    });
    expect(result.success).toBe(true);
  });

  it("rejects DEMO_FIXTURE result with topKRecall and no reason", () => {
    const result = ReplayResultSchema.safeParse({
      eventId: "fani-2019",
      manifest: baseManifest,
      predictions: [],
      actualEvidenceId: "placeholder",
      metrics: { topKRecall: 0.87 }, // claimed metric from synthetic data
      baselineMetrics: {},
      computedAt: "2026-09-28T00:00:00Z",
      // metricsUnavailableReason absent — should fail
    });
    expect(result.success).toBe(false);
  });
});
