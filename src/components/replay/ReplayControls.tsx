"use client";

import type { ReplayPhase } from "@/lib/types/index";

const PHASES: ReplayPhase[] = [
  "PREDICTION", "EXPLAIN", "SCENARIO", "ADVISORY", "APPROVAL", "REVEAL", "EVALUATE",
];

const PHASE_LABELS: Record<ReplayPhase, string> = {
  PREDICTION: "T-24h Prediction",
  EXPLAIN: "Explain",
  SCENARIO: "Scenario",
  ADVISORY: "Advisory",
  APPROVAL: "Approve",
  REVEAL: "Reveal Actual",
  EVALUATE: "Evaluate",
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
          const isCurrent = i === currentIdx;
          const isLocked = phase === "REVEAL" && actualRevealed
            ? false
            : phase === "EVALUATE" && !actualRevealed
            ? true
            : i > currentIdx + 1;

          return (
            <button
              key={phase}
              disabled={isLocked}
              onClick={() => !isLocked && onPhaseChange(phase)}
              className={`flex-1 rounded py-1.5 text-[10px] font-semibold tracking-wide transition-all
                ${isCurrent
                  ? "bg-blue-600 text-white"
                  : isComplete
                  ? "bg-green-800/60 text-green-400 hover:bg-green-700/60"
                  : isLocked
                  ? "bg-slate-800/40 text-slate-600 cursor-not-allowed"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300"}`}
            >
              {PHASE_LABELS[phase]}
            </button>
          );
        })}
      </div>

      {/* Phase description */}
      <div className="bg-slate-800/50 rounded p-2 text-[11px] text-slate-400">
        {currentPhase === "PREDICTION" && (
          "T-24h pre-event reconstruction. Only information available before the prediction cutoff is shown."
        )}
        {currentPhase === "EXPLAIN" && (
          "Ask 'Why?' about any priority. Uses Gemini with deterministic fallback."
        )}
        {currentPhase === "SCENARIO" && (
          "Adjust wind, rainfall, surge, and response capacity to see scenario impact."
        )}
        {currentPhase === "ADVISORY" && (
          "Generate structured advisories from engine evidence."
        )}
        {currentPhase === "APPROVAL" && (
          "Human approval is required before advisory dispatch. No autonomous dispatch occurs."
        )}
        {currentPhase === "REVEAL" && !actualRevealed && (
          "Click below to reveal actual post-event impact. This unlocks post-event data."
        )}
        {currentPhase === "REVEAL" && actualRevealed && (
          "Actual post-event impact revealed. Viewing historical evidence."
        )}
        {currentPhase === "EVALUATE" && (
          evaluationResult?.metricsUnavailableReason
            ? `Metrics: ${evaluationResult.metricsUnavailableReason}`
            : "Evaluation metrics computed against actual evidence."
        )}
      </div>

      {/* Evaluation metrics */}
      {currentPhase === "EVALUATE" && evaluationResult && !evaluationResult.metricsUnavailableReason && (
        <div className="space-y-2 text-sm">
          <div className="text-[11px] text-slate-500 uppercase tracking-widest">Recall Metrics</div>
          {Object.entries(evaluationResult.metrics ?? {}).map(([k, v]) => (
            v !== undefined && (
              <div key={k} className="flex justify-between text-[12px]">
                <span className="text-slate-400">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className="font-mono text-slate-200">{(v * 100).toFixed(1)}%</span>
              </div>
            )
          ))}
          {Object.keys(evaluationResult.metrics ?? {}).length === 0 && (
            <div className="text-slate-500 text-[12px]">No metrics available</div>
          )}
          <div className="text-[11px] text-slate-500 uppercase tracking-widest mt-2">Baselines</div>
          {Object.entries(evaluationResult.baselineMetrics ?? {}).map(([k, v]) => (
            <div key={k} className="flex justify-between text-[12px]">
              <span className="text-slate-400">{k.replace(/_/g, " ")}</span>
              <span className="font-mono text-slate-300">{(v * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {currentPhase === "EVALUATE" && evaluationResult?.metricsUnavailableReason && (
        <div className="bg-slate-800/40 rounded p-3 text-[11px] text-slate-500 border border-slate-700/50">
          <div className="font-semibold text-slate-400 mb-1">Metrics Unavailable</div>
          {evaluationResult.metricsUnavailableReason}
        </div>
      )}
    </div>
  );
}
