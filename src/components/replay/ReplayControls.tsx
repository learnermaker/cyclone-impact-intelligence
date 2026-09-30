"use client";

/**
 * ReplayControls — compact horizontal phase strip.
 *
 * State machine and interaction behavior are UNCHANGED.
 * Visual redesign: seven phases rendered as a connected pill strip
 * (height ≈ 28px for the strip + 14px contextual line = ~42px total).
 *
 * Phase states:
 *   complete  — muted green, checkmark prefix
 *   current   — blue filled pill, white text
 *   available — quiet stone, hover-actionable
 *   locked    — dim, cursor-not-allowed
 */

import type { ReplayPhase } from "@/lib/types/index";

const PHASES: ReplayPhase[] = [
  "PREDICTION", "EXPLAIN", "SCENARIO", "ADVISORY", "APPROVAL", "REVEAL", "EVALUATE",
];

const PHASE_SHORT: Record<ReplayPhase, string> = {
  PREDICTION: "T−24h",
  EXPLAIN:    "Explain",
  SCENARIO:   "Scenario",
  ADVISORY:   "Advisory",
  APPROVAL:   "Approve",
  REVEAL:     "Reveal",
  EVALUATE:   "Evaluate",
};

const PHASE_CONTEXT: Record<ReplayPhase, string> = {
  PREDICTION: "T−24H prediction · Pre-event data only",
  EXPLAIN:    "Click Why #N on a priority card to request an explanation",
  SCENARIO:   "Adjust wind / rainfall / surge — priorities update live",
  ADVISORY:   "Generating structured advisory from engine evidence",
  APPROVAL:   "Human approval required before dispatch",
  REVEAL:     "Reveal actual post-event impact to lift the information firewall",
  EVALUATE:   "Evaluation metrics computed against Sentinel-1 proxy observations",
};

type Props = {
  currentPhase: ReplayPhase;
  onPhaseChange: (phase: ReplayPhase) => void;
  actualRevealed: boolean;
  evaluationResult?: {
    metricsUnavailableReason?: string;
    metrics?: Record<string, number | undefined>;
    baselineMetrics?: Record<string, number>;
  } | null;
};

export function ReplayControls({
  currentPhase,
  onPhaseChange,
  actualRevealed,
  evaluationResult,
}: Props) {
  const currentIdx = PHASES.indexOf(currentPhase);

  function isLocked(phase: ReplayPhase, i: number): boolean {
    if (phase === "REVEAL" && actualRevealed) return false;
    if (phase === "EVALUATE" && !actualRevealed) return true;
    return i > currentIdx + 1;
  }

  // Override context line for special states
  let contextLine = PHASE_CONTEXT[currentPhase];
  if (currentPhase === "REVEAL" && actualRevealed) {
    contextLine = "Post-event evidence loaded · Viewing historical data";
  }
  if (currentPhase === "EVALUATE" && evaluationResult?.metricsUnavailableReason) {
    contextLine = `Evaluation: ${evaluationResult.metricsUnavailableReason}`;
  }

  return (
    <div className="space-y-0.5">
      {/* ── Phase strip ──────────────────────────────────── */}
      <div className="flex items-center gap-0.5" role="tablist" aria-label="Replay phases">
        {PHASES.map((phase, i) => {
          const complete   = i < currentIdx;
          const current    = i === currentIdx;
          const locked     = isLocked(phase, i);
          const available  = !current && !complete && !locked;

          return (
            <div key={phase} className="flex items-center gap-0.5">
              {i > 0 && (
                <span className="text-[9px] text-stone-300 flex-shrink-0 select-none">›</span>
              )}
              <button
                role="tab"
                aria-selected={current}
                disabled={locked}
                onClick={() => !locked && onPhaseChange(phase)}
                title={PHASE_CONTEXT[phase]}
                className={[
                  "flex items-center gap-0.5 rounded px-2 py-1 text-[10px] font-semibold",
                  "transition-all leading-none select-none whitespace-nowrap",
                  current
                    ? "bg-blue-600 text-white shadow-sm"
                    : complete
                    ? "text-green-700 hover:bg-green-50 cursor-pointer"
                    : locked
                    ? "text-stone-300 cursor-not-allowed"
                    : "text-stone-500 hover:bg-stone-200 hover:text-stone-700 cursor-pointer",
                ].join(" ")}
              >
                {complete && (
                  <span className="text-green-600 mr-0.5" aria-hidden>✓</span>
                )}
                {PHASE_SHORT[phase]}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Contextual line ──────────────────────────────── */}
      <p className="text-[10px] text-stone-500 leading-tight pl-0.5">
        {contextLine}
      </p>
    </div>
  );
}
