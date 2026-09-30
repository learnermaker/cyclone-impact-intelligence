"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/store/index";
import { SourceTierBadge } from "@/components/shared/SourceTierBadge";

type MeteoContext = {
  windSpeed10m: number;
  windGusts10m: number;
  precipitation: number;
  pressure: number;
  fetchedAt: string;
  referenceLocation?: string;
  label?: string;
};

type EventStatus = {
  hasActiveEvent: boolean;
  mode: "LIVE" | "DEMO";
  // Real live event (only when hasActiveEvent=true)
  activeEvent?: {
    eventId: string;
    displayLabel: string;
    tier: string;
    source?: string;
    trackNote?: string;
    cyclone?: {
      name?: string;
      maxWindKph?: number;
      latitude?: number;
      longitude?: number;
    };
    surge?: { heightM?: number };
    rainfall?: { forecast24hMm?: number };
  };
  // Demo/offline path (always available)
  demoAvailable: boolean;
  demoEvent?: {
    eventId: string;
    displayLabel: string;
    tier: string;
    fixtureStatus?: string;
  };
  // Meteorological context from Open-Meteo
  meteorologicalContext?: MeteoContext | null;
  meteorologicalContextNote?: string | null;
  // Adapter status
  liveAdapterStatus?: "ok" | "no_event" | "unavailable";
  liveAdapterNote?: string;
  spatialModelNote?: string;
  dataWarning?: string | null;
};

