/**
 * Root page — redirects to the main application shell.
 *
 * The application is organized into four modes:
 *   /app/live    — Active event monitoring
 *   /app/impact  — Hazard × exposure × susceptibility map
 *   /app/action  — Priority recommendations
 *   /app/replay  — Fani 2019 historical replay
 *
 * Phase 1: Shell with mode navigation and placeholder content.
 * Engine, map, and Gemini are wired in subsequent phases.
 */

import { redirect } from "next/navigation";

export default function RootPage() {
  // Redirect to the replay mode — primary demo entry point
  redirect("/app/replay");
}
