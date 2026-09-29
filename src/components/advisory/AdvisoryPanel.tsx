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
  HIGH: "bg-orange-500 text-white",
  MEDIUM: "bg-yellow-500 text-black",
  LOW: "bg-slate-500 text-white",
};

export function AdvisoryPanel({ advisory, onApprove, onReject, onDispatch }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [approverName, setApproverName] = useState("operator");

  const { approval, dispatch } = advisory;
  const sevClass = SEVERITY_CLASSES[advisory.severity] ?? SEVERITY_CLASSES.LOW;

  return (
    <div className="rounded border border-slate-700 bg-slate-900/60 overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/60 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${sevClass}`}>
            {advisory.severity}
          </span>
          <span className="font-semibold text-slate-200">Advisory</span>
          <span className="text-[10px] font-mono text-slate-500">{advisory.advisoryId.slice(0, 8)}…</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              approval.status === "APPROVED" ? "bg-green-800 text-green-300" :
              approval.status === "REJECTED" ? "bg-red-900 text-red-300" :
              "bg-slate-700 text-slate-400"
            }`}
          >
            {approval.status}
          </span>
          <SourceTierBadge tier={advisory.confidence.limitingTier} />
        </div>
      </div>

      {/* Drivers */}
      <div className="px-3 py-2 border-b border-slate-700/50">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Hazard Drivers</div>
        <div className="flex flex-wrap gap-1">
          {advisory.drivers.map((d) => (
            <span key={d} className="bg-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-300">{d}</span>
          ))}
        </div>
      </div>

      {/* Recommended actions */}
      <div className="px-3 py-2 border-b border-slate-700/50">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Recommended Actions</div>
        <ul className="space-y-1">
          {advisory.recommendedActions.map((a, i) => (
            <li key={i} className="text-[12px] text-slate-300 flex gap-2">
              <span className="text-blue-400 flex-shrink-0">•</span>
              {a}
            </li>
          ))}
        </ul>
      </div>

      {/* Confidence */}
      <div className="px-3 py-2 border-b border-slate-700/50">
        <ConfidenceBar confidence={advisory.confidence} />
      </div>

      {/* Evidence (expandable) */}
      <div className="px-3 py-2 border-b border-slate-700/50">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          {expanded ? "▼" : "▶"} Evidence ({advisory.evidence.length} fields)
        </button>
        {expanded && (
          <div className="mt-2 space-y-1">
            {advisory.evidence.slice(0, 5).map((e, i) => (
              <div key={i} className="text-[10px] font-mono text-slate-400 bg-slate-800/40 rounded px-2 py-1">
                <span className="text-slate-500">{e.field}:</span> {String(e.value)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dispatch status */}
      {dispatch && (
        <div className={`px-3 py-1.5 border-b border-slate-700/50 text-[11px] flex items-center gap-2
          ${dispatch.status === "SIMULATED_SENT" ? "bg-green-950/30 text-green-400" :
            dispatch.status === "FAILED" ? "bg-red-950/30 text-red-400" :
            "text-slate-500"}`}>
          <span className="font-semibold">Dispatch:</span>
          <span>{dispatch.status}</span>
          {dispatch.sentAt && <span className="text-slate-600">· {new Date(dispatch.sentAt).toLocaleTimeString()}</span>}
          {dispatch.status === "SIMULATED_SENT" && (
            <span className="text-[10px] text-slate-500 ml-auto">Simulated — not operational</span>
          )}
        </div>
      )}

      {/* Approval actions */}
      <div className="px-3 py-2">
        {approval.status === "PENDING" && (
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <label className="text-[11px] text-slate-500 flex-shrink-0">Approver:</label>
              <input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
                placeholder="operator name"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onApprove?.(advisory.advisoryId)}
                className="flex-1 rounded bg-green-800/60 hover:bg-green-700/60 border border-green-600/40 px-3 py-1.5 text-[12px] text-green-300 font-semibold transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => onReject?.(advisory.advisoryId)}
                className="flex-1 rounded bg-red-900/40 hover:bg-red-800/40 border border-red-700/40 px-3 py-1.5 text-[12px] text-red-400 transition-colors"
              >
                Reject
              </button>
            </div>
            <p className="text-[10px] text-slate-600 text-center">
              Human approval required before dispatch
            </p>
          </div>
        )}
        {approval.status === "APPROVED" && !dispatch && (
          <button
            onClick={() => onDispatch?.(advisory.advisoryId)}
            className="w-full rounded bg-blue-800/60 hover:bg-blue-700/60 border border-blue-600/40 px-3 py-2 text-[12px] text-blue-300 font-semibold transition-colors"
          >
            Dispatch (Simulated)
          </button>
        )}
        {approval.status === "APPROVED" && dispatch?.status === "SIMULATED_SENT" && (
          <div className="text-center text-[11px] text-green-400 py-1">
            Dispatched successfully — delivery log updated
          </div>
        )}
        {approval.status === "REJECTED" && (
          <div className="text-center text-[11px] text-red-400 py-1">
            Advisory rejected{approval.notes ? `: ${approval.notes}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
