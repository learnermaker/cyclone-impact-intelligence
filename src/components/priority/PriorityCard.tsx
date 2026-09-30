"use client";

/**
 * PriorityCard — dense, hierarchy-first collapsed card.
 *
 * Collapsed shows:
 *   #1  CRITICAL  87.4%
 *       Area context (one line)
 *       Hazard 85.2%  ·  Exp 73.1%  ·  Crit 90.0%
 *       Immediate action (one line)
 *       Confidence 78%                        Why #1  Advisory  +
 *
 * Expanded adds evidence, all actions, H3 id (unchanged).
 *
 * Changes vs prior version:
 *   - Three separate metric boxes → single inline metric strip (O)
 *   - ConfidenceBar (full bar) → compact "Confidence N%" label (T)
 *   - No decorative border on every metric group (Q)
 *   - H3 id hidden until expanded (O)
 */

import { useState } from "react";
import type { PriorityRecommendation } from "@/lib/types/index";

type Props = {
  rec: PriorityRecommendation;
  onWhyClick?: (cellId: string, rec: PriorityRecommendation) => void;
  onGenerateAdvisory?: (cellId: string) => void;
};

const SEVERITY_BORDER: Record<string, string> = {
  CRITICAL: "border-l-red-500",
  HIGH:     "border-l-orange-400",
  MEDIUM:   "border-l-amber-400",
  LOW:      "border-l-stone-300",
};

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: "text-red-700 bg-red-50",
  HIGH:     "text-orange-700 bg-orange-50",
  MEDIUM:   "text-amber-700 bg-amber-50",
  LOW:      "text-stone-600 bg-stone-100",
};

const RANK_BG: Record<string, string> = {
  CRITICAL: "bg-red-600",
  HIGH:     "bg-orange-500",
  MEDIUM:   "bg-amber-500",
  LOW:      "bg-stone-500",
};

function getSeverity(score: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.75) return "CRITICAL";
  if (score >= 0.5)  return "HIGH";
  if (score >= 0.25) return "MEDIUM";
  return "LOW";
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function pctShort(v: number) {
  return `${Math.round(v * 100)}%`;
}

function getAreaContext(rec: PriorityRecommendation): string {
  const actions = rec.recommendedActions.join(" ").toLowerCase();
  if (actions.includes("evacuat") || actions.includes("surge-exposed")) {
    return "Surge-exposed coastal zone";
  }
  if (actions.includes("shelter") && rec.drivers.hazard >= 0.6) {
    return "High-hazard coastal corridor";
  }
  if (rec.drivers.criticality >= 0.9) {
    return "Critical infrastructure zone";
  }
  return "Coastal Odisha corridor";
}

export function PriorityCard({ rec, onWhyClick, onGenerateAdvisory }: Props) {
  const [expanded, setExpanded] = useState(false);
  const severity    = getSeverity(rec.score);
  const borderClass = SEVERITY_BORDER[severity] ?? SEVERITY_BORDER.LOW;
  const badgeClass  = SEVERITY_BADGE[severity] ?? SEVERITY_BADGE.LOW;
  const rankBg      = RANK_BG[severity] ?? RANK_BG.LOW;
  const areaContext = getAreaContext(rec);
  const confidence  = Math.round((rec.confidence?.overall ?? 0) * 100);

  return (
    <div className={`border border-[#d9d3ca] border-l-4 ${borderClass} bg-white rounded text-sm`}>
      <div className="px-2.5 py-2 space-y-1.5">

        {/* ── Header row ─────────────────────────────── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Rank badge */}
            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                              text-[11px] font-bold text-white ${rankBg}`}>
              {rec.rank}
            </span>
            {/* Severity + area context */}
            <div className="min-w-0">
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${badgeClass}`}>
                {severity}
              </span>
              <div className="text-[10px] text-stone-500 truncate mt-0.5">{areaContext}</div>
            </div>
          </div>
          {/* Score */}
          <div className="flex-shrink-0 text-right">
            <div className="font-mono font-semibold text-stone-900 text-[13px]">{pct(rec.score)}</div>
          </div>
        </div>

        {/* ── Inline metric strip ────────────────────── */}
        <div className="text-[10px] text-stone-500 flex items-center gap-1.5 flex-wrap">
          <span>
            Hazard <span className="font-mono text-stone-700">{pctShort(rec.drivers.hazard)}</span>
          </span>
          <span className="text-stone-300">·</span>
          <span>
            Exp <span className="font-mono text-stone-700">{pctShort(rec.drivers.exposure)}</span>
          </span>
          <span className="text-stone-300">·</span>
          <span>
            Crit <span className="font-mono text-stone-700">{pctShort(rec.drivers.criticality)}</span>
          </span>
        </div>

        {/* ── Top recommended action ─────────────────── */}
        {rec.recommendedActions[0] && (
          <div className="text-[11px] text-blue-700 truncate">
            {rec.recommendedActions[0]}
          </div>
        )}

        {/* ── Bottom row: confidence + actions ──────── */}
        <div className="flex items-center justify-between gap-2">
          {/* Compact confidence */}
          <span className="text-[10px] text-stone-400">
            Confidence <span className="text-stone-600 font-mono">{confidence}%</span>
          </span>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onWhyClick?.(rec.cellId, rec)}
              className="rounded bg-blue-50 hover:bg-blue-100 px-2 py-1 text-[10px] text-blue-700
                         transition-colors border border-blue-200"
            >
              Why #{rec.rank}
            </button>
            <button
              onClick={() => onGenerateAdvisory?.(rec.cellId)}
              className="rounded bg-stone-50 hover:bg-stone-100 px-2 py-1 text-[10px] text-stone-600
                         transition-colors border border-stone-200"
            >
              Advisory
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded bg-stone-50 hover:bg-stone-100 px-2 py-1 text-[10px] text-stone-500
                         transition-colors border border-stone-200"
              aria-label={expanded ? "Collapse evidence" : "Expand evidence"}
            >
              {expanded ? "−" : "+"}
            </button>
          </div>
        </div>

        {/* ── Expanded evidence ──────────────────────── */}
        {expanded && (
          <div className="border-t border-stone-100 pt-2 space-y-1.5">
            <div className="text-[10px] text-stone-400 uppercase tracking-widest">Evidence</div>
            {rec.evidence.slice(0, 8).map((e, i) => (
              <div key={i} className="text-[10px] text-stone-600 font-mono leading-relaxed">{e}</div>
            ))}

            {rec.recommendedActions.length > 1 && (
              <>
                <div className="text-[10px] text-stone-400 uppercase tracking-widest mt-1">
                  All Actions
                </div>
                {rec.recommendedActions.map((a, i) => (
                  <div key={i} className="text-[10px] text-stone-700 pl-2 border-l border-stone-300">
                    {a}
                  </div>
                ))}
              </>
            )}

            {/* H3 id — technical provenance, secondary */}
            <div className="pt-1">
              <span className="text-[9px] text-stone-300 font-mono">H3: {rec.cellId}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
