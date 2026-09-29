"use client";

import { useState } from "react";
import type { PriorityRecommendation } from "@/lib/types/index";
import { ConfidenceBar } from "../shared/ConfidenceBar";

type Props = {
  rec: PriorityRecommendation;
  onWhyClick?: (cellId: string) => void;
  onGenerateAdvisory?: (cellId: string) => void;
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "border-red-600 bg-red-950/40",
  HIGH: "border-orange-500 bg-orange-950/30",
  MEDIUM: "border-yellow-500 bg-yellow-950/20",
  LOW: "border-slate-600 bg-slate-900/30",
};

function getSeverityFromScore(score: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.5) return "HIGH";
  if (score >= 0.25) return "MEDIUM";
  return "LOW";
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function PriorityCard({ rec, onWhyClick, onGenerateAdvisory }: Props) {
  const [expanded, setExpanded] = useState(false);
  const severity = getSeverityFromScore(rec.score);
  const borderClass = SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.LOW;

  return (
    <div className={`rounded border ${borderClass} p-3 text-sm`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
              ${severity === "CRITICAL" ? "bg-red-600" :
                severity === "HIGH" ? "bg-orange-500" :
                severity === "MEDIUM" ? "bg-yellow-500" : "bg-slate-600"} text-white`}
          >
            {rec.rank}
          </span>
          <div>
            <div className="font-semibold text-slate-200">{severity}</div>
            <div className="text-[10px] text-slate-500 font-mono">{rec.cellId.slice(0, 16)}…</div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-slate-200 font-mono font-semibold">{pct(rec.score)}</div>
          <div className="text-[10px] text-slate-500">priority score</div>
        </div>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-1 mb-2 text-[11px]">
        <div className="bg-slate-800/50 rounded p-1.5">
          <div className="text-slate-400">Hazard</div>
          <div className="font-mono text-slate-200">{pct(rec.drivers.hazard)}</div>
        </div>
        <div className="bg-slate-800/50 rounded p-1.5">
          <div className="text-slate-400">Exposure</div>
          <div className="font-mono text-slate-200">{pct(rec.drivers.exposure)}</div>
        </div>
        <div className="bg-slate-800/50 rounded p-1.5">
          <div className="text-slate-400">Criticality</div>
          <div className="font-mono text-slate-200">{pct(rec.drivers.criticality)}</div>
        </div>
      </div>

      {/* Top recommended action */}
      {rec.recommendedActions[0] && (
        <div className="text-[11px] text-slate-300 mb-2 bg-blue-950/30 rounded px-2 py-1.5 border border-blue-900/30">
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
          onClick={() => onWhyClick?.(rec.cellId)}
          className="flex-1 rounded bg-blue-900/50 hover:bg-blue-800/60 px-2 py-1.5 text-[11px] text-blue-300 transition-colors border border-blue-700/40"
        >
          Why #{ rec.rank}?
        </button>
        <button
          onClick={() => onGenerateAdvisory?.(rec.cellId)}
          className="flex-1 rounded bg-slate-700/50 hover:bg-slate-600/60 px-2 py-1.5 text-[11px] text-slate-300 transition-colors border border-slate-600/40"
        >
          Advisory
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded bg-slate-800/50 hover:bg-slate-700/60 px-2 py-1.5 text-[11px] text-slate-400 transition-colors border border-slate-700/40"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>

      {/* Expanded evidence */}
      {expanded && (
        <div className="mt-2 border-t border-slate-700/40 pt-2 space-y-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Evidence</div>
          {rec.evidence.slice(0, 8).map((e, i) => (
            <div key={i} className="text-[10px] text-slate-400 font-mono leading-relaxed">{e}</div>
          ))}
          {rec.recommendedActions.length > 1 && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1.5 mb-0.5">All Actions</div>
              {rec.recommendedActions.map((a, i) => (
                <div key={i} className="text-[10px] text-slate-300 pl-2 border-l border-slate-600">{a}</div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
