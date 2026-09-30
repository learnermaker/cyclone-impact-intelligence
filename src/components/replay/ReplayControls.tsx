"use client";

import type { ReplayPhase } from "@/lib/types/index";

const PHASES: ReplayPhase[] = [
  "PREDICTION", "EXPLAIN", "SCENARIO", "ADVISORY", "APPROVAL", "REVEAL", "EVALUATE",
];

const PHASE_LABELS: Record<ReplayPhase, string> = {
  PREDICTION: "T-24h Prediction",
  EXPLAIN:    "Explain",
  SCENARIO:   "Scenario",
  ADVISORY:   "Advisory",
  APPROVAL:   "Approve",
  REVEAL:     "Reveal Actual",
  EVALUATE:   "Evaluate",
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

  return (
    <div className="space-y-3">
      {/* Phase progress */}
      <div className="flex items-center gap-1">
        {PHASES.map((phase, i) => {
          const isComplete = i < currentIdx;
          const isCurrent  = i === currentIdx;
          const isLocked   =
            phase === "REVEAL" && actualRevealed ? false :
            phase === "EVALUATE" && !actualRevealed ? true :
            i > currentIdx + 1;

          return (
            <button
              key={phase}
              disabled={isLocked}
              onClick={() => !isLocked && onPhaseChange(phase)}
              className={`flex-1 rounded py-1.5 text-[10px] font-semibold tracking-wide transition-all
                ${isCurrent
                  ? "bg-blue-600 text-white"
                  : isComplete
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : isLocked
                  ? "bg-stone-100 text-stone-300 cursor-not-allowed"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700"}`}
            >
              {PHASE_LABELS[phase]}
            </button>
          );
        })}
      </div>

      {/* Phase description */}
      <div className="bg-stone-100 rounded p-2 text-[11px] text-stone-600">
        {currentPhase === "PREDICTION" &&
          "T-24h pre-event reconstruction. Only information available before the prediction cutoff is shown."}
        {currentPhase === "EXPLAIN" &&
          "Ask 'Why?' about any priority. Uses Gemini with deterministic fallback."}
        {currentPhase === "SCENARIO" &&
          "Adjust wind, rainfall, surge, and response capacity to see scenario impact."}
        {currentPhase === "ADVISORY" &&
          "Generate structured advisories from engine evidence."}
        {currentPhase === "APPROVAL" &&
          "Human approval is required before advisory dispatch. No autonomous dispatch occurs."}
        {currentPhase === "REVEAL" && !actualRevealed &&
          "Click below to reveal actual post-event impact. This unlocks post-event data."}
        {currentPhase === "REVEAL" && actualRevealed &&
          "Actual post-event impact revealed. Viewing historical evidence."}
        {currentPhase === "EVALUATE" && (
          evaluationResult?.metricsUnavailableReason
            ? `Metrics: ${evaluationResult.metricsUnavailableReason}`
            : "Evaluation metrics computed against actual evidence."
        )}
      </div>
    </div>
  );
}
