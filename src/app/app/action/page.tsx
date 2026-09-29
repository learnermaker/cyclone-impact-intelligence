"use client";

import { useState, useCallback } from "react";
import { MapWrapper } from "@/components/map/MapWrapper";
import { PriorityList } from "@/components/priority/PriorityList";
import { AdvisoryPanel } from "@/components/advisory/AdvisoryPanel";
import { ScenarioControls, type ScenarioParams } from "@/components/scenario/ScenarioControls";
import { InsurancePanel } from "@/components/insurance/InsurancePanel";
import { ScenarioWarning } from "@/components/shared/SourceTierBadge";
import { useAppStore } from "@/store/index";
import type { Advisory } from "@/lib/types/index";
import { RESPONSE_CAPACITY } from "@/config/index";

type Tab = "priorities" | "advisory" | "insurance";

export default function ActionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("priorities");
  const [scenarioParams, setScenarioParams] = useState<ScenarioParams>({
    windMult: 1.0, rainMult: 1.0, surgeHeight: 1.5, surgeMethod: "flood_fill",
  });
  const [k, setK] = useState<number>(RESPONSE_CAPACITY.default);
  const [objective, setObjective] = useState("balanced");
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [geminiAnswer, setGeminiAnswer] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);

  const setSelectedCell = useAppStore((s) => s.setSelectedCell);
  const isScenarioModified = scenarioParams.windMult !== 1.0 || scenarioParams.rainMult !== 1.0 || scenarioParams.surgeHeight !== 1.5;

  const handleWhyClick = useCallback(async (cellId: string) => {
    setSelectedCell(cellId);
    setGeminiLoading(true);
    setGeminiAnswer(null);
    setActiveTab("priorities");
    try {
      const res = await fetch("/api/gemini/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Why is cell ${cellId} a high priority for response?`,
          cellId,
          k,
        }),
      });
      const json = await res.json() as { ok: boolean; data?: { answer: string; isFallback: boolean } };
      if (json.ok && json.data) {
        setGeminiAnswer(json.data.answer);
      }
    } catch (err) {
      setGeminiAnswer(`Unable to get explanation: ${String(err)}`);
    } finally {
      setGeminiLoading(false);
    }
  }, [setSelectedCell, k]);

  const handleGenerateAdvisory = useCallback(async (cellId: string) => {
    setActiveTab("advisory");
    try {
      const res = await fetch("/api/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cellId, k, objective }),
      });
      const json = await res.json() as { ok: boolean; data?: { advisory: Advisory } };
      if (json.ok && json.data) setAdvisory(json.data.advisory);
    } catch {
      // Silently handle
    }
  }, [k, objective]);

  const handleApprove = useCallback(async (id: string) => {
    const res = await fetch(`/api/advisory/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", approvedBy: "operator" }),
    });
    const json = await res.json() as { ok: boolean; data?: { advisory: Advisory } };
    if (json.ok && json.data) setAdvisory(json.data.advisory);
  }, []);

  const handleReject = useCallback(async (id: string) => {
    const res = await fetch(`/api/advisory/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    const json = await res.json() as { ok: boolean; data?: { advisory: Advisory } };
    if (json.ok && json.data) setAdvisory(json.data.advisory);
  }, []);

  const handleDispatch = useCallback(async (id: string) => {
    const res = await fetch(`/api/advisory/${id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json() as { ok: boolean; data?: { advisory: Advisory } };
    if (json.ok && json.data) setAdvisory(json.data.advisory);
  }, []);

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-96 flex-shrink-0 flex flex-col border-r border-slate-800 bg-[#12151f] overflow-hidden">
        {/* Controls */}
        <div className="border-b border-slate-800 p-3 space-y-3">
          <div className="flex gap-2 items-center text-xs">
            <label className="text-slate-400">Capacity K</label>
            <input
              type="number"
              min={1}
              max={200}
              value={k}
              onChange={(e) => setK(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <label className="text-slate-400 ml-2">Objective</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="balanced">Balanced</option>
              <option value="population">Population</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="service_continuity">Service Continuity</option>
            </select>
          </div>
          {isScenarioModified && <ScenarioWarning />}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          {(["priorities", "advisory", "insurance"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 text-[11px] font-semibold tracking-wide capitalize transition-colors
                ${activeTab === t ? "text-blue-400 border-b-2 border-blue-500" : "text-slate-500 hover:text-slate-300"}`}
            >
              {t === "advisory" && advisory ? `${t} •` : t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === "priorities" && (
            <div className="space-y-3">
              {/* Gemini explanation */}
              {(geminiLoading || geminiAnswer) && (
                <div className="rounded border border-blue-800/50 bg-blue-950/20 p-3 text-xs">
                  <div className="text-blue-400 font-semibold text-[10px] mb-2">EXPLANATION</div>
                  {geminiLoading ? (
                    <div className="flex items-center gap-2 text-slate-400">
                      <div className="h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
                      Asking Gemini…
                    </div>
                  ) : (
                    <div className="text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                      {geminiAnswer}
                    </div>
                  )}
                  <button onClick={() => setGeminiAnswer(null)} className="text-[10px] text-slate-600 hover:text-slate-400 mt-1">
                    Clear
                  </button>
                </div>
              )}
              <PriorityList
                k={k}
                objective={objective}
                scenarioParams={{ ...scenarioParams }}
                onWhyClick={handleWhyClick}
                onGenerateAdvisory={handleGenerateAdvisory}
              />
            </div>
          )}

          {activeTab === "advisory" && (
            advisory ? (
              <AdvisoryPanel
                advisory={advisory}
                onApprove={handleApprove}
                onReject={handleReject}
                onDispatch={handleDispatch}
              />
            ) : (
              <p className="text-slate-500 text-sm text-center py-8">
                Click "Advisory" on a priority card to generate an advisory.
              </p>
            )
          )}

          {activeTab === "insurance" && (
            <InsurancePanel scenarioParams={{ surgeHeight: scenarioParams.surgeHeight, windMult: scenarioParams.windMult, rainMult: scenarioParams.rainMult }} />
          )}
        </div>

        {/* Scenario controls at bottom */}
        <div className="border-t border-slate-800 p-3">
          <ScenarioControls onChange={setScenarioParams} />
        </div>
      </div>

      {/* Map — fills rest */}
      <div className="relative flex-1">
        <MapWrapper
          activeLayer="priority"
          scenarioParams={{ ...scenarioParams }}
          onCellClick={handleWhyClick}
        />
        {isScenarioModified && (
          <div className="absolute top-3 left-3">
            <ScenarioWarning />
          </div>
        )}
      </div>
    </div>
  );
}
