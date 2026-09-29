"use client";

import { useState, useCallback } from "react";
import { MapWrapper } from "@/components/map/MapWrapper";
import { PriorityList } from "@/components/priority/PriorityList";
import { AdvisoryPanel } from "@/components/advisory/AdvisoryPanel";
import { ScenarioControls, type ScenarioParams } from "@/components/scenario/ScenarioControls";
import { InsurancePanel } from "@/components/insurance/InsurancePanel";
import { ScenarioWarning } from "@/components/shared/SourceTierBadge";
import { useAppStore } from "@/store/index";
import type { Advisory, PriorityRecommendation } from "@/lib/types/index";
import { RESPONSE_CAPACITY } from "@/config/index";

type Tab = "priorities" | "advisory" | "insurance";

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }

export default function ActionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("priorities");
  const [scenarioParams, setScenarioParams] = useState<ScenarioParams>({
    windMult: 1.0, rainMult: 1.0, surgeHeight: 1.5, surgeMethod: "flood_fill",
  });
  const [k, setK] = useState<number>(RESPONSE_CAPACITY.default);
  const [objective, setObjective] = useState("balanced");
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [selectedRec, setSelectedRec] = useState<PriorityRecommendation | null>(null);
  const [geminiAnswer, setGeminiAnswer] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);

  const setSelectedCell = useAppStore((s) => s.setSelectedCell);
  const isScenarioModified = scenarioParams.windMult !== 1.0 || scenarioParams.rainMult !== 1.0 || scenarioParams.surgeHeight !== 1.5;

  const handleWhyClick = useCallback(async (cellId: string, rec?: PriorityRecommendation) => {
    setSelectedCell(cellId);
    setSelectedRec(rec ?? null);
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
              {/* Structured breakdown — shown instantly when a cell is selected */}
              {selectedRec && (
                <div className="rounded border border-slate-700/60 bg-slate-900/60 p-3 text-xs space-y-2.5">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0
                        ${selectedRec.score >= 0.75 ? "bg-red-600" : selectedRec.score >= 0.5 ? "bg-orange-500" : "bg-yellow-500"}`}>
                        {selectedRec.rank}
                      </span>
                      <span className="text-slate-300 font-semibold">Priority #{selectedRec.rank}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-slate-100 font-semibold">{pct(selectedRec.score)}</div>
                      <div className="text-[10px] text-slate-600">score</div>
                    </div>
                  </div>

                  {/* Drivers grid */}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Drivers</div>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      {(
                        [
                          ["Hazard", selectedRec.drivers.hazard],
                          ["Exposure", selectedRec.drivers.exposure],
                          ["Criticality", selectedRec.drivers.criticality],
                          ["Dependency", selectedRec.drivers.dependencyCentrality],
                        ] as [string, number][]
                      ).map(([label, val]) => (
                        <div key={label} className="bg-slate-800/60 rounded p-1.5">
                          <div className="text-slate-500">{label}</div>
                          <div className="font-mono text-slate-200">{pct(val)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Evidence */}
                  {selectedRec.evidence.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Evidence</div>
                      <div className="space-y-0.5">
                        {selectedRec.evidence.slice(0, 5).map((e, i) => (
                          <div key={i} className="text-slate-400 font-mono leading-relaxed">{e}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended actions */}
                  {selectedRec.recommendedActions.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Actions</div>
                      <div className="space-y-1">
                        {selectedRec.recommendedActions.slice(0, 3).map((a, i) => (
                          <div key={i} className="text-blue-300 pl-2 border-l border-blue-700/50 leading-relaxed">{a}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gemini explanation — shown below structured data */}
                  {(geminiLoading || geminiAnswer) && (
                    <div className="border-t border-slate-700/40 pt-2.5">
                      <div className="text-[10px] uppercase tracking-widest text-blue-500 mb-1.5">Gemini Explanation</div>
                      {geminiLoading ? (
                        <div className="flex items-center gap-2 text-slate-400">
                          <div className="h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent flex-shrink-0" />
                          Asking Gemini…
                        </div>
                      ) : (
                        <div className="text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                          {geminiAnswer}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => { setSelectedRec(null); setGeminiAnswer(null); }}
                    className="text-[10px] text-slate-600 hover:text-slate-400"
                  >
                    Clear selection
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

      {/* Map — fills rest; k and objective passed so the map reflects the selector */}
      <div className="relative flex-1">
        <MapWrapper
          activeLayer="priority"
          scenarioParams={{ ...scenarioParams, k, objective }}
          onCellClick={(cellId) => handleWhyClick(cellId)}
          showAssets={true}
          onAssetClick={(assetId, name, type) => {
            setSelectedRec(null);
            setGeminiAnswer(null);
            setActiveTab("priorities");
            setGeminiAnswer(`Selected asset: ${name} (${type})\nID: ${assetId}\n\nClick "Why #N?" on a priority card to get an explanation for the surrounding area.`);
          }}
        />
        {isScenarioModified && (
          <div className="absolute top-3 left-3">
            <ScenarioWarning />
          </div>
        )}
        {/* Infrastructure inventory caveat — P1-6 */}
        <div className="absolute bottom-3 right-3 bg-slate-900/80 border border-slate-700/60 rounded px-2 py-1 text-[10px] text-slate-500 backdrop-blur-sm">
          Mapped assets — curated inventory, incomplete
        </div>
      </div>
    </div>
  );
}
