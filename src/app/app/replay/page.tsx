"use client";

import { useState, useCallback, useEffect } from "react";
import { MapWrapper } from "@/components/map/MapWrapper";
import { PriorityList } from "@/components/priority/PriorityList";
import { AdvisoryPanel } from "@/components/advisory/AdvisoryPanel";
import { ReplayControls } from "@/components/replay/ReplayControls";
import { ScenarioControls, type ScenarioParams } from "@/components/scenario/ScenarioControls";
import { InsurancePanel } from "@/components/insurance/InsurancePanel";
import { SourceTierBadge, DemoFixtureWarning, ScenarioWarning } from "@/components/shared/SourceTierBadge";
import { useAppStore } from "@/store/index";
import type { ReplayPhase, Advisory } from "@/lib/types/index";
import { FANI_KNOWN_PARAMETERS } from "@/config/index";

export default function ReplayPage() {
  const [replayPhase, setReplayPhase] = useState<ReplayPhase>("PREDICTION");
  const [scenarioParams, setScenarioParams] = useState<ScenarioParams>({
    windMult: 1.0, rainMult: 1.0, surgeHeight: 1.5, surgeMethod: "flood_fill",
  });
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [geminiAnswer, setGeminiAnswer] = useState<string | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [actualRevealed, setActualRevealed] = useState(false);
  const [revealData, setRevealData] = useState<{ metricsUnavailableReason?: string; metrics?: Record<string, number | undefined>; baselineMetrics?: Record<string, number> } | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);

  const setSelectedCell = useAppStore((s) => s.setSelectedCell);

  const isScenario = replayPhase === "SCENARIO";

  // When phase changes to EXPLAIN, clear answer
  useEffect(() => {
    if (replayPhase === "EXPLAIN") setGeminiAnswer(null);
  }, [replayPhase]);

  const handleWhyClick = useCallback(async (cellId: string, _rec?: import("@/lib/types/index").PriorityRecommendation) => {
    setSelectedCell(cellId);
    if (replayPhase !== "EXPLAIN") setReplayPhase("EXPLAIN");
    setGeminiLoading(true);
    setGeminiAnswer(null);
    try {
      const res = await fetch("/api/gemini/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Why is this location prioritized in the Fani T-24h replay? Explain the key risk drivers.`,
          cellId,
          k: 10,
        }),
      });
      const json = await res.json() as { ok: boolean; data?: { answer: string; isFallback: boolean } };
      if (json.ok && json.data) setGeminiAnswer(json.data.answer);
    } catch {
      setGeminiAnswer("Unable to get explanation. See /api/explain for deterministic output.");
    } finally {
      setGeminiLoading(false);
    }
  }, [replayPhase, setSelectedCell]);

  const handleGenerateAdvisory = useCallback(async (cellId: string) => {
    setReplayPhase("ADVISORY");
    try {
      const res = await fetch("/api/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cellId, k: 10 }),
      });
      const json = await res.json() as { ok: boolean; data?: { advisory: Advisory } };
      if (json.ok && json.data) setAdvisory(json.data.advisory);
    } catch {
      // handle
    }
  }, []);

  const handleApprove = useCallback(async (id: string) => {
    setReplayPhase("APPROVAL");
    const res = await fetch(`/api/advisory/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", approvedBy: "operator" }),
    });
    const json = await res.json() as { ok: boolean; data?: { advisory: Advisory } };
    if (json.ok && json.data) setAdvisory(json.data.advisory);
  }, []);

  const handleDispatch = useCallback(async (id: string) => {
    const res = await fetch(`/api/advisory/${id}/dispatch`, { method: "POST" });
    const json = await res.json() as { ok: boolean; data?: { advisory: Advisory } };
    if (json.ok && json.data) setAdvisory(json.data.advisory);
  }, []);

  const handleReveal = useCallback(async () => {
    setRevealLoading(true);
    try {
      const res = await fetch("/api/replay/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: 10 }),
      });
      const json = await res.json() as { ok: boolean; data?: { evaluation?: { metricsUnavailableReason?: string; metrics?: Record<string, number | undefined>; baselineMetrics?: Record<string, number> } } };
      if (json.ok && json.data) {
        setActualRevealed(true);
        setRevealData(json.data.evaluation ?? null);
        setReplayPhase("EVALUATE");
      }
    } catch {
      // handle
    } finally {
      setRevealLoading(false);
    }
  }, []);

  const activeLayer = actualRevealed && replayPhase === "EVALUATE" ? "actual_impact" :
    isScenario ? "combined_hazard" :
    replayPhase === "PREDICTION" || replayPhase === "EXPLAIN" ? "combined_hazard" :
    "priority";

  return (
    <div className="flex h-full flex-col">
      {/* Top header: event info */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#12151f] px-4 py-2 text-xs flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-200">Cyclone Fani 2019</span>
          <span className="text-slate-500">T−24h Replay</span>
          <span className="font-mono text-[10px] text-slate-600">{FANI_KNOWN_PARAMETERS.predictionCutoffAt}</span>
        </div>
        <div className="flex items-center gap-2">
          <SourceTierBadge tier={actualRevealed ? "AUTHORITATIVE_OPEN" : "DEMO_FIXTURE"} />
          {!actualRevealed && (
            <span className="text-[10px] text-slate-600">prediction phase</span>
          )}
          {actualRevealed && (
            <span className="text-[10px] bg-amber-900/40 border border-amber-700/40 text-amber-400 px-2 py-0.5 rounded font-semibold">
              ACTUAL REVEALED
            </span>
          )}
        </div>
      </div>

      {/* Replay phase controls */}
      <div className="border-b border-slate-800 bg-[#12151f] px-4 py-3 flex-shrink-0">
        <ReplayControls
          currentPhase={replayPhase}
          onPhaseChange={setReplayPhase}
          actualRevealed={actualRevealed}
          evaluationResult={revealData}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Side panel */}
        <div className="w-96 flex-shrink-0 flex flex-col border-r border-slate-800 bg-[#12151f] overflow-y-auto">
          <div className="p-3 space-y-3">
            <DemoFixtureWarning />

            {/* Information firewall notice */}
            {!actualRevealed && (
              <div className="text-[10px] text-slate-600 border border-slate-800 rounded px-2 py-1.5">
                Information firewall active — only pre-event data shown (cutoff: T−24h)
              </div>
            )}

            {/* Phase-specific content */}
            {(replayPhase === "PREDICTION") && (
              <PriorityList
                k={10}
                objective="balanced"
                onWhyClick={handleWhyClick}
                onGenerateAdvisory={handleGenerateAdvisory}
              />
            )}

            {replayPhase === "EXPLAIN" && (
              <div className="space-y-3">
                {geminiLoading && (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    Asking Gemini…
                  </div>
                )}
                {geminiAnswer && (
                  <div className="rounded border border-blue-800/40 bg-blue-950/20 p-3 text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                    {geminiAnswer}
                  </div>
                )}
                {!geminiLoading && !geminiAnswer && (
                  <p className="text-slate-500 text-sm">Click "Why #N?" on a priority card to ask for an explanation.</p>
                )}
                <PriorityList
                  k={10}
                  objective="balanced"
                  onWhyClick={handleWhyClick}
                  onGenerateAdvisory={handleGenerateAdvisory}
                />
              </div>
            )}

            {replayPhase === "SCENARIO" && (
              <div className="space-y-3">
                <ScenarioWarning />
                <ScenarioControls onChange={setScenarioParams} />
                <PriorityList
                  k={10}
                  objective="balanced"
                  scenarioParams={{ ...scenarioParams }}
                  onWhyClick={handleWhyClick}
                  onGenerateAdvisory={handleGenerateAdvisory}
                />
              </div>
            )}

            {(replayPhase === "ADVISORY" || replayPhase === "APPROVAL") && (
              advisory ? (
                <AdvisoryPanel
                  advisory={advisory}
                  onApprove={handleApprove}
                  onReject={async (id) => {
                    const res = await fetch(`/api/advisory/${id}/approve`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "reject" }),
                    });
                    const json = await res.json() as { ok: boolean; data?: { advisory: Advisory } };
                    if (json.ok && json.data) setAdvisory(json.data.advisory);
                  }}
                  onDispatch={handleDispatch}
                />
              ) : (
                <p className="text-slate-500 text-sm">No advisory generated yet. Click "Advisory" on a priority card.</p>
              )
            )}

            {replayPhase === "REVEAL" && !actualRevealed && (
              <div className="space-y-3 text-center py-4">
                <p className="text-slate-400 text-sm">
                  Click below to reveal actual post-event impact evidence.
                </p>
                <p className="text-[11px] text-slate-600">
                  This unlocks post-event data. The information firewall will be lifted.
                </p>
                <button
                  onClick={handleReveal}
                  disabled={revealLoading}
                  className="w-full rounded-lg border border-amber-600/60 bg-amber-950/40 hover:bg-amber-900/40 px-4 py-3 text-sm font-semibold text-amber-300 transition-colors disabled:opacity-50"
                >
                  {revealLoading ? "Loading actual data…" : "Reveal Actual Impact"}
                </button>
              </div>
            )}

            {replayPhase === "REVEAL" && actualRevealed && (
              <div className="text-center py-4 space-y-2">
                <div className="text-green-400 font-semibold text-sm">Actual impact revealed</div>
                <p className="text-slate-500 text-xs">Post-event evidence loaded. View EVALUATE phase for metrics.</p>
                <button onClick={() => setReplayPhase("EVALUATE")} className="text-blue-400 text-xs hover:text-blue-300">
                  Go to Evaluate →
                </button>
              </div>
            )}

            {replayPhase === "EVALUATE" && (
              <div className="space-y-4">
                {revealData?.metricsUnavailableReason ? (
                  <div className="rounded border border-slate-700/50 bg-slate-800/40 p-3 text-xs text-slate-500">
                    <div className="mb-1 font-semibold text-slate-400">Metrics Unavailable</div>
                    <p>{revealData.metricsUnavailableReason}</p>
                  </div>
                ) : revealData?.metrics ? (
                  <div className="rounded border border-slate-700/40 bg-slate-800/30 p-3 space-y-3 text-xs">
                    {/* Proxy notice */}
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                      Sentinel-1 observed inundation proxy — not exact flood-depth ground truth.
                      Metrics reflect model-vs-proxy agreement.
                    </p>

                    {/* Recall metrics */}
                    <div>
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        Recall Metrics
                      </div>
                      <div className="space-y-1.5">
                        {([
                          ["precisionAtK",                 "Precision@K"],
                          ["observedZoneRecall",            "Observed-zone recall"],
                          ["populationWeightedCapture",     "Population-weighted capture"],
                          ["infrastructureWeightedCapture", "Infrastructure-weighted capture"],
                        ] as [string, string][]).map(([key, label]) => {
                          const v = (revealData.metrics as Record<string, number | undefined>)[key];
                          return v !== undefined ? (
                            <div key={key} className="flex items-center justify-between gap-2">
                              <span className="text-slate-500">{label}</span>
                              <span className="font-mono tabular-nums text-slate-200">{(v * 100).toFixed(1)}%</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>

                    {/* Baselines */}
                    <div className="border-t border-slate-700/50 pt-3">
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        Baselines — Precision@K
                      </div>
                      <div className="space-y-1.5">
                        {Object.entries(revealData.baselineMetrics ?? {}).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-2">
                            <span className="text-slate-500">
                              {k === "hazard_only_precisionAtK" ? "Hazard only"
                                : k === "hazard_x_exposure_precisionAtK" ? "Hazard × exposure"
                                : k}
                            </span>
                            <span className="font-mono tabular-nums text-slate-300">{(v * 100).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                <InsurancePanel scenarioParams={{ surgeHeight: scenarioParams.surgeHeight }} />
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="relative flex-1">
          <MapWrapper
            activeLayer={activeLayer}
            scenarioParams={isScenario ? { ...scenarioParams } : {}}
            onCellClick={handleWhyClick}
          />
          {/* Phase label overlay on the map */}
          <div className="absolute top-3 left-3">
            {!actualRevealed ? (
              <span className="bg-slate-900/90 border border-blue-700/60 text-blue-300 text-[11px] font-semibold px-2.5 py-1 rounded backdrop-blur-sm">
                T-24H PREDICTION
              </span>
            ) : (
              <span className="bg-slate-900/90 border border-amber-700/60 text-amber-300 text-[11px] font-semibold px-2.5 py-1 rounded backdrop-blur-sm">
                OBSERVED INUNDATION PROXY — Sentinel-1 SAR
              </span>
            )}
          </div>
          {isScenario && (
            <div className="absolute top-10 left-3">
              <ScenarioWarning />
            </div>
          )}
          {actualRevealed && (
            <div className="absolute bottom-4 left-4 bg-amber-900/80 border border-amber-700 rounded px-3 py-1.5 text-[11px] text-amber-300 font-semibold">
              ACTUAL POST-EVENT DATA REVEALED
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
