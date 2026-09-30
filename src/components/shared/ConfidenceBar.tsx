"use client";

import type { DataConfidence } from "@/lib/types/index";
import { SourceTierBadge } from "./SourceTierBadge";

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function barColor(v: number): string {
  if (v >= 0.75) return "bg-green-600";
  if (v >= 0.5)  return "bg-yellow-500";
  return "bg-red-500";
}

export function ConfidenceBar({ confidence }: { confidence: DataConfidence }) {
  const { overall, components, limitingTier, notes } = confidence;

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-stone-500">Confidence</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-stone-800">{pct(overall)}</span>
          <SourceTierBadge tier={limitingTier} />
        </div>
      </div>

      {/* Overall bar */}
      <div className="h-1.5 w-full rounded bg-stone-200">
        <div
          className={`h-full rounded transition-all ${barColor(overall)}`}
          style={{ width: pct(overall) }}
        />
      </div>

      {/* Component breakdown */}
      {Object.entries(components).filter(([, v]) => v !== undefined).length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-0.5 text-[10px] text-stone-400">
          {Object.entries(components)
            .filter(([, v]) => v !== undefined)
            .map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="capitalize">{key}</span>
                <span className={val! >= 0.7 ? "text-green-600" : val! >= 0.5 ? "text-yellow-600" : "text-red-600"}>
                  {pct(val!)}
                </span>
              </div>
            ))}
        </div>
      )}

      {notes?.length ? (
        <p className="text-[10px] text-stone-400 leading-relaxed">{notes[0]}</p>
      ) : null}
    </div>
  );
}
