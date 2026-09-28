/**
 * Priority Optimizer
 *
 * Greedy top-K selection of highest-benefit interventions.
 *
 * Benefit function:
 *   Benefit(asset) =
 *     PRIORITY_BENEFIT_WEIGHTS.impactExposure * impactExposure.score
 *   + PRIORITY_BENEFIT_WEIGHTS.criticality    * criticality
 *   + PRIORITY_BENEFIT_WEIGHTS.dependency     * dependencyCentrality
 *
 * Algorithm:
 *   1. Compute benefit for each candidate
 *   2. Sort descending
 *   3. Select top K
 *   4. Remove overlapping/adjacent zones (H3 neighbor check)
 *   5. Assign ranks (1-based, contiguous)
 *
 * Deliberately simple and auditable.
 * MVP is greedy selection — complex optimization is future work.
 *
 * Phase 3: Implementation.
 */

import type {
  ImpactCell,
  InfrastructureAsset,
  PriorityRecommendation,
  PriorityObjective,
  DataConfidence,
  SourceRef,
} from "@/lib/types/index";
import { PRIORITY_BENEFIT_WEIGHTS, ENGINE_VERSION } from "@/config/index";

export type PriorityInput = {
  cell: ImpactCell;
  asset?: InfrastructureAsset;
};

/**
 * Compute the priority benefit score for a single candidate.
 */
export function computeBenefitScore(
  impactExposureScore: number,
  criticality: number,
  dependencyCentrality: number
): number {
  return (
    PRIORITY_BENEFIT_WEIGHTS.impactExposure * impactExposureScore +
    PRIORITY_BENEFIT_WEIGHTS.criticality * criticality +
    PRIORITY_BENEFIT_WEIGHTS.dependency * dependencyCentrality
  );
}

/**
 * Adjust benefit score based on the current objective.
 *
 * "population"         → weight impactExposure (population-heavy)
 * "infrastructure"     → weight criticality
 * "service_continuity" → weight dependencyCentrality
 * "balanced"           → no adjustment
 */
export function applyObjectiveWeighting(
  base: number,
  impactExposure: number,
  criticality: number,
  dependencyCentrality: number,
  objective: PriorityObjective
): number {
  switch (objective) {
    case "population":
      return base + 0.15 * impactExposure;
    case "infrastructure":
      return base + 0.15 * criticality;
    case "service_continuity":
      return base + 0.15 * dependencyCentrality;
    case "balanced":
    default:
      return base;
  }
}

/**
 * Build recommended actions for a priority recommendation.
 * Deterministic — based on asset type and severity.
 *
 * Phase 3: TODO — expand action library from asset type + hazard drivers.
 */
export function buildRecommendedActions(
  _cell: ImpactCell,
  _asset: InfrastructureAsset | undefined
): string[] {
  // TODO Phase 3: implement action library
  return [
    "Pre-position response team",
    "Verify shelter readiness",
    "Protect access route",
  ];
}

/**
 * Run greedy top-K priority selection.
 *
 * @param inputs — candidate cells (with optional associated asset)
 * @param k — response capacity
 * @param objective — priority objective
 * @param sources — provenance sources
 *
 * Phase 3: TODO — implement with H3 neighbor overlap check.
 */
export function selectTopK(
  _inputs: PriorityInput[],
  _k: number,
  _objective: PriorityObjective,
  _confidence: DataConfidence,
  _sources: SourceRef[]
): PriorityRecommendation[] {
  // TODO Phase 3: implement greedy selection + overlap removal
  throw new Error("selectTopK: not yet implemented (Phase 3)");
}

/**
 * Build a deterministic text explanation for a priority recommendation.
 * Used as Gemini fallback — MUST only cite fields that exist in the data.
 */
export function buildDeterministicExplanation(
  rec: PriorityRecommendation
): string {
  const { drivers, score, confidence } = rec;
  const lines: string[] = [
    `This location ranks #${rec.rank} in the current priority assessment.`,
    `Composite priority score: ${(score * 100).toFixed(0)}%`,
    ``,
    `Key drivers:`,
    `  Hazard exposure:          ${(drivers.hazard * 100).toFixed(0)}%`,
    `  Population/building expo: ${(drivers.exposure * 100).toFixed(0)}%`,
    `  Flood susceptibility:     ${(drivers.susceptibility * 100).toFixed(0)}%`,
    `  Infrastructure criticality: ${(drivers.criticality * 100).toFixed(0)}%`,
    `  Dependency centrality:    ${(drivers.dependencyCentrality * 100).toFixed(0)}%`,
    ``,
    `Overall confidence: ${(confidence.overall * 100).toFixed(0)}% (${confidence.limitingTier})`,
    ``,
    `Recommended actions: ${rec.recommendedActions.join("; ")}.`,
    ``,
    `Note: This recommendation is model-derived (${rec.provenance.engineVersion}). ` +
      `Human review required before dispatch.`,
  ];

  if (
    confidence.limitingTier === "SCENARIO" ||
    confidence.limitingTier === "DEMO_FIXTURE"
  ) {
    lines.push(
      ``,
      `CAUTION: Confidence is reduced because inputs include scenario/demo data. ` +
        `This is not an official forecast.`
    );
  }

  return lines.join("\n");
}

export { ENGINE_VERSION };
