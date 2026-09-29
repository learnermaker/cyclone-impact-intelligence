/**
 * POST /api/replay/reveal
 *
 * Reveals actual post-event impact for the Fani replay.
 *
 * TEMPORAL FIREWALL — this is the explicit unlock moment:
 *   Before this endpoint is called, no post-event data is visible.
 *   Calling this endpoint transitions the session to REVEAL phase,
 *   making Sentinel-1 SAR flood extent and GPM event rainfall available.
 *
 * Data integration:
 *   Sentinel-1 flood extent (data/historical/fani/actual/sentinel1_flood_extent.json)
 *   → loaded via loadGEERevealData("REVEAL")
 *   → provides actualHighImpactCellIds for evaluation
 *   → enables real topKRecall / population / infrastructure metrics
 *
 * If actual data is unavailable, returns honest metricsUnavailableReason.
 * Never fabricates flood extent or evaluation metrics.
 */
import { type NextRequest, NextResponse } from "next/server";
import { runFaniDemoEngine } from "../../../../engine/runner";
import { computeReplayEvaluation } from "../../../../engine/evaluation/index";
import { loadGEERevealData } from "../../../../engine/loader/gee-loader";
import { FANI_KNOWN_PARAMETERS } from "../../../../config/index";
import type { ApiResponse } from "../../../../lib/types/index";
import type { ActualEvidenceInput } from "../../../../engine/evaluation/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Load Sentinel-1 derived flood extent as actual evidence.
 *
 * TEMPORAL FIREWALL: calls loadGEERevealData("REVEAL") which asserts
 * the phase is REVEAL or EVALUATE, not PREDICTION.
 *
 * Returns null if data is unavailable — triggers honest metricsUnavailableReason.
 * Never fabricates flood extent.
 */
function loadActualEvidence(): ActualEvidenceInput | null {
  try {
    // TEMPORAL FIREWALL ENFORCED: "REVEAL" phase allows access to Sentinel-1
    const revealData = loadGEERevealData("REVEAL");

    if (revealData.floodedCellIds.length === 0) return null;

    return {
      evidenceId: "sentinel1-fani-gee-actual",
      actualHighImpactCellIds: revealData.floodedCellIds,
      evidenceSource: "Sentinel-1 GRD SAR change detection — post-event inundation proxy",
      evidenceDate: "2019-05-04T00:00:00Z",
    };
  } catch {
    // File not found, or TemporalFirewallError (should not happen with "REVEAL")
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const k = Math.max(1, parseInt(String(body.k ?? "10"), 10) || 10);
    const objective = String(body.objective ?? "balanced") as "balanced";

    // Run engine with GEE-enriched profile for the reveal
    const result = await runFaniDemoEngine({
      responseCapacity: k,
      objective,
      dataProfile: "GEE_ENRICHED",
    });

    // Load actual evidence — unlocked by this REVEAL step
    const actualEvidence = loadActualEvidence();

    // Compute evaluation metrics against real flood extent
    const evaluation = computeReplayEvaluation(
      result.recommendations,
      result.cells,
      // Use the enriched fixtureStatus — if MIXED, we have real data for metrics
      result.fixtureStatus,
      FANI_KNOWN_PARAMETERS.predictionCutoffAt,
      actualEvidence
    );

    const hasRealMetrics = !evaluation.metricsUnavailableReason &&
      (evaluation.metrics.precisionAtK !== undefined);

    return NextResponse.json({
      ok: true,
      data: {
        revealed: true,
        phase: "EVALUATE",
        evaluation: {
          ...evaluation,
          manifest: result.manifest,
        },
        actualEvidenceAvailable: actualEvidence !== null,
        floodedCellsDetected: actualEvidence?.actualHighImpactCellIds.length ?? 0,
        hasRealMetrics,
        dataProfile: result.dataProfileId,
        enrichmentStats: result.enrichmentStats,

        actualEvidencePlaceholder:
          actualEvidence === null
            ? {
                status: "NOT_LOADED",
                message:
                  "Sentinel-1 flood extent not available. " +
                  "Run: python pipelines/gee/04_sentinel1_flood_actual.py",
                requiredFiles: [
                  "data/historical/fani/actual/sentinel1_flood_extent.json",
                ],
              }
            : null,

        fixtureStatus: result.fixtureStatus,
      },
      servedAt: new Date().toISOString(),
    } satisfies ApiResponse<unknown>);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: "ENGINE_ERROR", message: String(err) }, servedAt: new Date().toISOString() },
      { status: 503 }
    );
  }
}
