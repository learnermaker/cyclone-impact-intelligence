/**
 * Cyclone Impact Intelligence — Canonical Type Contracts
 *
 * These types are frozen for Phase 1. Every engine module, API route,
 * and UI component must depend on these types — never on ad-hoc shapes.
 *
 * Key architectural decisions reflected here (locked 2026-09-28):
 *  - SourceTier: explicit source hierarchy (OFFICIAL → DEMO_FIXTURE)
 *  - DataConfidence: per-component confidence, not one opaque score
 *  - Susceptibility: separated from Vulnerability — elevation ≠ vulnerability
 *  - DemoFixtureMetadata: every synthetic fixture is explicitly tagged
 *  - ReplayManifest: reproducibility audit trail for every replay run
 *  - Impact pipeline: hazard × exposure × susceptibility → impactExposure
 *  - Action pipeline: InterventionBenefit = 0.50×impactExposure + 0.30×criticality + 0.20×dependency
 */

// ─────────────────────────────────────────────────────────────
// 1. PRIMITIVES
// ─────────────────────────────────────────────────────────────

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type TimeWindow = {
  start: string; // ISO 8601
  end: string;   // ISO 8601
};

/** Minimal GeoJSON geometry — full detail in geojson-types if needed */
export type GeoJSONGeometry = {
  type: "Point" | "Polygon" | "MultiPolygon" | "LineString" | "MultiLineString";
  coordinates: unknown;
};

export type GeoJSONFeature<P = Record<string, unknown>> = {
  type: "Feature";
  geometry: GeoJSONGeometry;
  properties: P;
};

// ─────────────────────────────────────────────────────────────
// 2. SOURCE HIERARCHY & PROVENANCE
//
// Every data value in the engine must carry a source tier.
// This drives UI labels and Gemini explanations.
// ─────────────────────────────────────────────────────────────

/**
 * Explicit source precedence hierarchy.
 *
 *  OFFICIAL           – IMD RSMC, INCOIS official products
 *  AUTHORITATIVE_OPEN – WorldPop, NASADEM, GPM/IMERG, Copernicus, OSM
 *  MODEL_DERIVED      – engine-computed values from above inputs
 *  SCENARIO           – user-defined scenario parameter overrides
 *  DEMO_FIXTURE       – synthetic data for engine/UI development
 *
 * UI must display different badges for each tier.
 * DEMO_FIXTURE data must never feed evaluation metrics.
 */
export type SourceTier =
  | "OFFICIAL"
  | "AUTHORITATIVE_OPEN"
  | "MODEL_DERIVED"
  | "SCENARIO"
  | "DEMO_FIXTURE";

/** Reference to a single data source used in a computation */
export type SourceRef = {
  /** Short machine-readable name, e.g. "worldpop-2019", "gpm-imerg-fani" */
  id: string;
  tier: SourceTier;
  /** Human-readable description */
  description: string;
  /** Reference date of the source data (not processing date) */
  referenceDate?: string;
  /** ISO timestamp this source was ingested/processed */
  processedAt?: string;
  /** License identifier, e.g. "CC-BY-4.0", "ODbL-1.0" */
  license?: string;
  url?: string;
};

/**
 * Per-component data confidence.
 *
 * Confidence is NOT risk. It reflects source quality, freshness,
 * spatial resolution, and model completeness — separately per component.
 *
 * This gives Gemini something meaningful to explain:
 *   "Priority is HIGH, but confidence is moderate because surge is SCENARIO-derived."
 */
export type DataConfidence = {
  /** Aggregate confidence [0, 1] — weighted combination of components */
  overall: number;
  components: {
    hazard?: number;
    population?: number;
    buildings?: number;
    infrastructure?: number;
    surge?: number;
    rainfall?: number;
    elevation?: number;
  };
  /** Tier of the weakest/lowest-confidence component */
  limitingTier: SourceTier;
  /** ISO timestamp of the most recently updated input */
  dataFreshnessAt?: string;
  /** Human-readable notes on confidence limitations */
  notes?: string[];
};

// ─────────────────────────────────────────────────────────────
// 3. HAZARD SCENARIO
// ─────────────────────────────────────────────────────────────

export type SurgeModelMethod = "flood_fill" | "proximity_threshold" | "official";

