/**
 * Priority Optimizer
 *
 * Greedy constrained top-K selection.
 *
 * Benefit formula:
 *   benefit =
 *     PRIORITY_BENEFIT_WEIGHTS.impactExposure * impactExposure.score
 *   + PRIORITY_BENEFIT_WEIGHTS.criticality    * infrastructure.combinedCriticality
 *   + PRIORITY_BENEFIT_WEIGHTS.dependency     * infrastructure.dependencyCentrality
 *
 * Objective adjustments add a secondary boost without changing primary order for
 * cells with equal benefit (objective changes SELECTION, not RISK SCORES).
 *
 * Algorithm:
 *   1. Compute benefit for all land cells.
 *   2. Sort descending.
 *   3. Select top K with H3 neighbor overlap guard.
 *   4. Assign contiguous ranks 1..K.
 *
 * Invariants (tested):
 *   - Changing K changes selected set, never changes underlying cell risk scores.
 *   - Ranks are contiguous 1..K with no duplicates.
 *   - No two selected cells are H3 grid-distance 1 apart (overlap guard).
 *   - Higher dependency centrality increases priority, all else equal.
 *   - Identical inputs produce identical output (deterministic).
 */

import { gridDistance } from "h3-js";
import type {
  PriorityRecommendation,
  PriorityObjective,
} from "../../lib/types/index";
import type { ProcessedCell } from "../types";
import {
  PRIORITY_BENEFIT_WEIGHTS,
  ENGINE_VERSION,
} from "../../config/index";

// ─────────────────────────────────────────────────────────────
// BENEFIT SCORING
// ─────────────────────────────────────────────────────────────

/**
 * Compute base benefit score for a cell.
 * All inputs are [0, 1]; result is [0, 1].
 */
export function computeBenefitScore(
  impactExposure: number,
  criticality: number,
  dependencyCentrality: number
): number {
  return round4(
    PRIORITY_BENEFIT_WEIGHTS.impactExposure * impactExposure +
    PRIORITY_BENEFIT_WEIGHTS.criticality * criticality +
    PRIORITY_BENEFIT_WEIGHTS.dependency * dependencyCentrality
  );
}

/**
 * Apply objective-specific adjustment to base benefit.
 *
 * The adjustment is a secondary boost (±15% weight shift).
 * It changes WHICH cells are selected for a given K
 * WITHOUT altering the underlying impactExposure.score.
 *
 * This ensures: changing objective changes actions, not risk assessment.
 */
export function applyObjectiveAdjustment(
  baseBenefit: number,
  impactExposure: number,
  criticality: number,
  dependencyCentrality: number,
  objective: PriorityObjective
): number {
  const adj = 0.15;
  switch (objective) {
    case "population":
      return round4(baseBenefit + adj * impactExposure);
    case "infrastructure":
      return round4(baseBenefit + adj * criticality);
    case "service_continuity":
      return round4(baseBenefit + adj * dependencyCentrality);
    case "balanced":
    default:
      return baseBenefit;
  }
}

// ─────────────────────────────────────────────────────────────
// H3 OVERLAP CHECK
// ─────────────────────────────────────────────────────────────

/**
 * Returns true if two cells are adjacent (grid distance = 1) or identical (0).
 * Uses gridDistance from h3-js v4.
 * Catches errors gracefully (e.g., if cell IDs are from different resolutions).
 */
