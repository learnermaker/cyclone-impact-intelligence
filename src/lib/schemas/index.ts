/**
 * Cyclone Impact Intelligence — Runtime Validation Schemas (Zod 4)
 *
 * These schemas are the runtime enforcement of the canonical type contracts.
 * Every engine input and output must pass through the appropriate schema.
 *
 * Data quality rules enforced here (from 02_DATA_CATALOG.md):
 *  - No negative population, buildings, or road lengths
 *  - No impossible coordinates
 *  - Risk and confidence values must be in [0, 1]
 *  - Provenance must be present and non-empty
 *  - DemoFixtureMetadata.synthetic must be true
 *  - Priority ranks must be unique within a collection
 *  - Prediction records must not carry post-event actual timestamps
 *
 * Usage:
 *   import { ImpactCellSchema } from "@schemas/index";
 *   const cell = ImpactCellSchema.parse(rawInput); // throws ZodError if invalid
 *   const result = ImpactCellSchema.safeParse(rawInput); // returns { success, data | error }
 */

import { z } from "zod";
import {
  INFRASTRUCTURE_ASSET_TYPES,
  type SourceTier,
} from "../types/index";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** [0, 1] inclusive — used for all normalized scores */
const unitInterval = () =>
  z.number().min(0, "Must be ≥ 0").max(1, "Must be ≤ 1");

/** Non-empty string */
const nonEmptyString = () => z.string().min(1, "Must not be empty");

/** ISO 8601 timestamp string */
const isoTimestamp = () =>
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      "Must be ISO 8601 timestamp (e.g. 2019-05-03T00:00:00Z)"
    );

/** Non-negative number — rejects negative exposure values */
const nonNegativeNumber = () =>
  z.number().min(0, "Exposure values must be non-negative");

// ─────────────────────────────────────────────────────────────
// 1. PRIMITIVES
// ─────────────────────────────────────────────────────────────

export const CoordinateSchema = z.object({
  latitude: z
    .number()
    .min(-90, "Latitude must be ≥ -90")
    .max(90, "Latitude must be ≤ 90"),
  longitude: z
    .number()
    .min(-180, "Longitude must be ≥ -180")
    .max(180, "Longitude must be ≤ 180"),
});

export const TimeWindowSchema = z.object({
  start: isoTimestamp(),
  end: isoTimestamp(),
}).refine(
  (tw) => new Date(tw.end) > new Date(tw.start),
  "TimeWindow end must be after start"
);

export const GeoJSONGeometrySchema = z.object({
  type: z.enum([
    "Point",
    "Polygon",
    "MultiPolygon",
    "LineString",
    "MultiLineString",
  ]),
  coordinates: z.unknown(),
});

// ─────────────────────────────────────────────────────────────
// 2. SOURCE HIERARCHY & PROVENANCE
// ─────────────────────────────────────────────────────────────

export const SourceTierSchema: z.ZodType<SourceTier> = z.enum([
  "OFFICIAL",
  "AUTHORITATIVE_OPEN",
  "MODEL_DERIVED",
  "SCENARIO",
  "DEMO_FIXTURE",
]);

export const SourceRefSchema = z.object({
  id: nonEmptyString(),
  tier: SourceTierSchema,
  description: nonEmptyString(),
  referenceDate: isoTimestamp().optional(),
  processedAt: isoTimestamp().optional(),
  license: z.string().optional(),
  url: z.string().url("Must be a valid URL").optional(),
});

export const DataConfidenceSchema = z
  .object({
    overall: unitInterval(),
    components: z
      .object({
        hazard: unitInterval().optional(),
        population: unitInterval().optional(),
        buildings: unitInterval().optional(),
        infrastructure: unitInterval().optional(),
        surge: unitInterval().optional(),
        rainfall: unitInterval().optional(),
        elevation: unitInterval().optional(),
      })
      .strict(),
    limitingTier: SourceTierSchema,
    dataFreshnessAt: isoTimestamp().optional(),
    notes: z.array(z.string()).optional(),
  })
  .refine(
    (dc) => {
      // overall confidence cannot exceed the maximum component confidence
      const componentValues = Object.values(dc.components).filter(
        (v): v is number => v !== undefined
      );
      if (componentValues.length === 0) return true;
      const maxComponent = Math.max(...componentValues);
      return dc.overall <= maxComponent + 0.05; // 5% tolerance for rounding
    },
    {
      message:
        "Overall confidence should not significantly exceed any component confidence",
      path: ["overall"],
    }
  );