export type HazardScenario = {
  eventId: string;
  source: SourceRef;
  issuedAt: string; // ISO 8601

  cyclone: {
    name?: string;
    latitude: number;
    longitude: number;
    maxWindKph: number;
    pressureHpa?: number;
    movementKph?: number;
    movementDirectionDeg?: number;
    category?: string;
  };

  forecast: {
    track: Coordinate[];
    uncertaintyRadiusKm?: number;
    landfallWindow?: TimeWindow;
  };

  rainfall: {
    forecast24hMm: number;
    forecast48hMm: number;
    /** Anomaly relative to climatological baseline (optional) */
    anomalyRatio?: number;
    source: SourceRef;
  };

  surge: {
    heightM: number;
    /** official = from IMD/INCOIS; scenario = user-defined */
    source: "official" | "scenario";
    /** Method used for cell-level surge screening */
    modelMethod: SurgeModelMethod;
    /** Distance threshold used if method = proximity_threshold (km) */
    proximityThresholdKm?: number;
    confidence?: number;
  };

  /**
   * UI display label — must be shown prominently.
   * NEVER null for SCENARIO or DEMO_FIXTURE tier events.
   */
  displayLabel:
    | "OFFICIAL FORECAST"
    | "SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST"
    | "DEMO SCENARIO — SIMULATED ONLY"
    | "HISTORICAL REPLAY — PRE-EVENT RECONSTRUCTION";

  tier: SourceTier;
};

// ─────────────────────────────────────────────────────────────
// 4. IMPACT CELL
//
// Core spatial unit: H3 resolution 8 (~0.74 km²).
// Resolution is configurable — see src/config/index.ts.
//
// Pipeline:
//   hazard × exposure × susceptibility → impactExposure
// ─────────────────────────────────────────────────────────────

/**
 * Susceptibility: terrain/location-based factors that determine
 * how exposed a cell is to each hazard type.
 *
 * IMPORTANT: susceptibility ≠ vulnerability.
 * A hospital at 2m elevation is not "twice as vulnerable" as one at 4m.
 * Elevation contributes to flood susceptibility; it is one input, not
 * the whole vulnerability picture. Structural vulnerability of specific
 * assets lives in InfrastructureAsset, not here.
 */
export type Susceptibility = {
  /** [0, 1] — derived from elevation + coastal water connectivity */
  floodSusceptibility: number;
  /** [0, 1] — wind exposure from terrain roughness proxy */
  windExposure: number;
  /** Distance to nearest coastline (km) — raw value, shown in UI */
  coastalProximityKm: number;
  /** Median elevation of cell (m) — raw value, shown in UI */
  elevationMedianM: number;
  /** Whether this cell is flagged as surge-exposed by the active model */
  surgeExposed: boolean;
};

export type ImpactCell = {
  /** H3 cell index (resolution configurable, default 8) */
  cellId: string;
  geometry: GeoJSONGeometry;

  hazard: {
    /** Normalized wind severity [0, 1] */
    wind: number;
    /** Normalized rainfall severity [0, 1] */
    rainfall: number;
    /** Normalized surge severity [0, 1] */
    surge: number;
    /** Combined hazard score: 0.40*wind + 0.30*rain + 0.30*surge */
    combined: number;
  };

  exposure: {
    population: number;
    buildings: number;
    builtAreaHa: number;
    roadKm: number;
    criticalAssetCount: number;
    /** Combined exposure: weighted sum, normalized [0, 1] */
    combined: number;
  };

  susceptibility: Susceptibility;

  /**
   * Impact exposure: hazard × exposure × susceptibility.
   * NOT called "damage prediction" or "structural failure probability".
   * Preferred wording: "infrastructure impact exposure", "disruption risk".
   */
  impactExposure: {
    /** [0, 1] combined score */
    score: number;
    probability: number;
    severity: number;
    confidence: DataConfidence;
  };

  /** Aggregated critical infrastructure summary for this cell */
  infrastructure: {
    assetCount: number;
    /** Weighted mean criticality of assets in cell [0, 1] */
    combinedCriticality: number;
    /** Spatial/network dependency centrality proxy [0, 1] */
    dependencyCentrality: number;
  };

  /**
   * Priority output — populated only after the optimizer runs.
   * rank is null until top-K selection is complete.
   */
  priority: {
    /** [0, 1] — InterventionBenefit = 0.50×impactExposure + 0.30×criticality + 0.20×dependencyCentrality (weighted sum, not product) */
    score: number;
    /** 1-based rank; null = not in selected top-K */
    rank: number | null;
    interventionBenefit: number;
  };

  provenance: {
    sources: SourceRef[];
    engineVersion: string;
    computedAt: string;
  };
};

