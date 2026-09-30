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
  coveragePercent?: number;
  coverageLabel?: string;
};

type GeeCoverageSource = {
  cells: number;
  coveragePercent: number;
  coverageLabel: string;
  note?: string;
};

type GeeCoverage = {
  totalAoiLandCells: number;
  worldpop: GeeCoverageSource;
  nasadem: GeeCoverageSource;
  buildings: GeeCoverageSource;
  overallCoverageNote?: string;
};

type ProfileData = {
  activeProfile: PlatformProfile;
  geeFiles: Record<string, GEEFile>;
  summary: Summary;
  geeCoverage?: GeeCoverage;
};

const STATUS_LABEL: Record<string, string> = {
  GEE_ENRICHED:       "GEE ENRICHED",
  GEE_ENRICHED_MIXED: "GEE ENRICHED · MIXED COVERAGE",
  PARTIAL_GEE:        "PARTIAL GEE",
  DEMO_ONLY:          "DEMO FIXTURE",
};

const STATUS_COLOR: Record<string, string> = {
  GEE_ENRICHED:       "text-green-700 bg-green-50 border-green-300",
  GEE_ENRICHED_MIXED: "text-amber-700 bg-amber-50 border-amber-300",
  PARTIAL_GEE:        "text-amber-700 bg-amber-50 border-amber-300",
  DEMO_ONLY:          "text-stone-600 bg-stone-100 border-stone-300",
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

  const { summary, geeFiles, geeCoverage } = data;
  const statusKey = summary.overallStatus;
  const statusLabel = STATUS_LABEL[statusKey] ?? statusKey;
  const statusClass = STATUS_COLOR[statusKey] ?? STATUS_COLOR.DEMO_ONLY;
  const coverPct = summary.coveragePercent;

  return (
    <div className="border-b border-[#d9d3ca] bg-[#f2efe9] px-4 py-1 text-[10px]">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Profile badge with coverage % when mixed */}
        <span
          className={`rounded border px-1.5 py-0.5 font-semibold tracking-wider ${statusClass}`}
          title={coverPct != null ? `Actual GEE cell coverage: ~${coverPct}% of AOI land cells` : undefined}
        >
          {statusLabel}
          {coverPct != null && coverPct < 95 && coverPct > 0 && (
            <span className="ml-1 font-normal opacity-70">~{coverPct}%</span>
          )}
        </span>

        {/* Source indicators */}
        <SourceDot label="Pop"   available={summary.hasRealPopulation}
          tooltip={`WorldPop 2019 / GEE${geeCoverage ? ` (${geeCoverage.worldpop.coveragePercent}% coverage)` : ""}`} />
        <SourceDot label="Elev"  available={summary.hasRealElevation}
          tooltip={`NASADEM / GEE${geeCoverage ? ` (${geeCoverage.nasadem.coveragePercent}% coverage)` : ""}`} />
        <SourceDot label="Flood" available={summary.hasFloodObservation}   tooltip="Sentinel-1 SAR (reveal)" />
        <SourceDot label="Rain"  available={summary.hasRainfallObservation} tooltip="GPM IMERG (reveal)" />

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto text-stone-400 hover:text-stone-600 transition-colors"
          title="Show data sources"
        >
          {expanded ? "▲ sources" : "▼ sources"}
        </button>
      </div>

      {/* Expanded source list */}
      {expanded && (
        <div className="mt-1.5 pt-1.5 border-t border-[#d9d3ca] space-y-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {Object.entries(geeFiles).map(([key, f]) => (
              <div key={key} className="flex items-center gap-1.5 text-[10px]">
                <span
                  className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${f.available ? "bg-green-500" : "bg-stone-300"}`}
                />
                <span className={f.available ? "text-stone-600" : "text-stone-400"}>
                  {f.role}
                </span>
              </div>
            ))}
          </div>
          {/* Coverage note */}
          {geeCoverage?.overallCoverageNote && (
            <div className="text-[10px] text-stone-500 italic">
              {geeCoverage.overallCoverageNote}
            </div>
          )}
          <div className="col-span-2 text-stone-400">
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
      className={`flex items-center gap-1 ${available ? "text-green-600" : "text-stone-400"}`}
      title={`${tooltip}: ${available ? "available" : "using synthetic fallback"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${available ? "bg-green-500" : "bg-stone-300"}`} />
      <span className={available ? "text-stone-600" : "text-stone-400"}>{label}</span>
    </span>
  );
}