export default function LivePage() {
  const [status, setStatus] = useState<EventStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const setMode = useAppStore((s) => s.setMode);
  const resetReplay = useAppStore((s) => s.resetReplay);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((j: { ok: boolean; data?: EventStatus }) => {
        if (j.ok && j.data) setStatus(j.data);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  // Derived from the actual API response — not hardcoded
  const hasRealCyclone = !!(status?.hasActiveEvent && status.mode === "LIVE" && status.activeEvent);

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      {loading ? (
        <div className="text-stone-400 text-sm animate-pulse">Checking live feeds…</div>
      ) : hasRealCyclone && status?.activeEvent ? (
        /* ── Real active cyclone ─────────────────────────────────────────── */
        <div className="max-w-2xl w-full space-y-6">
          <div>
            <div className="text-stone-400 text-xs uppercase tracking-widest mb-3">Live Mode — Active Cyclone</div>
            <h1 className="text-2xl font-bold text-stone-900 mb-1">
              {status.activeEvent.cyclone?.name ?? "Active Tropical Cyclone"}
            </h1>
            <p className="text-stone-500 text-sm">
              {status.activeEvent.displayLabel}
            </p>
          </div>

          {/* Cyclone details */}
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm space-y-2">
            {status.activeEvent.cyclone?.latitude != null && (
              <div className="flex justify-between">
                <span className="text-stone-500">Position</span>
                <span className="font-mono text-stone-800">
                  {status.activeEvent.cyclone.latitude.toFixed(2)}°N,{" "}
                  {status.activeEvent.cyclone.longitude?.toFixed(2)}°E
                </span>
              </div>
            )}
            {(status.activeEvent.cyclone?.maxWindKph ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-stone-500">Max Wind</span>
                <span className="font-mono text-stone-800">
                  {status.activeEvent.cyclone?.maxWindKph} km/h
                </span>
              </div>
            )}
            {status.activeEvent.trackNote && (
              <div className="text-[11px] text-stone-400 italic">{status.activeEvent.trackNote}</div>
            )}
          </div>

          {/* Source badge */}
          <div className="flex items-center gap-2">
            <SourceTierBadge tier={status.activeEvent.tier as "AUTHORITATIVE_OPEN"} />
            {status.activeEvent.source && (
              <span className="text-[11px] text-stone-400">Source: {status.activeEvent.source}</span>
            )}
          </div>

          {/* Meteorological context from Open-Meteo */}
          {status.meteorologicalContext && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-stone-400 mb-2">
                Meteorological Context — MODEL-DERIVED
              </div>
              <div className="text-[10px] text-amber-700 mb-2">
                {status.meteorologicalContext.label}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-stone-500">Wind</span>
                  <span className="font-mono text-stone-800">{status.meteorologicalContext.windSpeed10m.toFixed(0)} km/h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Gusts</span>
                  <span className="font-mono text-stone-800">{status.meteorologicalContext.windGusts10m.toFixed(0)} km/h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Precip (24h)</span>
                  <span className="font-mono text-stone-800">{status.meteorologicalContext.precipitation.toFixed(1)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Pressure</span>
                  <span className="font-mono text-stone-800">{status.meteorologicalContext.pressure.toFixed(0)} hPa</span>
                </div>
              </div>
              {status.meteorologicalContext.referenceLocation && (
                <div className="text-[10px] text-stone-400">
                  Reference: {status.meteorologicalContext.referenceLocation}
                </div>
              )}
            </div>
          )}

          {/* Spatial model note */}
          {status.spatialModelNote && (
            <div className="text-[10px] text-stone-400 border border-stone-200 rounded px-3 py-2">
              {status.spatialModelNote}
            </div>
          )}

          {/* Launch buttons */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/app/impact"
              onClick={() => setMode("IMPACT")}
              className="rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 px-6 py-4 text-left transition-colors"
            >
              <div className="text-sm font-semibold text-blue-700 mb-1">Launch Impact Engine</div>
              <div className="text-[11px] text-blue-600 leading-relaxed">
                Analyse hazard, exposure and infrastructure risk for the current scenario.
              </div>
            </Link>
            <Link
              href="/app/action"
              onClick={() => setMode("ACTION")}
              className="rounded-lg border border-stone-300 bg-stone-50 hover:bg-stone-100 px-6 py-4 text-left transition-colors"
            >
              <div className="text-sm font-semibold text-stone-700 mb-1">Response Priorities</div>
              <div className="text-[11px] text-stone-500 leading-relaxed">
                Top-K interventions with infrastructure-aware advisory workflow.
              </div>
            </Link>
          </div>

          <div className="text-[10px] text-stone-400">
            NOT AN OFFICIAL WARNING SYSTEM. Not replacing IMD or INCOIS.
          </div>
        </div>
      ) : (
        /* ── No active cyclone — honest empty state ───────────────────────── */
        <div className="text-center max-w-lg space-y-8">
          <div>
            <div className="text-stone-400 text-xs uppercase tracking-widest mb-3">Live Mode</div>
            <h1 className="text-2xl font-bold text-stone-900 mb-2">No active cyclone event</h1>
            <p className="text-stone-500 text-sm leading-relaxed">
              No live cyclone is currently active in the Bay of Bengal / Odisha corridor.
              The application will show live data when an event is detected via GDACS or IMD.
            </p>
          </div>

          {/* Meteorological context even in empty state */}
          {status?.meteorologicalContext && (
            <div className="text-left rounded-lg border border-stone-200 bg-stone-50 p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">
                Current Conditions at Puri — MODEL-DERIVED
              </div>
              <div className="text-[10px] text-amber-700 mb-2">
                {status.meteorologicalContext.label}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-stone-500">Wind</span>
                  <span className="font-mono">{status.meteorologicalContext.windSpeed10m.toFixed(0)} km/h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Precip</span>
                  <span className="font-mono">{status.meteorologicalContext.precipitation.toFixed(1)} mm</span>
                </div>
              </div>
            </div>
          )}

          {/* Data warning if demo fixture */}
          {status?.dataWarning && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2">
              {status.dataWarning}
            </div>
          )}

          {/* Source tier for demo mode */}
          {status?.demoEvent?.fixtureStatus && (
            <div className="flex justify-center">
              <SourceTierBadge tier={status.demoEvent.fixtureStatus as "DEMO_FIXTURE"} />
            </div>
          )}

          {/* Launch buttons */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/app/replay"
              onClick={() => { setMode("REPLAY"); resetReplay(); }}
              className="rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 px-6 py-4 text-left transition-colors"
            >
              <div className="text-sm font-semibold text-blue-700 mb-1">Fani 2019 Replay</div>
              <div className="text-[11px] text-blue-600 leading-relaxed">
                Reconstruct the T−24h pre-event state, run the impact engine, and evaluate predictions against historical evidence.
              </div>
            </Link>

            <Link
              href="/app/impact"
              onClick={() => setMode("IMPACT")}
              className="rounded-lg border border-stone-300 bg-stone-50 hover:bg-stone-100 px-6 py-4 text-left transition-colors"
            >
              <div className="text-sm font-semibold text-stone-700 mb-1">Demo Scenario</div>
              <div className="text-[11px] text-stone-500 leading-relaxed">
                Load the Bay of Bengal demonstration scenario to explore the impact engine and priority optimizer.
              </div>
              <div className="mt-2 text-[10px] text-amber-700 font-semibold">
                SIMULATED SCENARIO — DEMO ONLY
              </div>
            </Link>
          </div>

          {/* System status */}
          <div className="text-[10px] text-stone-400 space-y-1">
            <div>
              Live adapters: GDACS ({status?.liveAdapterStatus ?? "checking"}){status?.meteorologicalContext ? ", Open-Meteo/ECMWF ✓" : ", Open-Meteo/ECMWF (unavailable)"}
            </div>
            <div>Primary demo: Fani 2019 replay works offline</div>
          </div>
        </div>
      )}
    </div>
  );
}