// ─────────────────────────────────────────────────────────────
// 5. INFRASTRUCTURE ASSET
// ─────────────────────────────────────────────────────────────

export const INFRASTRUCTURE_ASSET_TYPES = [
  "hospital",
  "emergency_service",
  "shelter",
  "bridge",
  "arterial_road",
  "power",
  "water",
  "school",
  "other",
] as const;

export type InfrastructureAssetType = (typeof INFRASTRUCTURE_ASSET_TYPES)[number];

/** Default criticality weights — policy parameters, not learned values */
export const DEFAULT_CRITICALITY: Record<InfrastructureAssetType, number> = {
  hospital: 1.0,
  emergency_service: 0.95,
  shelter: 0.9,
  bridge: 0.85,
  power: 0.85,
  water: 0.85,
  arterial_road: 0.8,
  school: 0.6,
  other: 0.4,
};

export type InfrastructureAsset = {
  assetId: string;
  name?: string;
  type: InfrastructureAssetType;

  geometry: GeoJSONGeometry;

  /** Policy-defined criticality weight [0, 1] */
  criticality: number;

  /**
   * Asset-level structural/operational vulnerability [0, 1].
   * This is distinct from cell-level susceptibility.
   * Reflects construction quality, redundancy, etc.
   * For MVP: default values by asset type; not structurally derived.
   */
  vulnerability: number;

  exposure: {
    /** Combined hazard score at this asset's location [0, 1] */
    hazard: number;
    /** Population in service area or influence zone */
    population: number;
  };

  /**
   * Spatial/network dependency centrality [0, 1].
   * Proxy for how many other critical assets depend on this one.
   * Derived from: road density, bridge exposure, facility influence area.
   * NOT from OSRM or full network routing.
   */
  dependencyCentrality: number;

  /**
   * Combined asset risk [0, 1]:
   *   hazardExposure × vulnerability × criticality × dependencyCentrality
   * IMPORTANT: this is modeled disruption risk, NOT structural failure probability.
   */
  risk: number;

  confidence: DataConfidence;

  provenance: {
    source: SourceRef;
    referenceDate?: string;
    processingDate: string;
  };
};

// ─────────────────────────────────────────────────────────────
// 6. PRIORITY RECOMMENDATION
// ─────────────────────────────────────────────────────────────

export type PriorityObjective =
  | "population"
  | "infrastructure"
  | "service_continuity"
  | "balanced";

export type PriorityRecommendation = {
  rank: number;
  assetId?: string;
  cellId: string;
  /** [0, 1] composite priority score */
  score: number;
  /** Estimated benefit of intervention (impactExposure × effectiveness) */
  expectedBenefit: number;

  /** Decomposed driver contributions — shown in UI, cited by Gemini */
  drivers: {
    hazard: number;
    exposure: number;
    susceptibility: number;
    criticality: number;
    dependencyCentrality: number;
  };

  recommendedActions: string[];
  /** Evidence fields — Gemini must cite these, never invent them */
  evidence: string[];
  confidence: DataConfidence;

  provenance: {
    engineVersion: string;
    generatedAt: string;
    objective: PriorityObjective;
    responseCapacity: number;
  };
};

// ─────────────────────────────────────────────────────────────
// 7. SCENARIO
// ─────────────────────────────────────────────────────────────

export type Scenario = {
  baseEventId: string;

  hazardOverrides?: {
    windMultiplier?: number;
    rainfallMultiplier?: number;
    surgeHeightM?: number;
    trackShiftKm?: number;
  };

  responseCapacity: number;
  objective: PriorityObjective;

  /**
   * REQUIRED label — must appear prominently in every UI element
   * that displays scenario-derived data.
   */
  label: "SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST";
};