// ─────────────────────────────────────────────────────────────
// 3. HAZARD SCENARIO
// ─────────────────────────────────────────────────────────────

export const SurgeModelMethodSchema = z.enum([
  "flood_fill",
  "proximity_threshold",
  "official",
]);

export const HazardScenarioSchema = z.object({
  eventId: nonEmptyString(),
  source: SourceRefSchema,
  issuedAt: isoTimestamp(),

  cyclone: z.object({
    name: z.string().optional(),
    latitude: CoordinateSchema.shape.latitude,
    longitude: CoordinateSchema.shape.longitude,
    maxWindKph: z.number().min(0, "Wind speed must be non-negative"),
    pressureHpa: z
      .number()
      .min(800, "Pressure unrealistically low")
      .max(1050, "Pressure unrealistically high")
      .optional(),
    movementKph: z.number().min(0).optional(),
    movementDirectionDeg: z.number().min(0).max(360).optional(),
    category: z.string().optional(),
  }),

  forecast: z.object({
    track: z
      .array(CoordinateSchema)
      .min(1, "Track must have at least one point"),
    uncertaintyRadiusKm: z.number().min(0).optional(),
    landfallWindow: TimeWindowSchema.optional(),
  }),

  rainfall: z.object({
    forecast24hMm: nonNegativeNumber(),
    forecast48hMm: nonNegativeNumber(),
    anomalyRatio: z.number().optional(),
    source: SourceRefSchema,
  }),

  surge: z.object({
    heightM: z.number().min(0).max(20, "Surge height > 20m is unrealistic"),
    source: z.enum(["official", "scenario"]),
    modelMethod: SurgeModelMethodSchema,
    proximityThresholdKm: z.number().min(0).optional(),
    confidence: unitInterval().optional(),
  }),

  displayLabel: z.enum([
    "OFFICIAL FORECAST",
    "SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST",
    "DEMO SCENARIO — SIMULATED ONLY",
    "HISTORICAL REPLAY — PRE-EVENT RECONSTRUCTION",
  ]),

  tier: SourceTierSchema,
});

// ─────────────────────────────────────────────────────────────
// 4. IMPACT CELL
// ─────────────────────────────────────────────────────────────

export const SusceptibilitySchema = z.object({
  floodSusceptibility: unitInterval(),
  windExposure: unitInterval(),
  coastalProximityKm: nonNegativeNumber(),
  elevationMedianM: z.number(), // Can be negative (below sea level)
  surgeExposed: z.boolean(),
});

export const ImpactCellSchema = z
  .object({
    cellId: nonEmptyString(),
    geometry: GeoJSONGeometrySchema,

    hazard: z.object({
      wind: unitInterval(),
      rainfall: unitInterval(),
      surge: unitInterval(),
      combined: unitInterval(),
    }),

    exposure: z
      .object({
        population: nonNegativeNumber(),
        buildings: nonNegativeNumber(),
        builtAreaHa: nonNegativeNumber(),
        roadKm: nonNegativeNumber(),
        criticalAssetCount: z
          .number()
          .int()
          .min(0, "Asset count must be non-negative"),
        combined: unitInterval(),
      })
      .refine(
        (e) => e.population >= 0 && e.buildings >= 0 && e.roadKm >= 0,
        "All exposure values must be non-negative"
      ),

    susceptibility: SusceptibilitySchema,

    impactExposure: z.object({
      score: unitInterval(),
      probability: unitInterval(),
      severity: unitInterval(),
      confidence: DataConfidenceSchema,
    }),

    infrastructure: z.object({
      assetCount: z.number().int().min(0),
      combinedCriticality: unitInterval(),
      dependencyCentrality: unitInterval(),
    }),

    priority: z.object({
      score: unitInterval(),
      rank: z.number().int().min(1).nullable(),
      interventionBenefit: unitInterval(),
    }),

    provenance: z.object({
      sources: z.array(SourceRefSchema).min(1, "At least one source required"),
      engineVersion: nonEmptyString(),
      computedAt: isoTimestamp(),
    }),
  })
  .refine(
    // Combined hazard must be consistent with components
    (cell) => {
      const expected =
        0.4 * cell.hazard.wind +
        0.3 * cell.hazard.rainfall +
        0.3 * cell.hazard.surge;
      return Math.abs(cell.hazard.combined - expected) < 0.01;
    },
    {
      message:
        "hazard.combined must equal 0.40*wind + 0.30*rainfall + 0.30*surge (±0.01)",
      path: ["hazard", "combined"],
    }
  );

