"use client";

import { useState, useCallback, useEffect } from "react";
import { MapWrapper } from "@/components/map/MapWrapper";
import { ConfidenceBar } from "@/components/shared/ConfidenceBar";
import { useAppStore } from "@/store/index";
import type { MapLayerId } from "@/lib/types/index";

const LAYERS: { id: MapLayerId; label: string }[] = [
  { id: "combined_hazard", label: "Combined Hazard" },
  { id: "wind",            label: "Wind" },
  { id: "rainfall",        label: "Rainfall" },
  { id: "surge",           label: "Surge" },
  { id: "population",      label: "Population" },
  { id: "impact",          label: "Impact Exposure" },
  { id: "priority",        label: "Priority" },
];

type CellDetail = {
  cellId: string;
  hazard: Record<string, number>;
  exposure: Record<string, number | boolean>;
  susceptibility: Record<string, number | boolean>;
  impactExposure: { score: number; probability: number; severity: number; confidence: unknown };
  infrastructure: Record<string, number>;
  dataStatus?: string;
};

export default function ImpactPage() {
  const [activeLayer, setActiveLayer] = useState<MapLayerId>("combined_hazard");
  const [cellDetail, setCellDetail] = useState<CellDetail | null>(null);
  const [cellLoading, setCellLoading] = useState(false);
  const [profileStatus, setProfileStatus] = useState<string>("GEE ENRICHED");
  const setSelectedCell = useAppStore((s) => s.setSelectedCell);

  useEffect(() => {
    fetch("/api/platform/profile")
      .then((r) => r.json())
      .then((j: { ok: boolean; data?: { summary?: { overallStatus?: string } } }) => {
        if (j.ok && j.data?.summary?.overallStatus) {
          const s = j.data.summary.overallStatus;
          setProfileStatus(s === "GEE_ENRICHED" ? "GEE ENRICHED" : s === "GEE_ENRICHED_MIXED" ? "GEE · MIXED COVERAGE" : "DEMO FIXTURE");
        }
      })
      .catch(() => null);
  }, []);

  const handleCellClick = useCallback(async (cellId: string) => {
    setSelectedCell(cellId);
    setCellLoading(true);
    setCellDetail(null);
    try {
      const res = await fetch(`/api/explain/${encodeURIComponent(cellId)}`);
      const json = await res.json() as { ok: boolean; data?: { cell?: CellDetail & { dataStatus?: string } } };
      if (json.ok && json.data?.cell) {
        setCellDetail({ ...json.data.cell, dataStatus: json.data.cell.dataStatus });
      }
    } catch {
      // Silently handle
    } finally {
      setCellLoading(false);
    }
  }, [setSelectedCell]);

  return (
    <div className="flex h-full">
      {/* Map — fills left portion */}
      <div className="relative flex-1">
        <MapWrapper
          activeLayer={activeLayer}
          onCellClick={handleCellClick}
        />

        {/* Layer selector overlay */}
        <div className="absolute bottom-12 left-4 bg-white/95 border border-stone-200 rounded-lg p-2 flex flex-wrap gap-1 backdrop-blur-sm shadow-sm max-w-xs">
          {LAYERS.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveLayer(l.id)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                activeLayer === l.id
                  ? "bg-blue-600 text-white"
                  : "bg-stone-100 text-stone-500 hover:text-stone-700 hover:bg-stone-200"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Data label overlay */}
        <div className="absolute top-3 left-3">
          <span className="bg-white/95 border border-green-400 text-green-700 text-[10px] font-semibold px-2 py-0.5 rounded tracking-wider backdrop-blur-sm shadow-sm">
            {profileStatus}
          </span>
        </div>
      </div>

      {/* Cell detail panel */}
      <div className="w-80 flex-shrink-0 border-l border-[#d9d3ca] bg-[#f2efe9] overflow-y-auto p-4 space-y-4">
        <div className="text-xs font-semibold text-stone-500 uppercase tracking-widest">
          Cell Detail
        </div>

        {!cellDetail && !cellLoading && (
          <p className="text-stone-400 text-sm">Click a cell on the map to see its impact breakdown.</p>
        )}

        {cellLoading && (
          <div className="flex items-center gap-2 text-stone-500 text-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Loading…
          </div>
        )}

        {cellDetail && (
          <div className="space-y-4 text-xs">
            <div className="font-mono text-[10px] text-stone-400 break-all">{cellDetail.cellId}</div>

            {/* Impact score */}
            <div className="bg-stone-100 rounded p-3">
              <div className="text-stone-500 mb-1">Impact Exposure</div>
              <div className="text-2xl font-bold text-stone-900">
                {((cellDetail.impactExposure?.score ?? 0) * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] text-stone-400 mt-0.5">disruption risk</div>
            </div>

            {/* Hazard */}
            <Section title="Hazard" color="text-orange-600">
              {Object.entries(cellDetail.hazard ?? {}).map(([k, v]) => (
                <Row key={k} label={k} value={`${(Number(v) * 100).toFixed(1)}%`} />
              ))}
            </Section>

            {/* Exposure */}
            <Section title="Exposure" color="text-blue-600">
              <Row label="Population" value={Number(cellDetail.exposure?.population ?? 0).toLocaleString()} />
              <Row label="Buildings"  value={String(cellDetail.exposure?.buildings ?? 0)} />
              <Row label="Road km"    value={`${cellDetail.exposure?.roadKm ?? 0}`} />
              <Row label="Assets"     value={String(cellDetail.exposure?.criticalAssetCount ?? 0)} />
            </Section>

            {/* Susceptibility */}
            <Section title="Susceptibility" color="text-cyan-700">
              <Row label="Flood"        value={`${(Number(cellDetail.susceptibility?.floodSusceptibility ?? 0) * 100).toFixed(0)}%`} />
              <Row label="Wind exposure" value={`${(Number(cellDetail.susceptibility?.windExposure ?? 0) * 100).toFixed(0)}%`} />
              <Row label="Elevation"    value={`${cellDetail.susceptibility?.elevationMedianM ?? 0} m`} />
              <Row label="Coast dist"   value={`${cellDetail.susceptibility?.coastalProximityKm ?? 0} km`} />
              <Row label="Surge exposed" value={cellDetail.susceptibility?.surgeExposed ? "Yes" : "No"} />
            </Section>

            {/* Infrastructure */}
            {Number(cellDetail.infrastructure?.assetCount ?? 0) > 0 && (
              <Section title="Infrastructure" color="text-purple-700">
                <Row label="Assets in cell" value={String(cellDetail.infrastructure?.assetCount)} />
                <Row label="Criticality"    value={`${(Number(cellDetail.infrastructure?.combinedCriticality ?? 0) * 100).toFixed(0)}%`} />
                <Row label="Dependency"     value={`${(Number(cellDetail.infrastructure?.dependencyCentrality ?? 0) * 100).toFixed(0)}%`} />
              </Section>
            )}

            {/* Confidence */}
            <ConfidenceBar confidence={cellDetail.impactExposure?.confidence as Parameters<typeof ConfidenceBar>[0]["confidence"]} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`text-[10px] font-semibold uppercase tracking-widest mb-1.5 ${color}`}>{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-stone-500">{label}</span>
      <span className="font-mono text-stone-700">{value}</span>
    </div>
  );
}
