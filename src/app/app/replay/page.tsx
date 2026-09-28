import type { Metadata } from "next";

export const metadata: Metadata = { title: "Replay — Fani 2019" };

/**
 * REPLAY mode — Cyclone Fani 2019 T−24h historical replay.
 *
 * State machine:
 *   PREDICTION → EXPLAIN → SCENARIO → ADVISORY → APPROVAL → REVEAL → EVALUATE
 *
 * Information firewall: actual post-event data is physically separate
 * and only loaded by the explicit REVEAL action.
 *
 * Phase 1 stub — replay state machine and UI wired in Phase 5.
 */
export default function ReplayPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center max-w-md">
        <p className="text-slate-400 text-xs uppercase tracking-widest mb-3">
          Replay Mode
        </p>
        <p className="text-xl font-semibold text-slate-200 mb-2">
          Cyclone Fani 2019 — T−24h Replay
        </p>
        <p className="text-slate-500 text-sm leading-relaxed">
          Reconstruct pre-event inputs at T−24h, run the impact engine,
          prioritize response capacity, explain priorities, then reveal
          actual post-event impact and compute evaluation metrics.
        </p>
        <p className="text-slate-600 text-xs mt-4">
          Replay engine wired in Phase 5
        </p>
      </div>
    </div>
  );
}
