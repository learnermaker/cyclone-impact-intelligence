"use client";

import { useState, useEffect } from "react";
import { DEMO_INSURANCE_POLICY } from "@/config/index";

type TriggerStatus = "TRIGGERED" | "NOT_TRIGGERED" | "UNCERTAIN";

type InsuranceData = {
  trigger: {
    status: TriggerStatus;
    indicativeLiquidity: number;
    basisRiskIndicator: number;
    thresholds: { windMs?: number; rain24hMm?: number; surgeM?: number };
  };
  explanation: string;
  scenarioValues: { windKph: number; windMs: number; rainfall24hMm: number; surgeM: number };
};

type Props = {
  scenarioParams?: { surgeHeight?: number; windMult?: number; rainMult?: number };
};

const STATUS_STYLE: Record<TriggerStatus, string> = {
  TRIGGERED: "bg-red-900/60 border-red-600 text-red-300",
  NOT_TRIGGERED: "bg-slate-800/60 border-slate-600 text-slate-400",
  UNCERTAIN: "bg-yellow-900/40 border-yellow-600 text-yellow-300",
};

export function InsurancePanel({ scenarioParams = {} }: Props) {
  const [data, setData] = useState<InsuranceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      surgeHeight: String(scenarioParams.surgeHeight ?? 1.5),
      windMult: String(scenarioParams.windMult ?? 1.0),
      rainMult: String(scenarioParams.rainMult ?? 1.0),
    });
    fetch(`/api/insurance?${params}`)
      .then((r) => r.json())
      .then((json: { ok: boolean; data?: InsuranceData }) => {
        if (json.ok && json.data) setData(json.data);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [scenarioParams.surgeHeight, scenarioParams.windMult, scenarioParams.rainMult]);

  if (loading) return (
    <div className="p-3 text-center text-slate-500 text-sm">Loading insurance…</div>
  );
  if (!data) return null;

  const { trigger, scenarioValues } = data;
  const statusClass = STATUS_STYLE[trigger.status];

  return (
    <div className="rounded border border-amber-800/50 bg-amber-950/20 p-3 text-sm space-y-3">
      {/* Warning header */}
      <div className="text-[10px] font-bold text-amber-400 tracking-widest uppercase">
        ILLUSTRATIVE POLICY — INDICATIVE PARAMETRIC LIQUIDITY ESTIMATE
      </div>
      <div className="text-[10px] text-amber-700">
        Not a real contract. No real payout. Demonstration only.
      </div>

      {/* Policy info */}
      <div>
        <div className="font-semibold text-slate-300 text-xs">{DEMO_INSURANCE_POLICY.policyId}</div>
        <div className="text-[10px] text-slate-500">{DEMO_INSURANCE_POLICY.region}</div>
      </div>

      {/* Trigger status */}
      <div className={`rounded border px-3 py-2 ${statusClass}`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs">{trigger.status.replace("_", " ")}</span>
          {trigger.status === "TRIGGERED" && (
            <span className="font-mono text-sm font-bold">
              INR {trigger.indicativeLiquidity.toLocaleString()}
            </span>
          )}
        </div>
        {trigger.status === "UNCERTAIN" && (
          <div className="text-[10px] mt-1 opacity-80">
            Indicative: INR {(trigger.indicativeLiquidity).toLocaleString()} (partial)
          </div>
        )}
      </div>

      {/* Threshold comparison */}
      <div className="space-y-1 text-[11px]">
        <TriggerRow
          label="Wind"
          current={scenarioValues.windMs.toFixed(1)}
          threshold={trigger.thresholds.windMs?.toFixed(1)}
          unit="m/s"
          met={scenarioValues.windMs >= (trigger.thresholds.windMs ?? Infinity)}
        />
        <TriggerRow
          label="Rainfall"
          current={scenarioValues.rainfall24hMm.toFixed(0)}
          threshold={trigger.thresholds.rain24hMm?.toFixed(0)}
          unit="mm/24h"
          met={scenarioValues.rainfall24hMm >= (trigger.thresholds.rain24hMm ?? Infinity)}
        />
        <TriggerRow
          label="Surge"
          current={scenarioValues.surgeM.toFixed(1)}
          threshold={trigger.thresholds.surgeM?.toFixed(1)}
          unit="m"
          met={scenarioValues.surgeM >= (trigger.thresholds.surgeM ?? Infinity)}
        />
      </div>

      {/* Basis risk */}
      <div className="text-[11px] text-slate-500">
        Basis risk indicator: {((trigger.basisRiskIndicator ?? 0) * 100).toFixed(0)}%
        <span className="ml-1 text-[10px]">(gap between modelled trigger and actual impact)</span>
      </div>

      {/* Explanation toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
      >
        {expanded ? "▼" : "▶"} Explanation
      </button>
      {expanded && (
        <pre className="text-[10px] text-slate-400 bg-slate-800/40 rounded p-2 whitespace-pre-wrap leading-relaxed">
          {data.explanation}
        </pre>
      )}
    </div>
  );
}

function TriggerRow({
  label, current, threshold, unit, met,
}: {
  label: string;
  current: string;
  threshold?: string;
  unit: string;
  met: boolean;
}) {
  if (!threshold) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-slate-300">{current} {unit}</span>
        <span className="text-slate-600">/ threshold</span>
        <span className={`font-mono ${met ? "text-red-400" : "text-slate-500"}`}>
          {threshold} {unit}
        </span>
        <span>{met ? "✓" : "–"}</span>
      </div>
    </div>
  );
}
