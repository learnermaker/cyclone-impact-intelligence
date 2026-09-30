/**
 * POST /api/advisory/[id]/dispatch
 *
 * Simulates advisory dispatch to a webhook endpoint.
 * REQUIRES APPROVED status — rejects PENDING or REJECTED advisories.
 * This is a decision-support prototype: advisory dispatch is SIMULATED.
 * No autonomous emergency dispatch occurs.
 *
 * SECURITY NOTE (production deployments):
 *   DISPATCH_WEBHOOK_URL must be explicitly configured to an allowlisted
 *   destination. In production this requires:
 *   - Authenticated operator identity (RBAC)
 *   - Allowlisted and verified dispatch endpoint
 *   - Durable advisory and audit storage
 *   - Idempotency key on every dispatch
 *   - Controlled integration with emergency communication systems
 *
 * For the demo, DISPATCH_WEBHOOK_URL defaults to localhost and all dispatches
 * include "SIMULATED DISPATCH — decision-support prototype only" in the body.
 */
import { type NextRequest, NextResponse } from "next/server";
import {
  getAdvisory,
  recordDispatch,
} from "../../../../../engine/advisory/index";
import type { ApiResponse } from "../../../../../lib/types/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DISPATCH_URL =
  process.env.DISPATCH_WEBHOOK_URL ?? "http://localhost:3000/api/webhook/receive";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  const adv = getAdvisory(id);
  if (!adv) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: `Advisory ${id} not found` }, servedAt: new Date().toISOString() },
      { status: 404 }
    );
  }

  if (adv.approval.status !== "APPROVED") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "NOT_APPROVED",
          message: `Advisory must be APPROVED before dispatch. Current status: ${adv.approval.status}`,
        },
        servedAt: new Date().toISOString(),
      },
      { status: 422 }
    );
  }

  // Simulate dispatch — in production, this would POST to DISPATCH_URL
  let success = true;
  let responseCode = 200;

  try {
    // Attempt real webhook if running (for local demo)
    const res = await fetch(DISPATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        advisory: adv,
        dispatchedAt: new Date().toISOString(),
        note: "SIMULATED DISPATCH — decision-support prototype only",
      }),
      signal: AbortSignal.timeout(3_000),
    });
    responseCode = res.status;
    success = res.ok;
  } catch {
    // Webhook unreachable — still record as simulated
    success = true;
    responseCode = 0; // 0 = simulated
  }

  const updated = recordDispatch(id, DISPATCH_URL, success, responseCode);

  return NextResponse.json({
    ok: true,
    data: {
      advisory: updated,
      dispatched: true,
      endpointUrl: DISPATCH_URL,
      responseCode,
      note: "SIMULATED DISPATCH — decision-support prototype only. Not an operational emergency warning.",
    },
    servedAt: new Date().toISOString(),
  } satisfies ApiResponse<unknown>);
}
