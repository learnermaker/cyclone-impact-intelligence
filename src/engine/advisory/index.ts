/**
 * Advisory Engine
 *
 * Generates structured advisories from deterministic engine outputs.
 * Gemini may convert these into operator-readable prose, but the
 * structured advisory is the source of truth.
 *
 * Advisory lifecycle: PENDING → APPROVED | REJECTED → DISPATCHED
 * Human approval is mandatory before dispatch.
 *
 * In-memory store is session-scoped (no DB required for demo).
 * In multi-instance Cloud Run deployments, use a shared store.
 */

import { randomUUID } from "crypto";
import type {
  Advisory,
  AdvisorySeverity,
  PriorityRecommendation,
} from "../../lib/types/index";
import type { ProcessedCell } from "../types";
import { ADVISORY_SEVERITY_THRESHOLDS, ENGINE_VERSION } from "../../config/index";

// ─────────────────────────────────────────────────────────────
// IN-MEMORY ADVISORY STORE — singleton across Next.js workers
//
// Next.js dev/prod can spawn multiple Node.js workers. A module-level
// `const map = new Map()` would create separate instances per worker,
// causing "advisory not found" errors when create/approve/dispatch
// requests land on different workers.
//
// Solution: store on `globalThis` so all workers share the same instance
// (the globalThis pattern is the standard Next.js singleton approach).
// ─────────────────────────────────────────────────────────────

const globalForAdvisories = globalThis as typeof globalThis & {
  _advisoryStore?: Map<string, Advisory>;
};
if (!globalForAdvisories._advisoryStore) {
  globalForAdvisories._advisoryStore = new Map<string, Advisory>();
}
const advisoryStore = globalForAdvisories._advisoryStore;

// ─────────────────────────────────────────────────────────────
// SEVERITY DETERMINATION
// ─────────────────────────────────────────────────────────────

export function evaluateAdvisorySeverity(impactScore: number): AdvisorySeverity {
  if (impactScore >= ADVISORY_SEVERITY_THRESHOLDS.CRITICAL) return "CRITICAL";
  if (impactScore >= ADVISORY_SEVERITY_THRESHOLDS.HIGH) return "HIGH";
  if (impactScore >= ADVISORY_SEVERITY_THRESHOLDS.MEDIUM) return "MEDIUM";
  return "LOW";
}

// ─────────────────────────────────────────────────────────────
// ADVISORY GENERATION
// ─────────────────────────────────────────────────────────────

/**
 * Generate a structured advisory from a priority recommendation + cell data.
 * This is deterministic — Gemini can enhance the language but cannot alter the evidence.
 */
export function generateStructuredAdvisory(
  rec: PriorityRecommendation,
  cell: ProcessedCell,
  zoneId: string,
  generatedBy: "deterministic-engine" | "gemini-assisted" = "deterministic-engine",
  scenarioId?: string
): Advisory {
  const advisoryId = randomUUID();
  const severity = evaluateAdvisorySeverity(cell.impactExposure.score);

  // Determine principal hazard drivers
  const drivers: string[] = [];
  if (cell.hazard.surge > 0.4) drivers.push("surge");
  if (cell.hazard.rainfall > 0.4) drivers.push("rainfall");
  if (cell.hazard.wind > 0.5) drivers.push("wind");
  if (cell.infrastructure.combinedCriticality > 0.7)
    drivers.push("critical-infrastructure exposure");
  if (drivers.length === 0) drivers.push("combined hazard");

  const evidence = rec.evidence.map((e, i) => ({
    field: `evidence_${i}`,
    value: e,
    source: {
      id: rec.provenance.engineVersion,
      tier: cell.impactExposure.confidence.limitingTier,
      description: `Engine output — ${rec.provenance.engineVersion}`,
    },
  }));

  const advisory: Advisory = {
    advisoryId,
    zoneId,
    severity,
    drivers,
    recommendedActions: rec.recommendedActions,
    evidence,
    confidence: cell.impactExposure.confidence,
    generatedBy,
    approval: { status: "PENDING" },
    provenance: {
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      scenarioId,
    },
  };

  advisoryStore.set(advisoryId, advisory);
  return advisory;
}

// ─────────────────────────────────────────────────────────────
// ADVISORY CRUD
// ─────────────────────────────────────────────────────────────

export function getAdvisory(id: string): Advisory | undefined {
  return advisoryStore.get(id);
}

export function listAdvisories(): Advisory[] {
  return Array.from(advisoryStore.values());
}

export function approveAdvisory(
  id: string,
  approvedBy: string,
  notes?: string
): Advisory | null {
  const adv = advisoryStore.get(id);
  if (!adv) return null;
  if (adv.approval.status !== "PENDING") return adv;
  const updated: Advisory = {
    ...adv,
    approval: {
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date().toISOString(),
      notes,
    },
  };
  advisoryStore.set(id, updated);
  return updated;
}

export function rejectAdvisory(id: string, reason?: string): Advisory | null {
  const adv = advisoryStore.get(id);
  if (!adv) return null;
  const updated: Advisory = {
    ...adv,
    approval: {
      status: "REJECTED",
      notes: reason,
    },
  };
  advisoryStore.set(id, updated);
  return updated;
}

/**
 * Record dispatch. For demo: always simulated.
 * Approval is required — rejects dispatch if not APPROVED.
 */
export function recordDispatch(
  id: string,
  endpointUrl: string,
  success: boolean,
  responseCode?: number
): Advisory | null {
  const adv = advisoryStore.get(id);
  if (!adv) return null;
  if (adv.approval.status !== "APPROVED") {
    throw new Error(
      `Cannot dispatch advisory ${id}: approval status is ${adv.approval.status}`
    );
  }
  const updated: Advisory = {
    ...adv,
    dispatch: {
      status: success ? "SIMULATED_SENT" : "FAILED",
      sentAt: new Date().toISOString(),
      endpointUrl,
      responseCode,
    },
  };
  advisoryStore.set(id, updated);
  return updated;
}
