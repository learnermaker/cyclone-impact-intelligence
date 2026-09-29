/**
 * Evaluation Engine
 *
 * Computes replay evaluation metrics by comparing predicted priorities
 * against actual post-event evidence.
 *
 * CRITICAL RULE:
 *   DEMO_FIXTURE data MUST NOT produce claimed accuracy metrics.
 *   If fixtureStatus is "DEMO_FIXTURE", metricsUnavailableReason is returned
 *   instead of computed numbers. The Zod schema enforces this at the API level.
 *
 * Baselines:
 *   B0 — hazard only (rank by hazard.combined)
 *   B1 — hazard × exposure (rank by hazard.combined × exposure.combined)
 *   B2 — full impact-to-action (current engine output)
 */

import type { ReplayResult, PriorityRecommendation } from "../../lib/types/index";
import type { ProcessedCell } from "../types";
import { ENGINE_VERSION, DATA_VERSION, PARAMETERS_VERSION } from "../../config/index";

type FixtureStatus = "DEMO_FIXTURE" | "REAL_DATA" | "MIXED";

// ─────────────────────────────────────────────────────────────
// METRIC COMPUTATION (real data only)
// ─────────────────────────────────────────────────────────────

/**
 * Top-K recall: fraction of actual high-impact cells found in predicted top-K.
 * @param predicted - cellIds in predicted top-K
 * @param actualHighImpact - cellIds that were actually high-impact
 */
export function computeTopKRecall(
  predicted: string[],
  actualHighImpact: string[]
): number {
  if (actualHighImpact.length === 0) return 0;
  const predictedSet = new Set(predicted);
  const hits = actualHighImpact.filter((id) => predictedSet.has(id)).length;
  return Math.round((hits / actualHighImpact.length) * 10000) / 10000;
}

/**
 * Population-weighted recall: weight correct captures by exposed population.
 */
export function computePopulationWeightedRecall(
  predicted: string[],
  actualHighImpact: string[],
  cells: Map<string, ProcessedCell>
): number {
  if (actualHighImpact.length === 0) return 0;
  const predictedSet = new Set(predicted);

  let totalPopulation = 0;
  let capturedPopulation = 0;

  for (const cellId of actualHighImpact) {
    const cell = cells.get(cellId);
    const pop = cell?.exposure.population ?? 0;
    totalPopulation += pop;
    if (predictedSet.has(cellId)) capturedPopulation += pop;
  }

  if (totalPopulation === 0) return computeTopKRecall(predicted, actualHighImpact);
  return Math.round((capturedPopulation / totalPopulation) * 10000) / 10000;
}

/**
 * Infrastructure-weighted recall: weight by critical infrastructure importance.
 */
export function computeInfrastructureWeightedRecall(
  predicted: string[],
  actualHighImpact: string[],
  cells: Map<string, ProcessedCell>
): number {
  if (actualHighImpact.length === 0) return 0;
  const predictedSet = new Set(predicted);

  let totalCrit = 0;
  let capturedCrit = 0;

  for (const cellId of actualHighImpact) {
    const cell = cells.get(cellId);
    const crit = cell?.infrastructure.combinedCriticality ?? 0;
    totalCrit += crit;
    if (predictedSet.has(cellId)) capturedCrit += crit;
  }

  if (totalCrit === 0) return computeTopKRecall(predicted, actualHighImpact);
  return Math.round((capturedCrit / totalCrit) * 10000) / 10000;
}

// ─────────────────────────────────────────────────────────────
// BASELINE RANKINGS (for comparison)
// ─────────────────────────────────────────────────────────────

/** B0: hazard-only ranking */
export function computeBaselineB0(
  cells: Map<string, ProcessedCell>,
  k: number
): string[] {
  return Array.from(cells.values())
    .filter((c) => c.isLand)
    .sort((a, b) => b.hazard.combined - a.hazard.combined)
    .slice(0, k)
    .map((c) => c.cellId);
}

/** B1: hazard × exposure ranking */
export function computeBaselineB1(
  cells: Map<string, ProcessedCell>,
  k: number
): string[] {
  return Array.from(cells.values())
    .filter((c) => c.isLand)
    .sort((a, b) => b.hazard.combined * b.exposure.combined - a.hazard.combined * a.exposure.combined)
    .slice(0, k)
    .map((c) => c.cellId);
}

// ─────────────────────────────────────────────────────────────
// MAIN EVALUATION
// ─────────────────────────────────────────────────────────────

export type ActualEvidenceInput = {
  evidenceId: string;
  /** CellIds that were actually high-impact (from Copernicus or Sentinel-1) */
  actualHighImpactCellIds: string[];
  evidenceSource: string;
  evidenceDate: string;
};

/**
 * Compute replay evaluation.
 *
 * If fixtureStatus is DEMO_FIXTURE, returns metricsUnavailableReason
 * rather than computed numbers (enforced by Zod schema).
 */
export function computeReplayEvaluation(
  recommendations: PriorityRecommendation[],
  cells: Map<string, ProcessedCell>,
  fixtureStatus: FixtureStatus,
  cutoffAt: string,
  actualEvidence: ActualEvidenceInput | null
): Omit<ReplayResult, "manifest"> {
  const computedAt = new Date().toISOString();
  const predictedIds = recommendations.map((r) => r.cellId);
  const k = recommendations.length;

  // DEMO_FIXTURE firewall — never compute metrics from synthetic data
  if (fixtureStatus === "DEMO_FIXTURE" || !actualEvidence) {
    return {
      eventId: "fani-2019-t24h",
      predictions: recommendations,
      actualEvidenceId: actualEvidence?.evidenceId ?? "none",
      metrics: {},
      baselineMetrics: {},
      computedAt,
      metricsUnavailableReason:
        fixtureStatus === "DEMO_FIXTURE"
          ? "Metrics unavailable: synthetic DEMO_FIXTURE data cannot produce claimed historical accuracy metrics. Provide real Copernicus EMSR357 validation data to compute metrics."
          : "Metrics unavailable: no actual post-event validation data loaded. Run the Copernicus pipeline and reveal actual impact to compute metrics.",
    };
  }

  // Real data path — compute metrics
  const { actualHighImpactCellIds } = actualEvidence;
  const b0Predicted = computeBaselineB0(cells, k);
  const b1Predicted = computeBaselineB1(cells, k);

  const topKRecall = computeTopKRecall(predictedIds, actualHighImpactCellIds);
  const popRecall = computePopulationWeightedRecall(predictedIds, actualHighImpactCellIds, cells);
  const infraRecall = computeInfrastructureWeightedRecall(predictedIds, actualHighImpactCellIds, cells);

  const b0Recall = computeTopKRecall(b0Predicted, actualHighImpactCellIds);
  const b1Recall = computeTopKRecall(b1Predicted, actualHighImpactCellIds);

  return {
    eventId: "fani-2019-t24h",
    predictions: recommendations,
    actualEvidenceId: actualEvidence.evidenceId,
    metrics: { topKRecall, populationWeightedRecall: popRecall, infrastructureWeightedRecall: infraRecall },
    baselineMetrics: { hazard_only: b0Recall, hazard_x_exposure: b1Recall },
    computedAt,
  };
}