// ─────────────────────────────────────────────────────────────
// 8. ADVISORY
// ─────────────────────────────────────────────────────────────

export type AdvisorySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AdvisoryEvidence = {
  /** Field name from engine output, e.g. "impactExposure.score" */
  field: string;
  value: string | number;
  source: SourceRef;
};

export type Advisory = {
  advisoryId: string;
  zoneId: string;
  severity: AdvisorySeverity;

  drivers: string[];
  recommendedActions: string[];
  evidence: AdvisoryEvidence[];

  confidence: DataConfidence;

  generatedBy: "deterministic-engine" | "gemini-assisted";

  approval: {
    status: "PENDING" | "APPROVED" | "REJECTED";
    approvedBy?: string;
    approvedAt?: string;
    notes?: string;
  };

  dispatch?: {
    status: "NOT_SENT" | "SIMULATED_SENT" | "WEBHOOK_SENT" | "FAILED";
    sentAt?: string;
    endpointUrl?: string;
    responseCode?: number;
  };

  provenance: {
    engineVersion: string;
    generatedAt: string;
    scenarioId?: string;
  };
};

// ─────────────────────────────────────────────────────────────
// 9. INSURANCE TRIGGER
// ─────────────────────────────────────────────────────────────

export type InsuranceTrigger = {
  policyId: string;
  region: string;

  thresholds: {
    windMs?: number;
    rain24hMm?: number;
    surgeM?: number;
  };

  /** Indicative payout amount (illustrative only) */
  payout: number;

  status: "NOT_TRIGGERED" | "TRIGGERED" | "UNCERTAIN";
  indicativeLiquidity: number;

  /** Basis risk indicator: gap between modelled trigger and actual impact [0,1] */
  basisRiskIndicator?: number;

  /**
   * REQUIRED label — must appear on every insurance panel in the UI.
   * No real contract. No real payout. For illustration purposes only.
   */
  label: "ILLUSTRATIVE POLICY";

  provenance: {
    engineVersion: string;
    evaluatedAt: string;
    source: SourceRef;
  };
};

// ─────────────────────────────────────────────────────────────
// 10. REPLAY
// ─────────────────────────────────────────────────────────────

/**
 * Replay state machine phases.
 *
 * Information firewall: the PREDICTION phase must have no import
 * path that can reach data/historical/fani/actual/.
 * Only REVEAL unlocks post-event data.
 */
export type ReplayPhase =
  | "PREDICTION"   // Pre-event: hazard → exposure → impact → priority
  | "EXPLAIN"      // Why? — Gemini / deterministic explanation
  | "SCENARIO"     // What-if scenario adjustments
  | "ADVISORY"     // Generate structured advisory
  | "APPROVAL"     // Human approval step
  | "REVEAL"       // Unlock post-event actual evidence
  | "EVALUATE";    // Compute metrics vs actual

/**
 * Reproducibility manifest — every replay run must produce one.
 *
 * Records exactly which versions and data sources produced the results,
 * so judges can see exactly what they are evaluating.
 */
export type ReplayManifest = {
  manifestId: string;
  event: string;
  /** Prediction cutoff timestamp — no post-event data used before this */
  cutoffAt: string;
  engineVersion: string;
  dataVersion: string;
  parametersVersion: string;
  /** DEMO_FIXTURE = synthetic; REAL_DATA = actual GEE/OSM outputs; MIXED = partial */
  fixtureStatus: "DEMO_FIXTURE" | "REAL_DATA" | "MIXED";
  sources: SourceRef[];
  generatedAt: string;
  /** SHA-256 of the input fixture files, for auditability */
  fixtureChecksum?: string;
};

export type ReplayMetrics = {
  /**
   * PRIMARY constrained-response metric.
   * Fraction of the K selected cells that fall within the observed impact zone.
   * Answers: "Of the K locations we selected for response, how many were
   * actually in the observed inundation proxy zone?"
   */
  precisionAtK?: number;
  /**
   * Fraction of the observed impact zone (all flooded cells) captured by K.
   * Very small by construction when K ≪ target (e.g. 10/2749 ≈ 0.36% max).
   * Retain for completeness — do not use as the primary operator-facing metric.
   */
  observedZoneRecall?: number;
  /** precisionAtK weighted by exposed population within the overlap */
  populationWeightedCapture?: number;
  /** precisionAtK weighted by infrastructure criticality within the overlap */
  infrastructureWeightedCapture?: number;
  /** Calibration score — only if a defensible probability target exists */
  calibration?: number;
};