export function areH3Neighbors(cellA: string, cellB: string): boolean {
  if (cellA === cellB) return true;
  try {
    return gridDistance(cellA, cellB) <= 1;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// RECOMMENDED ACTIONS (deterministic, by cell characteristics)
// ─────────────────────────────────────────────────────────────

export function buildRecommendedActions(
  cell: ProcessedCell
): string[] {
  const actions: string[] = [];
  const { hazard, exposure, infrastructure, susceptibility } = cell;

  if (susceptibility.surgeExposed) {
    actions.push("Evacuate surge-exposed population");
    actions.push("Pre-position rescue teams at coastal entry points");
  }
  if (hazard.wind > 0.6) {
    actions.push("Issue wind advisory and shelter-in-place guidance");
  }
  if (infrastructure.assetCount > 0 && infrastructure.combinedCriticality > 0.8) {
    actions.push("Protect critical infrastructure access route");
    actions.push("Verify emergency facility readiness");
  }
  if (exposure.population > 5_000) {
    actions.push("Pre-position medical response team");
  }
  if (infrastructure.assetCount > 0) {
    actions.push("Deploy infrastructure protection team");
  }

  // Always at least one action
  if (actions.length === 0) {
    actions.push("Pre-position response team for rapid assessment");
    actions.push("Verify shelter readiness");
  }

  return actions;
}

/**
 * Build evidence strings for a priority recommendation.
 * Gemini must use these fields, never invent evidence.
 */
export function buildEvidence(cell: ProcessedCell): string[] {
  return [
    `Hazard (combined): ${(cell.hazard.combined * 100).toFixed(1)}%`,
    `  Wind: ${(cell.hazard.wind * 100).toFixed(1)}%`,
    `  Rainfall: ${(cell.hazard.rainfall * 100).toFixed(1)}%`,
    `  Surge: ${(cell.hazard.surge * 100).toFixed(1)}% (${cell.hazard.surgeExposed ? "surge-exposed" : "not surge-exposed"})`,
    `Surge model: ${cell.hazard.surgeMethod}${cell.hazard.surgeLabel ? " — SCREENING APPROXIMATION" : ""}`,
    `Population exposed: ${cell.exposure.population.toLocaleString()}`,
    `Buildings: ${cell.exposure.buildings}`,
    `Road km: ${cell.exposure.roadKm}`,
    `Critical assets in cell: ${cell.infrastructure.assetCount}`,
    `Infrastructure criticality: ${(cell.infrastructure.combinedCriticality * 100).toFixed(1)}%`,
    `Dependency centrality: ${(cell.infrastructure.dependencyCentrality * 100).toFixed(1)}%`,
    `Flood susceptibility: ${(cell.susceptibility.floodSusceptibility * 100).toFixed(1)}%`,
    `Elevation: ${cell.susceptibility.elevationMedianM.toFixed(1)} m`,
    `Coastal proximity: ${cell.susceptibility.coastalProximityKm.toFixed(1)} km`,
    `Impact exposure score: ${(cell.impactExposure.score * 100).toFixed(1)}%`,
    `Data confidence: ${(cell.impactExposure.confidence.overall * 100).toFixed(0)}% (${cell.impactExposure.confidence.limitingTier})`,
    `Engine version: ${ENGINE_VERSION}`,
  ];
}

// ─────────────────────────────────────────────────────────────
// GREEDY TOP-K SELECTION
// ─────────────────────────────────────────────────────────────

type ScoredCell = {
  cell: ProcessedCell;
  benefit: number;
};

/**
 * Run greedy top-K priority selection.
 *
 * Algorithm:
 *   1. Compute benefit for every land cell with impactExposure.score > 0.
 *   2. Sort by benefit descending (stable sort preserves cellId order on tie).
 *   3. Select cells greedily:
 *        - Skip if already covered by an adjacent selected cell.
 *   4. Stop when K cells are selected or candidates exhausted.
 *   5. Assign contiguous ranks 1..N (N <= K if not enough candidates).
 *
 * INVARIANT: Changing K changes the selected SET but never changes
 * the benefit score of any individual cell.
 */
export function runGreedyTopK(
  processedCells: Map<string, ProcessedCell>,
  k: number,
  objective: PriorityObjective,
  generatedAt: string
): PriorityRecommendation[] {
  if (k <= 0) return [];

  // Step 1: Score all eligible land cells
  const scored: ScoredCell[] = [];
  for (const cell of processedCells.values()) {
    if (!cell.isLand) continue;
    if (cell.impactExposure.score <= 0) continue;

    const base = computeBenefitScore(
      cell.impactExposure.score,
      cell.infrastructure.combinedCriticality,
      cell.infrastructure.dependencyCentrality
    );
    const benefit = applyObjectiveAdjustment(
      base,
      cell.impactExposure.score,
      cell.infrastructure.combinedCriticality,
      cell.infrastructure.dependencyCentrality,
      objective
    );

    scored.push({ cell, benefit });
  }

  // Step 2: Sort descending; secondary sort by cellId for determinism
  scored.sort((a, b) =>
    b.benefit !== a.benefit
      ? b.benefit - a.benefit
      : a.cell.cellId.localeCompare(b.cell.cellId)
  );

  // Step 3 & 4: Greedy selection with H3 overlap guard
  const selected: ScoredCell[] = [];
  const selectedIds: string[] = [];

  for (const candidate of scored) {
    if (selected.length >= k) break;

    // Check H3 neighbor overlap with already-selected cells
    const overlaps = selectedIds.some((sid) =>
      areH3Neighbors(sid, candidate.cell.cellId)
    );
    if (overlaps) continue;

    selected.push(candidate);
    selectedIds.push(candidate.cell.cellId);
  }

  // Step 5: Assign contiguous ranks 1..N and build PriorityRecommendation
  const recommendations: PriorityRecommendation[] = [];

  for (let i = 0; i < selected.length; i++) {
    const { cell, benefit } = selected[i]!;
    const rank = i + 1;

    // Mark the cell's priority rank
    cell.priority.rank = rank;
    cell.priority.score = round4(benefit);
    cell.priority.interventionBenefit = round4(benefit);

    const rec: PriorityRecommendation = {
      rank,
      cellId: cell.cellId,
      score: round4(benefit),
      expectedBenefit: round4(benefit),

      drivers: {
        hazard: cell.hazard.combined,
        exposure: cell.exposure.combined,
        susceptibility: round4(
          cell.susceptibility.surgeExposed
            ? cell.susceptibility.floodSusceptibility
            : cell.susceptibility.floodSusceptibility * 0.6 + cell.susceptibility.windExposure * 0.4
        ),
        criticality: cell.infrastructure.combinedCriticality,
        dependencyCentrality: cell.infrastructure.dependencyCentrality,
      },

      recommendedActions: buildRecommendedActions(cell),
      evidence: buildEvidence(cell),
      confidence: cell.impactExposure.confidence,

      provenance: {
        engineVersion: ENGINE_VERSION,
        generatedAt,
        objective,
        responseCapacity: k,
      },
    };

    recommendations.push(rec);
  }

  return recommendations;
}

// ─────────────────────────────────────────────────────────────
// DETERMINISTIC TEXT EXPLANATION (Gemini fallback)
// ─────────────────────────────────────────────────────────────

/**
 * Build a deterministic text explanation for a priority recommendation.
 *
 * This is the FALLBACK used when Gemini is unavailable or fails.
 * It must only cite fields that actually exist in the recommendation —
 * never invent numbers or make up evidence.
 */
export function buildDeterministicExplanation(
  rec: PriorityRecommendation
): string {
  const {
    rank, score, drivers, confidence,
    recommendedActions, evidence
  } = rec;

  const lines = [
    `PRIORITY #${rank} — Model-derived impact priority score: ${(score * 100).toFixed(1)}%`,
    ``,
    `KEY DRIVERS:`,
    `  Hazard exposure:             ${(drivers.hazard * 100).toFixed(1)}%`,
    `  Population/building exposure: ${(drivers.exposure * 100).toFixed(1)}%`,
    `  Flood susceptibility:        ${(drivers.susceptibility * 100).toFixed(1)}%`,
    `  Infrastructure criticality:  ${(drivers.criticality * 100).toFixed(1)}%`,
    `  Dependency centrality:       ${(drivers.dependencyCentrality * 100).toFixed(1)}%`,
    ``,
    `CONFIDENCE: ${(confidence.overall * 100).toFixed(0)}%`,
    `  Data source tier: ${confidence.limitingTier}`,
    confidence.notes?.length ? `  Notes: ${confidence.notes.join("; ")}` : null,
    ``,
    `RECOMMENDED ACTIONS:`,
    ...recommendedActions.map((a) => `  • ${a}`),
    ``,
    `EVIDENCE (from engine — not invented):`,
    ...evidence.slice(0, 8).map((e) => `  ${e}`),
    ``,
    `CAUTION: This is a decision-support model output, not an official warning.`,
    `Human review required before dispatch.`,
    `Engine: ${rec.provenance.engineVersion} | Objective: ${rec.provenance.objective} | K: ${rec.provenance.responseCapacity}`,
  ].filter((l): l is string => l !== null);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
