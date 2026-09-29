/**
 * POST /api/gemini/query
 *
 * Queries Gemini with function calling over the deterministic engine.
 * Falls back to deterministic explanation if Gemini is unavailable.
 *
 * Body:
 *   question  required  The operator's natural language question
 *   cellId    optional  Context cell ID for cell-specific questions
 *   k         optional  Response capacity for priority questions (default 10)
 *   context   optional  Additional structured context
 *
 * The fallback is always available — Gemini being down never breaks the UI.
 */
import { type NextRequest, NextResponse } from "next/server";
import { queryGemini } from "../../../../gemini/client";
import { runFaniDemoEngine } from "../../../../engine/runner";
import { buildDeterministicExplanation } from "../../../../engine/priority/index";
import type { ApiResponse } from "../../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const question = String(body.question ?? "").trim();

  if (!question) {
    return NextResponse.json(
      { ok: false, error: { code: "MISSING_PARAM", message: "question is required" }, servedAt: new Date().toISOString() },
      { status: 400 }
    );
  }

  const cellId = body.cellId ? String(body.cellId) : undefined;
  const k = Math.max(1, parseInt(String(body.k ?? "10"), 10) || 10);
  const userContext = body.context ?? null;

  try {
    // Build context object for Gemini
    let context: Record<string, unknown> = {};
    if (cellId) {
      const result = await runFaniDemoEngine({ responseCapacity: k });
      const cell = result.cells.get(cellId);
      const rec = result.recommendations.find((r) => r.cellId === cellId);
      if (cell) {
        context = {
          cellId,
          hazardCombined: cell.hazard.combined,
          impactScore: cell.impactExposure.score,
          population: cell.exposure.population,
          surgeExposed: cell.hazard.surgeExposed,
          priorityRank: cell.priority.rank,
          confidence: cell.impactExposure.confidence.overall,
          dataStatus: result.fixtureStatus,
        };
      }
      if (rec) {
        // Also provide deterministic explanation as fallback in context
        context.deterministicExplanation = buildDeterministicExplanation(rec);
      }
    }

    if (userContext) {
      context.additionalContext = userContext;
    }

    const geminiResponse = await queryGemini(question, Object.keys(context).length ? context : undefined);

    return NextResponse.json({
      ok: true,
      data: {
        question,
        answer: geminiResponse.text,
        isFallback: geminiResponse.isFallback,
        fallbackReason: geminiResponse.fallbackText,
        toolCalls: geminiResponse.toolCalls ?? [],
      },
      servedAt: new Date().toISOString(),
    } satisfies ApiResponse<unknown>);
  } catch (err) {
    // Even if everything fails, return deterministic fallback
    return NextResponse.json({
      ok: true,
      data: {
        question,
        answer: `Unable to process question at this time. Use /api/priorities for current rankings and /api/explain/[cellId] for cell-specific evidence.`,
        isFallback: true,
        fallbackReason: String(err),
        toolCalls: [],
      },
      servedAt: new Date().toISOString(),
    } satisfies ApiResponse<unknown>);
  }
}
