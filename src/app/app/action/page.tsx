"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

// MapLibre match expression colours — keep in sync with MapCanvas ASSET_COLOR_EXPR
const ASSET_LEGEND: Array<{ label: string; color: string }> = [
  { label: "Hospital",  color: "#ef4444" },
  { label: "Shelter",   color: "#3b82f6" },
  { label: "Bridge",    color: "#eab308" },
  { label: "Power",     color: "#f97316" },
  { label: "Water",     color: "#06b6d4" },
];

export default function ActionPage() {
  const [activeTab, setActiveTab]           = useState<Tab>("priorities");
  const [scenarioParams, setScenarioParams] = useState<ScenarioParams>({
    windMult: 1.0, rainMult: 1.0, surgeHeight: 1.5, surgeMethod: "flood_fill",
  });
  const [k, setK]                   = useState<number>(RESPONSE_CAPACITY.default);
  const [objective, setObjective]   = useState("balanced");
  const [advisory, setAdvisory]     = useState<Advisory | null>(null);
  const [selectedRec, setSelectedRec] = useState<PriorityRecommendation | null>(null);
  const [focusCellId, setFocusCellId] = useState<string | null>(null);
  const [geminiAnswer, setGeminiAnswer] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [legendOpen, setLegendOpen]     = useState(false);
  const [profileStatus, setProfileStatus] = useState("DEMO FIXTURE");

  // Ref to the scrollable list container — used to scroll-to-card
  const listScrollRef = useRef<HTMLDivElement>(null);

  const setSelectedCell = useAppStore((s) => s.setSelectedCell);

  const isScenarioModified =
    scenarioParams.windMult !== 1.0 ||
    scenarioParams.rainMult !== 1.0 ||
    scenarioParams.surgeHeight !== 1.5;

  // ── Platform profile (map context badge) ─────────────────
  useEffect(() => {
    fetch("/api/platform/profile")
      .then((r) => r.json())
      .then((j: { ok: boolean; data?: { summary?: { overallStatus?: string } } }) => {
        if (j.ok && j.data?.summary?.overallStatus) {
          const s = j.data.summary.overallStatus;
          setProfileStatus(
            s === "GEE_ENRICHED" ? "GEE ENRICHED"
              : s === "MIXED"    ? "GEE MIXED"
              : "DEMO FIXTURE"
          );
        }
      })
      .catch(() => null);
  }, []);

  // ── Scroll list to selected card ─────────────────────────
  useEffect(() => {
    if (!selectedRec || !listScrollRef.current) return;
    const el = listScrollRef.current.querySelector(
      `[data-cellid="${selectedRec.cellId}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedRec]);

  // ── Handlers ─────────────────────────────────────────────

  const handleWhyClick = useCallback(async (
    cellId: string,
    rec?: PriorityRecommendation
  ) => {
    setSelectedCell(cellId);
    setSelectedRec(rec ?? null);
    setFocusCellId(cellId);   // trigger map flyTo
    setGeminiLoading(true);
    setGeminiAnswer(null);
    setActiveTab("priorities");
    try {
      const res = await fetch("/api/gemini/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: `Why is cell ${cellId} a high priority?`, cellId, k }),
      });
      const json = await res.json() as { ok: boolean; data?: { answer: string } };
      if (json.ok && json.data) setGeminiAnswer(json.data.answer);
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
    } catch { /* silent */ }
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
    const res = await fetch(`/api/advisory/${id}/dispatch`, { method: "POST" });
    const json = await res.json() as { ok: boolean; data?: { advisory: Advisory } };
    if (json.ok && json.data) setAdvisory(json.data.advisory);
  }, []);

  // Map cell click → select + start explanation (rec context comes from list click)
  const handleMapCellClick = useCallback((cellId: string) => {
    handleWhyClick(cellId);
  }, [handleWhyClick]);

  return (
    <div className="flex h-full">

      {/* ── Left decision panel ──────────────────────────────── */}
      <div className="relative w-96 flex-shrink-0 flex flex-col border-r border-[#d9d3ca] bg-[#f2efe9] overflow-hidden">

        {/* Controls row: K, Objective, Scenario trigger */}
        <div className="border-b border-[#d9d3ca] px-3 py-2 space-y-1.5">
          <div className="flex gap-2 items-center text-xs">
            <label className="text-stone-500 flex-shrink-0">K</label>
            <input
              type="number"
              min={1}
              max={200}
              value={k}
              onChange={(e) => setK(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-14 bg-white border border-stone-300 rounded px-2 py-1 text-stone-800 focus:outline-none focus:border-blue-500"
            />
            <label className="text-stone-500 flex-shrink-0">Obj</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="flex-1 bg-white border border-stone-300 rounded px-2 py-1 text-stone-800 focus:outline-none focus:border-blue-500"
            >
              <option value="balanced">Balanced</option>
              <option value="population">Population</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="service_continuity">Service</option>
            </select>
            {/* Compact scenario trigger */}
            <button
              onClick={() => setScenarioOpen(true)}
              title="Open scenario controls"
              className={`flex-shrink-0 text-[10px] rounded px-2 py-1 border font-semibold transition-colors ${
                isScenarioModified
                  ? "border-amber-400 bg-amber-50 text-amber-800"
                  : "border-stone-300 bg-stone-50 text-stone-600 hover:bg-stone-100"
              }`}
            >
              {isScenarioModified ? "SCENARIO ●" : "SCENARIO"}
            </button>
          </div>
          {isScenarioModified && (
            <div className="text-[10px] text-amber-700 font-semibold">
              SIMULATED — Wind {scenarioParams.windMult}× · Rain {scenarioParams.rainMult}× · Surge {scenarioParams.surgeHeight}m
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#d9d3ca]">
          {(["priorities", "advisory", "insurance"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 text-[11px] font-semibold tracking-wide capitalize transition-colors
                ${activeTab === t
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-stone-500 hover:text-stone-700"}`}
            >
              {t === "advisory" && advisory ? `${t} •` : t}
            </button>
          ))}
        </div>

        {/* Scrollable tab content */}
        <div ref={listScrollRef} className="flex-1 overflow-y-auto p-3">

          {activeTab === "priorities" && (
            <div className="space-y-3">

              {/* Selected rec detail panel */}
              {selectedRec && (
                <div className="rounded border border-[#d9d3ca] bg-white p-3 text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0
                        ${selectedRec.score >= 0.75 ? "bg-red-600" : selectedRec.score >= 0.5 ? "bg-orange-500" : "bg-yellow-500"}`}>
                        {selectedRec.rank}
                      </span>
                      <span className="text-stone-700 font-semibold">
                        Priority #{selectedRec.rank}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-stone-900 font-semibold">{pct(selectedRec.score)}</div>
                      <div className="text-[10px] text-stone-400">score</div>
                    </div>
                  </div>

                  {/* MODEL DRIVERS */}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-stone-400 mb-1.5">Model Drivers</div>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      {([
                        ["Hazard",      selectedRec.drivers.hazard],
                        ["Exposure",    selectedRec.drivers.exposure],
                        ["Criticality", selectedRec.drivers.criticality],
                        ["Dependency",  selectedRec.drivers.dependencyCentrality],
                      ] as [string, number][]).map(([label, val]) => (
                        <div key={label} className="bg-stone-100 rounded p-1.5">
                          <div className="text-stone-500">{label}</div>
                          <div className="font-mono text-stone-800">{pct(val)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedRec.evidence.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">Evidence</div>
                      <div className="space-y-0.5">
                        {selectedRec.evidence.slice(0, 4).map((e, i) => (
                          <div key={i} className="text-stone-600 font-mono leading-relaxed">{e}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedRec.recommendedActions.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">Actions</div>
                      <div className="space-y-1">
                        {selectedRec.recommendedActions.slice(0, 3).map((a, i) => (
                          <div key={i} className="text-blue-700 pl-2 border-l border-blue-300 leading-relaxed">{a}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(geminiLoading || geminiAnswer) && (
                    <div className="border-t border-[#d9d3ca] pt-2.5">
                      <div className="text-[10px] uppercase tracking-widest text-blue-600 mb-1.5">
                        AI-Generated Explanation
                      </div>
                      {geminiLoading ? (
                        <div className="flex items-center gap-2 text-stone-500">
                          <div className="h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent flex-shrink-0" />
                          Asking Gemini…
                        </div>
                      ) : (
                        <div className="text-stone-700 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                          {geminiAnswer}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[9px] text-stone-300 font-mono">{selectedRec.cellId.slice(0, 14)}…</span>
                    <button
                      onClick={() => {
                        setSelectedRec(null);
                        setFocusCellId(null);
                        setGeminiAnswer(null);
                        setSelectedCell(null);
                      }}
                      className="text-[10px] text-stone-400 hover:text-stone-600"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              <PriorityList
                k={k}
                objective={objective}
                scenarioParams={{ ...scenarioParams }}
                selectedCellId={selectedRec?.cellId ?? null}
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
              <p className="text-stone-400 text-sm text-center py-8">
                Click "Advisory" on a priority card to generate one.
              </p>
            )
          )}

          {activeTab === "insurance" && (
            <InsurancePanel scenarioParams={{
              surgeHeight: scenarioParams.surgeHeight,
              windMult:    scenarioParams.windMult,
              rainMult:    scenarioParams.rainMult,
            }} />
          )}
        </div>

        {/* ── Scenario drawer — slides over the panel ────────── */}
        {scenarioOpen && (
          <div className="absolute inset-0 z-30 flex flex-col bg-[#f2efe9]/95 backdrop-blur-sm">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#d9d3ca] bg-white">
              <span className="text-xs font-semibold text-stone-700">Scenario Controls</span>
              <button
                onClick={() => setScenarioOpen(false)}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
              >
                Done
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <ScenarioControls onChange={setScenarioParams} />
            </div>
          </div>
        )}
      </div>

      {/* ── Map ──────────────────────────────────────────────── */}
      <div className="relative flex-1">
        <MapWrapper
          activeLayer="priority"
          scenarioParams={{ ...scenarioParams, k, objective }}
          onCellClick={handleMapCellClick}
          showAssets={true}
          selectedCellId={selectedRec?.cellId ?? null}
          focusCellId={focusCellId}
          onAssetClick={(assetId, name, type) => {
            setActiveTab("priorities");
            setGeminiAnswer(
              `Selected asset: ${name} (${type})\nID: ${assetId}\n\nClick "Why #N?" on a priority card for spatial context.`
            );
          }}
        />

        {/* Map context overlay — top-left */}
        <div className="absolute top-3 left-3 bg-white/95 border border-stone-200 rounded shadow-sm px-2.5 py-1.5 text-[10px] space-y-0.5 backdrop-blur-sm">
          <div className="font-semibold text-stone-700">ACTION · FANI T−24H</div>
          <div className="text-stone-500">K={k} · {objective.toUpperCase()}</div>
          <div className={`font-semibold ${
            profileStatus === "GEE ENRICHED" ? "text-green-700"
              : profileStatus === "GEE MIXED"  ? "text-amber-700"
              : "text-stone-500"
          }`}>
            {profileStatus}
          </div>
          {isScenarioModified && (
            <div className="text-amber-700 font-semibold">SIMULATED SCENARIO</div>
          )}
        </div>

        {/* Scenario banner when modified */}
        {isScenarioModified && (
          <div className="absolute top-3 right-3">
            <ScenarioWarning />
          </div>
        )}

        {/* Legend — bottom-left */}
        <div className="absolute bottom-3 left-3">
          {legendOpen ? (
            <div className="bg-white/95 border border-stone-200 rounded shadow-sm p-2.5 text-[10px] min-w-[136px] backdrop-blur-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-stone-600 uppercase tracking-widest">Legend</span>
                <button onClick={() => setLegendOpen(false)} className="text-stone-400 hover:text-stone-700">✕</button>
              </div>

              <div className="text-stone-400 uppercase tracking-widest mb-1">Priority</div>
              {[
                { label: "Critical", cls: "bg-red-600" },
                { label: "High",     cls: "bg-orange-500" },
                { label: "Medium",   cls: "bg-yellow-500" },
              ].map(({ label, cls }) => (
                <div key={label} className="flex items-center gap-1.5 mb-0.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />
                  <span className="text-stone-600">{label}</span>
                </div>
              ))}

              <div className="text-stone-400 uppercase tracking-widest mt-2 mb-1">Infrastructure</div>
              {ASSET_LEGEND.map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-stone-600">{label}</span>
                </div>
              ))}

              <div className="mt-2 pt-1.5 border-t border-stone-200 text-stone-400 leading-relaxed">
                Curated inventory — incomplete
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLegendOpen(true)}
              className="bg-white/95 border border-stone-200 rounded shadow-sm px-2 py-1 text-[10px] text-stone-600 hover:bg-stone-50 backdrop-blur-sm"
            >
              Legend
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
