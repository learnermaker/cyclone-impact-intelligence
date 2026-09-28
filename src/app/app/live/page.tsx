import type { Metadata } from "next";

export const metadata: Metadata = { title: "Live" };

/**
 * LIVE mode — active event monitoring.
 *
 * Shows current/near-live hazard scenario.
 * If no active cyclone: explicit empty state with Fani Replay and
 * Demo Scenario launch buttons. Never fabricates a current event.
 *
 * Phase 1 stub — UI wired in Phase 7.
 */
export default function LivePage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="text-slate-400 text-sm uppercase tracking-widest mb-2">
          Live Mode
        </p>
        <p className="text-2xl font-semibold text-slate-200">
          No active cyclone event
        </p>
        <p className="text-slate-500 mt-2 text-sm">
          Launch Fani 2019 Replay or load a Demo Scenario
        </p>
        {/* Buttons wired in Phase 7 */}
      </div>
    </div>
  );
}
