"use client";

import { useState, useEffect } from "react";
import type { PriorityRecommendation } from "@/lib/types/index";
import { PriorityCard } from "./PriorityCard";
import { DemoFixtureWarning } from "../shared/SourceTierBadge";

type Props = {
  k?: number;
  objective?: string;
  scenarioParams?: Record<string, unknown>;
  onWhyClick?: (cellId: string, rec: import("@/lib/types/index").PriorityRecommendation) => void;
  onGenerateAdvisory?: (cellId: string) => void;
};

export function PriorityList({
  k = 10,
  objective = "balanced",
  scenarioParams,
  onWhyClick,
  onGenerateAdvisory,
}: Props) {
  const [recs, setRecs] = useState<PriorityRecommendation[]>([]);
  const [fixtureStatus, setFixtureStatus] = useState<string>("");
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      k: String(k),
      objective,
      surgeHeight: String(scenarioParams?.surgeHeight ?? 1.5),
      windMult: String(scenarioParams?.windMult ?? 1.0),
      rainMult: String(scenarioParams?.rainMult ?? 1.0),
      surgeMethod: String(scenarioParams?.surgeMethod ?? "flood_fill"),
    });

    fetch(`/api/priorities?${params}`)
      .then((r) => r.json())
      .then((json: { ok: boolean; data?: { recommendations?: PriorityRecommendation[]; fixtureStatus?: string; stats?: Record<string,number> }; error?: { message: string } }) => {
        if (json.ok && json.data) {
          setRecs(json.data.recommendations ?? []);
          setFixtureStatus(json.data.fixtureStatus ?? "");
          setStats(json.data.stats ?? null);
        } else {
          setError(json.error?.message ?? "Failed to load priorities");
        }
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [k, objective, scenarioParams]);

  if (loading) {
    return (
      <div className="p-4 text-center text-slate-500 text-sm">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto mb-2" />
        Computing priorities…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-400 text-sm">
        Failed to load priorities: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Header stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 text-[11px] mb-1">
          <div className="bg-slate-800/60 rounded p-2 text-center">
            <div className="text-slate-400">Land cells</div>
            <div className="font-mono text-slate-200">{stats.landCells?.toLocaleString()}</div>
          </div>
          <div className="bg-slate-800/60 rounded p-2 text-center">
            <div className="text-slate-400">High hazard</div>
            <div className="font-mono text-slate-200">{stats.highHazardCells?.toLocaleString()}</div>
          </div>
          <div className="bg-slate-800/60 rounded p-2 text-center">
            <div className="text-slate-400">Surge exposed</div>
            <div className="font-mono text-slate-200">{stats.surgeExposedCells?.toLocaleString()}</div>
          </div>
        </div>
      )}

      {fixtureStatus === "DEMO_FIXTURE" && <DemoFixtureWarning />}

      {/* Priority cards */}
      {recs.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-4">
          No priority recommendations available.
        </div>
      ) : (
        recs.map((rec) => (
          <PriorityCard
            key={rec.cellId}
            rec={rec}
            onWhyClick={onWhyClick}
            onGenerateAdvisory={onGenerateAdvisory}
          />
        ))
      )}
    </div>
  );
}
