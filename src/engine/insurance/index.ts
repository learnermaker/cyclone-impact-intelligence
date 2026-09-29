/**
 * Insurance / Parametric Liquidity Engine
 *
 * Evaluates illustrative parametric trigger conditions against the current scenario.
 *
 * ALL OUTPUT MUST BE LABELLED:
 *   "ILLUSTRATIVE POLICY"
 *   "INDICATIVE PARAMETRIC LIQUIDITY ESTIMATE"
 *
 * No real insurer. No real contract. No real payout.
 * This is a demonstration of the trigger/payout concept only.
 */

import type { InsuranceTrigger } from "../../lib/types/index";
import { DEMO_INSURANCE_POLICY, ENGINE_VERSION } from "../../config/index";

type ScenarioParameters = {
  windKph: number;
  rainfall24hMm: number;
  surgeM: number;
};

type TriggerStatus = "TRIGGERED" | "NOT_TRIGGERED" | "UNCERTAIN";

// ─────────────────────────────────────────────────────────────
// TRIGGER EVALUATION
// ─────────────────────────────────────────────────────────────

/**
 * Evaluate a single parametric trigger threshold.
 *
 * UNCERTAIN if within 10% of the threshold (basis risk zone).
 */
function evaluateSingleTrigger(
  value: number,
  threshold: number
): TriggerStatus {
  const margin = threshold * 0.1;
  if (value >= threshold) return "TRIGGERED";
  if (value >= threshold - margin) return "UNCERTAIN";
  return "NOT_TRIGGERED";
}

/**
 * Evaluate all trigger conditions for the illustrative policy.
 *
 * Overall status = triggered if ANY threshold is met.
 * UNCERTAIN if any threshold is in the basis risk zone but none met.
 */
function aggregateTriggerStatus(statuses: TriggerStatus[]): TriggerStatus {
  if (statuses.some((s) => s === "TRIGGERED")) return "TRIGGERED";
  if (statuses.some((s) => s === "UNCERTAIN")) return "UNCERTAIN";
  return "NOT_TRIGGERED";
}

/**
 * Compute indicative liquidity based on trigger status.
 * ILLUSTRATIVE ONLY — not a real payout calculation.
 */
function computeIndicativeLiquidity(
  status: TriggerStatus,
  payout: number
): number {
  switch (status) {
    case "TRIGGERED": return payout;
    case "UNCERTAIN": return payout * 0.5; // partial basis-risk scenario
    case "NOT_TRIGGERED": return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN EVALUATION
// ─────────────────────────────────────────────────────────────

/**
 * Evaluate the illustrative insurance policy against current scenario values.
 *
 * Returns an InsuranceTrigger object with label = "ILLUSTRATIVE POLICY".
 * Never returns a real contract or payout.
 */
export function evaluateInsuranceTrigger(
  scenario: ScenarioParameters
): InsuranceTrigger {
  const policy = DEMO_INSURANCE_POLICY;
  const evaluatedAt = new Date().toISOString();

  // Wind: convert kph → m/s for threshold comparison
  const windMs = scenario.windKph / 3.6;
  const windStatus = policy.thresholds.windMs
    ? evaluateSingleTrigger(windMs, policy.thresholds.windMs)
    : "NOT_TRIGGERED";

  const rainStatus = policy.thresholds.rain24hMm
    ? evaluateSingleTrigger(scenario.rainfall24hMm, policy.thresholds.rain24hMm)
    : "NOT_TRIGGERED";

  const surgeStatus = policy.thresholds.surgeM
    ? evaluateSingleTrigger(scenario.surgeM, policy.thresholds.surgeM)
    : "NOT_TRIGGERED";

  const overallStatus = aggregateTriggerStatus([windStatus, rainStatus, surgeStatus]);
  const indicativeLiquidity = computeIndicativeLiquidity(overallStatus, policy.payout);

  // Basis risk: gap between modeled trigger and actual impact
  // For demo: if UNCERTAIN, basis risk = 0.3; if TRIGGERED, 0.1; else 0.5
  const basisRiskIndicator =
    overallStatus === "TRIGGERED" ? 0.1
    : overallStatus === "UNCERTAIN" ? 0.3
    : 0.5;

  return {
    policyId: policy.policyId,
    region: policy.region,
    thresholds: {
      windMs: policy.thresholds.windMs,
      rain24hMm: policy.thresholds.rain24hMm,
      surgeM: policy.thresholds.surgeM,
    },
    payout: policy.payout,
    status: overallStatus,
    indicativeLiquidity,
    basisRiskIndicator,
    label: "ILLUSTRATIVE POLICY",
    provenance: {
      engineVersion: ENGINE_VERSION,
      evaluatedAt,
      source: {
        id: "demo-insurance-policy",
        tier: "DEMO_FIXTURE",
        description: policy.description,
      },
    },
  };
}

/**
 * Describe trigger condition results in human-readable format.
 * Used by Gemini for explanation and fallback text.
 */
export function buildTriggerExplanation(trigger: InsuranceTrigger): string {
  return [
    `ILLUSTRATIVE PARAMETRIC POLICY — ${trigger.policyId}`,
    `Region: ${trigger.region}`,
    ``,
    `Trigger thresholds:`,
    `  Wind:     ≥ ${trigger.thresholds.windMs?.toFixed(1) ?? "N/A"} m/s`,
    `  Rainfall: ≥ ${trigger.thresholds.rain24hMm?.toFixed(0) ?? "N/A"} mm/24h`,
    `  Surge:    ≥ ${trigger.thresholds.surgeM?.toFixed(1) ?? "N/A"} m`,
    ``,
    `Trigger status: ${trigger.status}`,
    `Indicative liquidity: INR ${trigger.indicativeLiquidity.toLocaleString()} (illustrative only)`,
    `Basis risk indicator: ${((trigger.basisRiskIndicator ?? 0) * 100).toFixed(0)}%`,
    ``,
    `⚠ ILLUSTRATIVE POLICY — Not a real contract. No real payout.`,
    `  This is a demonstration of the parametric trigger concept only.`,
  ].join("\n");
}
