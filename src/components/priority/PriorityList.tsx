"use client";

import { useState, useEffect } from "react";
import type { PriorityRecommendation } from "@/lib/types/index";
import { PriorityCard } from "./PriorityCard";
import { DemoFixtureWarning } from "../shared/SourceTierBadge";

type Props = {
  k?: number;
  objective?: string;
  scenarioParams?: Record<string, unknown>;
  /** cellId to visually highlight as selected (from map click or list click) */
  selectedCellId?: string | null;
  onWhyClick?: (cellId: string, rec: import("@/lib/types/index").PriorityRecommendation) => void;
  onGenerateAdvisory?: (cellId: string) => void;
};

export function PriorityList({
  k = 10,
  objective = "balanced",
  scenarioParams,
  selectedCellId = null,
  onWhyClick,
  onGenerateAdvisory,
}: Props) {
  const [recs, setRecs]                 = useState<PriorityRecommendation[]>([]);
  const [fixtureStatus, setFixtureStatus] = useState<string>("");
  const [stats, setStats]               = useState<Record<string, number> | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      k:           String(k),
      objective,
      surgeHeight: String(scenarioParams?.surgeHeight ?? 1.5),
      windMult:    String(scenarioParams?.windMult ?? 1.0),
      rainMult:    String(scenarioParams?.rainMult ?? 1.0),
      surgeMethod: String(scenarioParams?.surgeMethod ?? "flood_fill"),
    });

    fetch(`/api/priorities?${params}`)
      .then((r) => r.json())
      .then((json: {
        ok: boolean;
        data?: { recommendations?: PriorityRecommendation[]; fixtureStatus?: string; stats?: Record<string, number> };
        error?: { message: string };
      }) => {
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
      <div className="p-4 text-center text-stone-400 text-sm">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto mb-2" />
        Computing priorities…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-600 text-sm">
        Failed to load priorities: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Compact inline stat strip — replaces three separate metric boxes */}
      {stats && (
        <div className="text-[10px] text-stone-500 flex items-center gap-1.5 flex-wrap mb-1">
          <span>
            <span className="font-mono text-stone-700">{stats.landCells?.toLocaleString()}</span>
            {" LAND"}
          </span>
          <span className="text-stone-300">·</span>
          <span>
            <span className="font-mono text-stone-700">{stats.highHazardCells?.toLocaleString()}</span>
            {" HIGH HAZARD"}
          </span>
          <span className="text-stone-300">·</span>
          <span>
            <span className="font-mono text-stone-700">{stats.surgeExposedCells?.toLocaleString()}</span>
            {" SURGE"}
          </span>
        </div>
      )}

      {fixtureStatus === "DEMO_FIXTURE" && <DemoFixtureWarning />}

      {recs.length === 0 ? (
        <div className="text-stone-400 text-sm text-center py-4">
          No priority recommendations available.
        </div>
      ) : (
        recs.map((rec) => (
          <div key={rec.cellId} data-cellid={rec.cellId}
            className={selectedCellId === rec.cellId ? "ring-2 ring-blue-400 ring-offset-1 rounded" : ""}
          >
            <PriorityCard
              rec={rec}
              onWhyClick={onWhyClick}
              onGenerateAdvisory={onGenerateAdvisory}
            />
          </div>
        ))
      )}
    </div>
  );
}