// ─────────────────────────────────────────────────────────────
// 5. INFRASTRUCTURE ASSET
// ─────────────────────────────────────────────────────────────

export const InfrastructureAssetTypeSchema = z.enum(INFRASTRUCTURE_ASSET_TYPES);

export const InfrastructureAssetSchema = z.object({
  assetId: nonEmptyString(),
  name: z.string().optional(),
  type: InfrastructureAssetTypeSchema,
  geometry: GeoJSONGeometrySchema,
  criticality: unitInterval(),
  vulnerability: unitInterval(),

  exposure: z.object({
    hazard: unitInterval(),
    population: nonNegativeNumber(),
  }),

  dependencyCentrality: unitInterval(),

  risk: unitInterval(),
  confidence: DataConfidenceSchema,

  provenance: z.object({
    source: SourceRefSchema,
    referenceDate: isoTimestamp().optional(),
    processingDate: isoTimestamp(),
  }),
});

/** Collection-level validator: all assetIds must be unique */
export function validateUniqueAssetIds(
  assets: z.infer<typeof InfrastructureAssetSchema>[]
): void {
  const ids = assets.map((a) => a.assetId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    throw new Error(`Duplicate asset IDs found: ${dupes.join(", ")}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 6. PRIORITY RECOMMENDATION
// ─────────────────────────────────────────────────────────────

export const PriorityObjectiveSchema = z.enum([
  "population",
  "infrastructure",
  "service_continuity",
  "balanced",
]);

export const PriorityRecommendationSchema = z.object({
  rank: z.number().int().min(1),
  assetId: z.string().optional(),
  cellId: nonEmptyString(),
  score: unitInterval(),
  expectedBenefit: unitInterval(),

  drivers: z.object({
    hazard: unitInterval(),
    exposure: unitInterval(),
    susceptibility: unitInterval(),
    criticality: unitInterval(),
    dependencyCentrality: unitInterval(),
  }),

  recommendedActions: z
    .array(nonEmptyString())
    .min(1, "At least one recommended action required"),
  evidence: z.array(z.string()),
  confidence: DataConfidenceSchema,

  provenance: z.object({
    engineVersion: nonEmptyString(),
    generatedAt: isoTimestamp(),
    objective: PriorityObjectiveSchema,
    responseCapacity: z.number().int().min(1),
  }),
});

/** Collection-level validator: ranks must be unique and contiguous from 1 */
export function validateUniquePriorityRanks(
  recommendations: z.infer<typeof PriorityRecommendationSchema>[]
): void {
  const ranks = recommendations.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) {
      throw new Error(
        `Priority ranks must be unique and contiguous from 1. ` +
          `Got ranks: [${ranks.join(", ")}]`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 7. SCENARIO
// ─────────────────────────────────────────────────────────────

export const ScenarioSchema = z.object({
  baseEventId: nonEmptyString(),

  hazardOverrides: z
    .object({
      windMultiplier: z.number().min(0).max(3).optional(),
      rainfallMultiplier: z.number().min(0).max(3).optional(),
      surgeHeightM: z.number().min(0).max(20).optional(),
      trackShiftKm: z.number().min(-200).max(200).optional(),
    })
    .optional(),

  responseCapacity: z.number().int().min(1, "Response capacity must be ≥ 1"),
  objective: PriorityObjectiveSchema,

  label: z.literal("SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST"),
});

// ─────────────────────────────────────────────────────────────
// 8. ADVISORY
// ─────────────────────────────────────────────────────────────

export const AdvisoryEvidenceSchema = z.object({
  field: nonEmptyString(),
  value: z.union([z.string(), z.number()]),
  source: SourceRefSchema,
});

export const AdvisorySchema = z.object({
  advisoryId: nonEmptyString(),
  zoneId: nonEmptyString(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),

  drivers: z.array(nonEmptyString()).min(1),
  recommendedActions: z.array(nonEmptyString()).min(1),
  evidence: z.array(AdvisoryEvidenceSchema),

  confidence: DataConfidenceSchema,

  generatedBy: z.enum(["deterministic-engine", "gemini-assisted"]),

  approval: z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
    approvedBy: z.string().optional(),
    approvedAt: isoTimestamp().optional(),
    notes: z.string().optional(),
  }),

  dispatch: z
    .object({
      status: z.enum([
        "NOT_SENT",
        "SIMULATED_SENT",
        "WEBHOOK_SENT",
        "FAILED",
      ]),
      sentAt: isoTimestamp().optional(),
      endpointUrl: z.string().url().optional(),
      responseCode: z.number().int().optional(),
    })
    .optional(),

  provenance: z.object({
    engineVersion: nonEmptyString(),
    generatedAt: isoTimestamp(),
    scenarioId: z.string().optional(),
  }),
})
  .refine(
    // Dispatch is only set after approval
    (adv) => {
      if (
        adv.dispatch?.status === "WEBHOOK_SENT" ||
        adv.dispatch?.status === "SIMULATED_SENT"
      ) {
        return adv.approval.status === "APPROVED";
      }
      return true;
    },
    {
      message: "Advisory cannot be dispatched without APPROVED status",
      path: ["dispatch", "status"],
    }
  );

// ─────────────────────────────────────────────────────────────
// 9. INSURANCE TRIGGER
// ─────────────────────────────────────────────────────────────

export const InsuranceTriggerSchema = z.object({
  policyId: nonEmptyString(),
  region: nonEmptyString(),

  thresholds: z
    .object({
      windMs: z.number().min(0).optional(),
      rain24hMm: z.number().min(0).optional(),
      surgeM: z.number().min(0).optional(),
    })
    .refine(
      (t) =>
        t.windMs !== undefined ||
        t.rain24hMm !== undefined ||
        t.surgeM !== undefined,
      "At least one trigger threshold must be defined"
    ),

  payout: z.number().min(0),

  status: z.enum(["NOT_TRIGGERED", "TRIGGERED", "UNCERTAIN"]),
  indicativeLiquidity: z.number().min(0),

  basisRiskIndicator: unitInterval().optional(),

  label: z.literal("ILLUSTRATIVE POLICY"),

  provenance: z.object({
    engineVersion: nonEmptyString(),
    evaluatedAt: isoTimestamp(),
    source: SourceRefSchema,
  }),
});

// ─────────────────────────────────────────────────────────────
// 10. REPLAY
// ─────────────────────────────────────────────────────────────

export const ReplayPhaseSchema = z.enum([
  "PREDICTION",
  "EXPLAIN",
  "SCENARIO",
  "ADVISORY",
  "APPROVAL",
  "REVEAL",
  "EVALUATE",
]);

export const ReplayManifestSchema = z.object({
  manifestId: nonEmptyString(),
  event: nonEmptyString(),
  cutoffAt: isoTimestamp(),
  engineVersion: nonEmptyString(),
  dataVersion: nonEmptyString(),
  parametersVersion: nonEmptyString(),
  fixtureStatus: z.enum(["DEMO_FIXTURE", "REAL_DATA", "MIXED"]),
  sources: z
    .array(SourceRefSchema)
    .min(1, "Manifest must have at least one source"),
  generatedAt: isoTimestamp(),
  fixtureChecksum: z.string().optional(),
});

export const ReplayMetricsSchema = z
  .object({
    topKRecall: unitInterval().optional(),
    populationWeightedRecall: unitInterval().optional(),
    infrastructureWeightedRecall: unitInterval().optional(),
    calibration: unitInterval().optional(),
  })
  .refine(
    // At least one metric or all undefined (when ground truth unavailable)
    () => true, // Always valid at schema level; semantic check in evaluator
    {}
  );

export const ReplayResultSchema = z.object({
  eventId: nonEmptyString(),
  manifest: ReplayManifestSchema,
  predictions: z.array(PriorityRecommendationSchema),
  actualEvidenceId: nonEmptyString(),
  metrics: ReplayMetricsSchema,
  baselineMetrics: z.record(z.string(), z.number().min(0).max(1)),
  computedAt: isoTimestamp(),
  metricsUnavailableReason: z.string().optional(),
})
  .refine(
    // CRITICAL information firewall:
    // If fixtureStatus is DEMO_FIXTURE, metrics must be absent or flagged.
    // Synthetic data must never generate claimed accuracy numbers.
    (result) => {
      if (result.manifest.fixtureStatus === "DEMO_FIXTURE") {
        const hasAnyMetric =
          result.metrics.topKRecall !== undefined ||
          result.metrics.populationWeightedRecall !== undefined ||
          result.metrics.infrastructureWeightedRecall !== undefined;
        if (hasAnyMetric && !result.metricsUnavailableReason) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "DEMO_FIXTURE data must not produce evaluation metrics without metricsUnavailableReason. " +
        "Set metricsUnavailableReason to explain why metrics are unavailable for this fixture.",
      path: ["metrics"],
    }
  );

// ─────────────────────────────────────────────────────────────
// 11. DEMO FIXTURE METADATA
// ─────────────────────────────────────────────────────────────

export const DemoFixtureMetadataSchema = z.object({
  dataStatus: z.literal("DEMO_FIXTURE"),
  historicalEventReference: z.literal("Cyclone Fani 2019"),
  synthetic: z.literal(true),
  description: nonEmptyString(),
  evaluationWarning: z.literal(
    "SYNTHETIC — DO NOT use to generate claimed historical accuracy metrics"
  ),
  parameterBasis: z.array(nonEmptyString()).min(1),
  createdAt: isoTimestamp(),
  version: nonEmptyString(),
});

// ─────────────────────────────────────────────────────────────
// 12. API RESPONSE ENVELOPES
// ─────────────────────────────────────────────────────────────

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
    servedAt: isoTimestamp(),
  });

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: nonEmptyString(),
    message: nonEmptyString(),
    detail: z.string().optional(),
  }),
  servedAt: isoTimestamp(),
});

// ─────────────────────────────────────────────────────────────
// 13. COLLECTION VALIDATORS
//
// These run at the collection level and cannot be expressed
// purely as single-object schemas.
// ─────────────────────────────────────────────────────────────

/**
 * Validates an array of ImpactCells:
 *  - All cellIds unique
 *  - No negative exposure values (belt-and-suspenders check)
 *  - All risk/confidence values in [0, 1]
 */
export function validateImpactCellCollection(
  cells: z.infer<typeof ImpactCellSchema>[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const cellIds = cells.map((c) => c.cellId);
  const dupeCells = cellIds.filter((id, i) => cellIds.indexOf(id) !== i);
  if (dupeCells.length > 0) {
    errors.push(`Duplicate cellIds: ${dupeCells.join(", ")}`);
  }

  cells.forEach((cell, i) => {
    if (cell.exposure.population < 0) {
      errors.push(`Cell[${i}].exposure.population is negative`);
    }
    if (cell.exposure.buildings < 0) {
      errors.push(`Cell[${i}].exposure.buildings is negative`);
    }
    if (cell.exposure.roadKm < 0) {
      errors.push(`Cell[${i}].exposure.roadKm is negative`);
    }
    if (cell.impactExposure.score < 0 || cell.impactExposure.score > 1) {
      errors.push(`Cell[${i}].impactExposure.score out of [0,1]`);
    }
    if (
      cell.impactExposure.confidence.overall < 0 ||
      cell.impactExposure.confidence.overall > 1
    ) {
      errors.push(`Cell[${i}].confidence.overall out of [0,1]`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Validates that prediction fixture data does not contain
 * post-event timestamps. Enforces the information firewall.
 *
 * @param cutoffAt - The prediction cutoff timestamp
 * @param sources - Sources to check
 */
export function validatePredictionFirewall(
  cutoffAt: string,
  sources: z.infer<typeof SourceRefSchema>[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const cutoff = new Date(cutoffAt);

  sources.forEach((source) => {
    if (source.referenceDate) {
      const refDate = new Date(source.referenceDate);
      if (refDate > cutoff) {
        errors.push(
          `Source "${source.id}" has referenceDate ${source.referenceDate} ` +
            `which is AFTER prediction cutoff ${cutoffAt}. ` +
            `This source must not be used in the prediction engine.`
        );
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────
// 14. INFERRED TYPES FROM SCHEMAS
//
// Import these where you want schema-derived types
// (identical to the hand-written types in types/index.ts —
// keep them in sync).
// ─────────────────────────────────────────────────────────────

export type ValidatedCoordinate = z.infer<typeof CoordinateSchema>;
export type ValidatedSourceRef = z.infer<typeof SourceRefSchema>;
export type ValidatedDataConfidence = z.infer<typeof DataConfidenceSchema>;
export type ValidatedHazardScenario = z.infer<typeof HazardScenarioSchema>;
export type ValidatedImpactCell = z.infer<typeof ImpactCellSchema>;
export type ValidatedInfrastructureAsset = z.infer<
  typeof InfrastructureAssetSchema
>;
export type ValidatedPriorityRecommendation = z.infer<
  typeof PriorityRecommendationSchema
>;
export type ValidatedScenario = z.infer<typeof ScenarioSchema>;
export type ValidatedAdvisory = z.infer<typeof AdvisorySchema>;
export type ValidatedInsuranceTrigger = z.infer<typeof InsuranceTriggerSchema>;
export type ValidatedReplayManifest = z.infer<typeof ReplayManifestSchema>;
export type ValidatedReplayResult = z.infer<typeof ReplayResultSchema>;
export type ValidatedDemoFixtureMetadata = z.infer<
  typeof DemoFixtureMetadataSchema
>;
