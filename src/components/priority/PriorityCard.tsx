"use client";

import { useState } from "react";
import type { PriorityRecommendation } from "@/lib/types/index";
import { ConfidenceBar } from "../shared/ConfidenceBar";

type Props = {
  rec: PriorityRecommendation;
  onWhyClick?: (cellId: string, rec: PriorityRecommendation) => void;
  onGenerateAdvisory?: (cellId: string) => void;
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "border-red-400 bg-red-50",
  HIGH:     "border-orange-400 bg-orange-50",
  MEDIUM:   "border-amber-400 bg-amber-50",
  LOW:      "border-stone-300 bg-stone-50",
};

function getSeverityFromScore(score: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.5)  return "HIGH";
  if (score >= 0.25) return "MEDIUM";
  return "LOW";
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function PriorityCard({ rec, onWhyClick, onGenerateAdvisory }: Props) {
  const [expanded, setExpanded] = useState(false);
  const severity    = getSeverityFromScore(rec.score);
  const borderClass = SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.LOW;

  return (
    <div className={`rounded border ${borderClass} p-3 text-sm`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white
              ${severity === "CRITICAL" ? "bg-red-600" :
                severity === "HIGH"     ? "bg-orange-500" :
                severity === "MEDIUM"   ? "bg-yellow-500" : "bg-stone-500"}`}
          >
            {rec.rank}
          </span>
          <div>
            <div className="font-semibold text-stone-800">{severity}</div>
            <div className="text-[10px] text-stone-400 font-mono">{rec.cellId.slice(0, 16)}…</div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-stone-900 font-mono font-semibold">{pct(rec.score)}</div>
          <div className="text-[10px] text-stone-400">priority score</div>
        </div>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[11px]">
        <div className="bg-stone-100 rounded p-1.5">
          <div className="text-stone-500">Hazard</div>
          <div className="font-mono text-stone-800">{pct(rec.drivers.hazard)}</div>
        </div>
        <div className="bg-stone-100 rounded p-1.5">
          <div className="text-stone-500">Exposure</div>
          <div className="font-mono text-stone-800">{pct(rec.drivers.exposure)}</div>
        </div>
        <div className="bg-stone-100 rounded p-1.5">
          <div className="text-stone-500">Criticality</div>
          <div className="font-mono text-stone-800">{pct(rec.drivers.criticality)}</div>
        </div>
      </div>

      {/* Top recommended action */}
      {rec.recommendedActions[0] && (
        <div className="text-[11px] text-blue-700 mb-2 bg-blue-50 rounded px-2 py-1.5 border border-blue-200">
          {rec.recommendedActions[0]}
        </div>
      )}

      {/* Confidence */}
      <div className="mb-2">
        <ConfidenceBar confidence={rec.confidence} />
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={() => onWhyClick?.(rec.cellId, rec)}
          className="flex-1 rounded bg-blue-50 hover:bg-blue-100 px-2 py-1.5 text-[11px] text-blue-700 transition-colors border border-blue-200"
        >
          Why #{rec.rank}?
        </button>
        <button
          onClick={() => onGenerateAdvisory?.(rec.cellId)}
          className="flex-1 rounded bg-stone-100 hover:bg-stone-200 px-2 py-1.5 text-[11px] text-stone-600 transition-colors border border-stone-200"
        >
          Advisory
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded bg-stone-50 hover:bg-stone-100 px-2 py-1.5 text-[11px] text-stone-500 transition-colors border border-stone-200"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>

      {/* Expanded evidence */}
      {expanded && (
        <div className="mt-2 border-t border-stone-200 pt-2 space-y-1">
          <div className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Evidence</div>
          {rec.evidence.slice(0, 8).map((e, i) => (
            <div key={i} className="text-[10px] text-stone-600 font-mono leading-relaxed">{e}</div>
          ))}
          {rec.recommendedActions.length > 1 && (
            <>
              <div className="text-[10px] text-stone-400 uppercase tracking-widest mt-1.5 mb-0.5">All Actions</div>
              {rec.recommendedActions.map((a, i) => (
                <div key={i} className="text-[10px] text-stone-700 pl-2 border-l border-stone-300">{a}</div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
