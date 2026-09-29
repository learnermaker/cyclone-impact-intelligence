/**
 * GET  /api/advisory    — list all advisories
 * POST /api/advisory    — generate advisory for a cell/recommendation
 */
import { type NextRequest, NextResponse } from "next/server";
import { runFaniDemoEngine } from "../../../engine/runner";
import {
  generateStructuredAdvisory,
  listAdvisories,
} from "../../../engine/advisory/index";
import type { ApiResponse } from "../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const advisories = listAdvisories();
  return NextResponse.json({
    ok: true,
    data: { advisories, count: advisories.length },
    servedAt: new Date().toISOString(),
  } satisfies ApiResponse<unknown>);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      cellId,
      k = 10,
      surgeHeightM = 1.5,
      objective = "balanced",
      generatedBy = "deterministic-engine",
    } = body as Record<string, unknown>;

    if (!cellId || typeof cellId !== "string") {
      return NextResponse.json(
        { ok: false, error: { code: "MISSING_PARAM", message: "cellId is required" }, servedAt: new Date().toISOString() },
        { status: 400 }
      );
    }

    const result = await runFaniDemoEngine({
      responseCapacity: Number(k),
      surgeHeightM: Number(surgeHeightM),
      objective: String(objective) as "balanced",
    });

    const cell = result.cells.get(cellId);
    if (!cell) {
      return NextResponse.json(
        { ok: false, error: { code: "CELL_NOT_FOUND", message: `Cell ${cellId} not found` }, servedAt: new Date().toISOString() },
        { status: 404 }
      );
    }

    const rec =
      result.recommendations.find((r) => r.cellId === cellId) ??
      result.recommendations[0];

    if (!rec) {
      return NextResponse.json(
        { ok: false, error: { code: "NO_RECOMMENDATIONS", message: "No priority recommendations available" }, servedAt: new Date().toISOString() },
        { status: 422 }
      );
    }

    const advisory = generateStructuredAdvisory(
      rec,
      cell,
      cellId,
      generatedBy as "deterministic-engine" | "gemini-assisted"
    );

    return NextResponse.json({
      ok: true,
      data: { advisory },
      servedAt: new Date().toISOString(),
    } satisfies ApiResponse<unknown>);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: "ENGINE_ERROR", message: String(err) }, servedAt: new Date().toISOString() },
      { status: 503 }
    );
  }
}
