"use client";

/**
 * DataProfilePanel — compact data source status strip.
 *
 * Shows the active data profile and key source status.
 * Positioned just below the EventStatusBar in the app layout.
 *
 * Calls /api/platform/profile on mount to get live status.
 * Non-intrusive: minimal vertical space, collapses gracefully.
 */

import { useEffect, useState } from "react";

type GEEFile = { available: boolean; role: string };

type PlatformProfile = {
  id: string;
  label: string;
};

type Summary = {
  hasRealPopulation: boolean;
  hasRealElevation: boolean;
  hasFloodObservation: boolean;
  hasRainfallObservation: boolean;
  overallStatus: string;
};

type ProfileData = {
  activeProfile: PlatformProfile;
  geeFiles: Record<string, GEEFile>;
  summary: Summary;
};

const STATUS_LABEL: Record<string, string> = {
  GEE_ENRICHED: "GEE ENRICHED",
  PARTIAL_GEE:  "PARTIAL GEE",
  DEMO_ONLY:    "DEMO FIXTURE",
};

const STATUS_COLOR: Record<string, string> = {
  GEE_ENRICHED: "text-green-400 bg-green-950/40 border-green-800/50",
  PARTIAL_GEE:  "text-yellow-400 bg-yellow-950/40 border-yellow-800/50",
  DEMO_ONLY:    "text-slate-400 bg-slate-800/40 border-slate-700/50",
};

export function DataProfilePanel() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/platform/profile")
      .then((r) => r.json())
      .then((j: { ok: boolean; data?: ProfileData }) => {
        if (j.ok && j.data) setData(j.data);
      })
      .catch(() => null);
  }, []);

  if (!data) return null;

  const { summary, geeFiles } = data;
  const statusKey = summary.overallStatus;
  const statusLabel = STATUS_LABEL[statusKey] ?? statusKey;
  const statusClass = STATUS_COLOR[statusKey] ?? STATUS_COLOR.DEMO_ONLY;

  return (
    <div className="border-b border-slate-800/80 bg-[#0e1117] px-4 py-1 text-[10px]">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Profile badge */}
        <span
          className={`rounded border px-1.5 py-0.5 font-semibold tracking-wider ${statusClass}`}
        >
          {statusLabel}
        </span>

        {/* Source indicators */}
        <SourceDot label="Pop" available={summary.hasRealPopulation} tooltip="WorldPop 2019 / GEE" />
        <SourceDot label="Elev" available={summary.hasRealElevation} tooltip="NASADEM / GEE" />
        <SourceDot label="Flood" available={summary.hasFloodObservation} tooltip="Sentinel-1 SAR (reveal)" />
        <SourceDot label="Rain" available={summary.hasRainfallObservation} tooltip="GPM IMERG (reveal)" />

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto text-slate-600 hover:text-slate-400 transition-colors"
          title="Show data sources"
        >
          {expanded ? "▲ sources" : "▼ sources"}
        </button>
      </div>

      {/* Expanded source list */}
      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 grid grid-cols-2 gap-x-4 gap-y-0.5">
          {Object.entries(geeFiles).map(([key, f]) => (
            <div key={key} className="flex items-center gap-1.5 text-[10px]">
              <span
                className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${f.available ? "bg-green-500" : "bg-slate-600"}`}
              />
              <span className={f.available ? "text-slate-300" : "text-slate-600"}>
                {f.role}
              </span>
            </div>
          ))}
          <div className="col-span-2 mt-1 text-slate-700">
            Unavailable sources use deterministic DEMO_FIXTURE fallback
          </div>
        </div>
      )}
    </div>
  );
}

function SourceDot({
  label,
  available,
  tooltip,
}: {
  label: string;
  available: boolean;
  tooltip: string;
}) {
  return (
    <span
      className={`flex items-center gap-1 ${available ? "text-green-500" : "text-slate-600"}`}
      title={`${tooltip}: ${available ? "available" : "using synthetic fallback"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${available ? "bg-green-500" : "bg-slate-600"}`} />
      <span className={available ? "text-slate-400" : "text-slate-600"}>{label}</span>
    </span>
  );
}
