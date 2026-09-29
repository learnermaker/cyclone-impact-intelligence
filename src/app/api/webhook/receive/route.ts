/**
 * POST /api/webhook/receive
 *
 * Simulated municipal dispatch webhook endpoint.
 * Receives advisory dispatch payloads and records them.
 *
 * In a real deployment, this would be replaced by an actual municipal
 * emergency management system endpoint. For the demo, this local endpoint
 * confirms receipt and returns a delivery acknowledgement.
 *
 * This is a DECISION-SUPPORT PROTOTYPE. Not an operational emergency system.
 */
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// In-memory delivery log (session-scoped)
const deliveryLog: Array<{
  receivedAt: string;
  payload: unknown;
  source: string;
}> = [];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}));
  const source = request.headers.get("user-agent") ?? "unknown";

  const entry = {
    receivedAt: new Date().toISOString(),
    payload: body,
    source,
  };

  deliveryLog.push(entry);

  // Keep log bounded
  if (deliveryLog.length > 100) deliveryLog.shift();

  return NextResponse.json({
    ok: true,
    data: {
      acknowledged: true,
      receivedAt: entry.receivedAt,
      note: "SIMULATED WEBHOOK — decision-support prototype. Not an operational emergency warning system.",
    },
    servedAt: new Date().toISOString(),
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    data: {
      log: deliveryLog,
      count: deliveryLog.length,
      note: "SIMULATED DISPATCH LOG — for demo purposes only",
    },
    servedAt: new Date().toISOString(),
  });
}
