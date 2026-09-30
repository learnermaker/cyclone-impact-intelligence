"use client";

import { useState } from "react";
import type { Advisory } from "@/lib/types/index";
import { SourceTierBadge } from "../shared/SourceTierBadge";
import { ConfidenceBar } from "../shared/ConfidenceBar";

type Props = {
  advisory: Advisory;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onDispatch?: (id: string) => void;
};

const SEVERITY_CLASSES = {
  CRITICAL: "bg-red-600 text-white",
  HIGH:     "bg-orange-500 text-white",
  MEDIUM:   "bg-yellow-500 text-black",
  LOW:      "bg-stone-400 text-white",
};

export function AdvisoryPanel({ advisory, onApprove, onReject, onDispatch }: Props) {
  const [expanded, setExpanded]       = useState(false);
  const [approverName, setApproverName] = useState("operator");

  const { approval, dispatch } = advisory;
  const sevClass = SEVERITY_CLASSES[advisory.severity] ?? SEVERITY_CLASSES.LOW;

  return (
    <div className="rounded border border-[#d9d3ca] bg-white overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-stone-50 border-b border-[#d9d3ca]">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${sevClass}`}>
            {advisory.severity}
          </span>
          <span className="font-semibold text-stone-800">Advisory</span>
          <span className="text-[10px] font-mono text-stone-400">{advisory.advisoryId.slice(0, 8)}…</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              approval.status === "APPROVED" ? "bg-green-100 text-green-700" :
              approval.status === "REJECTED" ? "bg-red-100 text-red-700" :
              "bg-stone-100 text-stone-500"
            }`}
          >
            {approval.status}
          </span>
          <SourceTierBadge tier={advisory.confidence.limitingTier} />
        </div>
      </div>

      {/* Drivers */}
      <div className="px-3 py-2 border-b border-stone-100">
        <div className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Hazard Drivers</div>
        <div className="flex flex-wrap gap-1">
          {advisory.drivers.map((d) => (
            <span key={d} className="bg-stone-100 rounded px-2 py-0.5 text-[11px] text-stone-700">{d}</span>
          ))}
        </div>
      </div>

      {/* Recommended actions */}
      <div className="px-3 py-2 border-b border-stone-100">
        <div className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Recommended Actions</div>
        <ul className="space-y-1">
          {advisory.recommendedActions.map((a, i) => (
            <li key={i} className="text-[12px] text-stone-700 flex gap-2">
              <span className="text-blue-600 flex-shrink-0">•</span>
              {a}
            </li>
          ))}
        </ul>
      </div>

      {/* Confidence */}
      <div className="px-3 py-2 border-b border-stone-100">
        <ConfidenceBar confidence={advisory.confidence} />
      </div>

      {/* Evidence (expandable) */}
      <div className="px-3 py-2 border-b border-stone-100">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-blue-600 hover:text-blue-800 transition-colors"
        >
          {expanded ? "▼" : "▶"} Evidence ({advisory.evidence.length} fields)
        </button>
        {expanded && (
          <div className="mt-2 space-y-1">
            {advisory.evidence.slice(0, 5).map((e, i) => (
              <div key={i} className="text-[10px] font-mono text-stone-600 bg-stone-50 rounded px-2 py-1">
                <span className="text-stone-400">{e.field}:</span> {String(e.value)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dispatch status */}
      {dispatch && (
        <div className={`px-3 py-1.5 border-b border-stone-100 text-[11px] flex items-center gap-2
          ${dispatch.status === "SIMULATED_SENT" ? "bg-green-50 text-green-700" :
            dispatch.status === "FAILED"         ? "bg-red-50 text-red-700" :
            "text-stone-500"}`}>
          <span className="font-semibold">Dispatch:</span>
          <span>{dispatch.status}</span>
          {dispatch.sentAt && (
            <span className="text-stone-400">· {new Date(dispatch.sentAt).toLocaleTimeString()}</span>
          )}
          {dispatch.status === "SIMULATED_SENT" && (
            <span className="text-[10px] text-stone-400 ml-auto">Simulated — not operational</span>
          )}
        </div>
      )}

      {/* Approval actions */}
      <div className="px-3 py-2">
        {approval.status === "PENDING" && (
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <label className="text-[11px] text-stone-500 flex-shrink-0">Approver:</label>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="flex-1 bg-white border border-stone-300 rounded px-2 py-1 text-[11px] text-stone-800 focus:outline-none focus:border-blue-500"
                placeholder="operator name"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onApprove?.(advisory.advisoryId)}
                className="flex-1 rounded bg-green-100 hover:bg-green-200 border border-green-300 px-3 py-1.5 text-[12px] text-green-700 font-semibold transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => onReject?.(advisory.advisoryId)}
                className="flex-1 rounded bg-red-50 hover:bg-red-100 border border-red-300 px-3 py-1.5 text-[12px] text-red-700 transition-colors"
              >
                Reject
              </button>
            </div>
            <p className="text-[10px] text-stone-400 text-center">
              Human approval required before dispatch
            </p>
          </div>
        )}
        {approval.status === "APPROVED" && !dispatch && (
          <button
            onClick={() => onDispatch?.(advisory.advisoryId)}
            className="w-full rounded bg-blue-100 hover:bg-blue-200 border border-blue-300 px-3 py-2 text-[12px] text-blue-700 font-semibold transition-colors"
          >
            Dispatch (Simulated)
          </button>
        )}
        {approval.status === "APPROVED" && dispatch?.status === "SIMULATED_SENT" && (
          <div className="text-center text-[11px] text-green-700 py-1">
            Dispatched successfully — delivery log updated
          </div>
        )}
        {approval.status === "REJECTED" && (
          <div className="text-center text-[11px] text-red-700 py-1">
            Advisory rejected{approval.notes ? `: ${approval.notes}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
