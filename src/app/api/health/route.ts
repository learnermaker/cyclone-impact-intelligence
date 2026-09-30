/**
 * GET /api/health
 *
 * Health / readiness endpoint for Cloud Run, operators, and automated checks.
 *
 * Returns:
 *   ok            boolean  — always true when server is running
 *   status        string   — "healthy"
 *   engineVersion string   — from config
 *   dataVersion   string   — from config
 *   geminiStatus  string   — "CONFIGURED" | "UNCONFIGURED"
 *   geminiModel   string   — model ID from env or config default
 *   timestamp     string   — ISO-8601
 *
 * geminiStatus semantics:
 *   UNCONFIGURED — no GEMINI_API_KEY; deterministic fallback is always active.
 *                  AI explanations and advisory language will use the deterministic
 *                  engine; no Gemini calls are attempted.
 *   CONFIGURED   — GEMINI_API_KEY is set; live Gemini function-calling is attempted
 *                  for each query. The app falls back to deterministic output on
 *                  timeout or provider error — this is safe but not verified live.
 *
 * This endpoint never exposes the API key value.
 */
import { NextResponse } from "next/server";
import { ENGINE_VERSION, DATA_VERSION, GEMINI_CONFIG } from "../../../config/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GeminiStatus = "CONFIGURED" | "UNCONFIGURED";

export async function GET(): Promise<NextResponse> {
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  const geminiStatus: GeminiStatus =
    apiKey.trim() !== "" ? "CONFIGURED" : "UNCONFIGURED";

  const geminiModel =
    (process.env.GEMINI_MODEL ?? GEMINI_CONFIG.defaultModel) || "unset";

  return NextResponse.json({
    ok: true,
    status: "healthy",
    engineVersion: ENGINE_VERSION,
    dataVersion: DATA_VERSION,
    geminiStatus,
    geminiModel: geminiStatus === "CONFIGURED" ? geminiModel : "N/A (no key)",
    timestamp: new Date().toISOString(),
  });
}