export type ReplayResult = {
  eventId: string;
  manifest: ReplayManifest;
  predictions: PriorityRecommendation[];

  actualEvidenceId: string;

  metrics: ReplayMetrics;
  /** Baseline comparisons: { "hazard_only": 0.xx, "hazard_x_exposure": 0.xx } */
  baselineMetrics: Record<string, number>;

  computedAt: string;

  /**
   * If metrics could not be computed (e.g. actual data unavailable),
   * this message is shown instead of numbers. NEVER invent metric values.
   */
  metricsUnavailableReason?: string;
};

// ─────────────────────────────────────────────────────────────
// 11. DEMO FIXTURE METADATA
//
// Every synthetic fixture file must embed this object.
// Its purpose is to make it impossible for synthetic data
// to be silently treated as historical ground truth.
// ─────────────────────────────────────────────────────────────

export type DemoFixtureMetadata = {
  /** Always "DEMO_FIXTURE" — used as a runtime guard in the evaluation engine */
  dataStatus: "DEMO_FIXTURE";
  /** The historical event this fixture is modelled after */
  historicalEventReference: "Cyclone Fani 2019";
  /** Explicit flag — never false for a demo fixture */
  synthetic: true;
  /** Plain-language description of what was approximated */
  description: string;
  /**
   * Hard stop warning — the evaluation engine must check this field
   * and refuse to compute claimed "Fani accuracy" metrics from synthetic data.
   */
  evaluationWarning: "SYNTHETIC — DO NOT use to generate claimed historical accuracy metrics";
  /** Basis: what real published sources the parameters were derived from */
  parameterBasis: string[];
  createdAt: string;
  version: string;
};

// ─────────────────────────────────────────────────────────────
// 12. API RESPONSE ENVELOPES
//
// Consistent shape for all /api/* responses.
// ─────────────────────────────────────────────────────────────

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  /** ISO timestamp */
  servedAt: string;
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    /** Safe detail for developer debugging — never expose internal stack */
    detail?: string;
  };
  servedAt: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─────────────────────────────────────────────────────────────
// 13. GEMINI TOOL CONTRACT
//
// Tool function names and their return types.
// Gemini must call tools to get numerical facts — never invent them.
// ─────────────────────────────────────────────────────────────

export type GeminiToolName =
  | "get_event_status"
  | "get_cell_risk"
  | "get_asset_risk"
  | "get_priority_list"
  | "get_dependency_graph"
  | "run_scenario"
  | "get_historical_replay"
  | "generate_advisory"
  | "evaluate_insurance_trigger";

export type GeminiToolCall = {
  tool: GeminiToolName;
  parameters: Record<string, unknown>;
};

export type GeminiResponse = {
  text: string;
  toolCalls?: GeminiToolCall[];
  /** true = Gemini was unavailable; UI shows deterministic fallback */
  isFallback: boolean;
  /** Deterministic explanation used when isFallback = true */
  fallbackText?: string;
};

// ─────────────────────────────────────────────────────────────
// 14. APP MODE / UI STATE (Zustand store shape)
// ─────────────────────────────────────────────────────────────

export type AppMode = "LIVE" | "IMPACT" | "ACTION" | "REPLAY";

export type MapLayerId =
  | "wind"
  | "rainfall"
  | "surge"
  | "combined_hazard"
  | "population"
  | "buildings"
  | "infrastructure"
  | "impact"
  | "priority"
  | "actual_impact";

/** Session/UI state — held in Zustand, never duplicates backend data */
export type AppState = {
  mode: AppMode;
  selectedEventId: string | null;
  selectedCellId: string | null;
  selectedAssetId: string | null;
  responseCapacity: number;
  scenario: Scenario | null;
  replayPhase: ReplayPhase | null;
  visibleLayers: Set<MapLayerId>;
  /** Whether the actual post-event data has been revealed in REPLAY mode */
  actualRevealed: boolean;
};
