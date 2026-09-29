/**
 * POST /api/advisory/[id]/approve
 * POST /api/advisory/[id]/reject  (handled via query param)
 *
 * Human approval is mandatory before dispatch.
 * This route transitions PENDING → APPROVED or REJECTED.
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  approveAdvisory,
  rejectAdvisory,
  getAdvisory,
} from "../../../../../engine/advisory/index";
import type { ApiResponse } from "../../../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { action = "approve", approvedBy = "operator", notes } = body as Record<string, string>;

  const existing = getAdvisory(id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: `Advisory ${id} not found` }, servedAt: new Date().toISOString() },
      { status: 404 }
    );
  }

  const updated =
    action === "reject"
      ? rejectAdvisory(id, notes)
      : approveAdvisory(id, approvedBy, notes);

  return NextResponse.json({
    ok: true,
    data: { advisory: updated },
    servedAt: new Date().toISOString(),
  } satisfies ApiResponse<unknown>);
}
