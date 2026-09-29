/**
 * GET /api/health
 * Health/readiness endpoint for Cloud Run.
 */
import { NextResponse } from "next/server";
import { ENGINE_VERSION, DATA_VERSION } from "../../../config/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    status: "healthy",
    engineVersion: ENGINE_VERSION,
    dataVersion: DATA_VERSION,
    timestamp: new Date().toISOString(),
  });
}
