"use client";

import type { Metadata } from "next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/store/index";
import { SourceTierBadge } from "@/components/shared/SourceTierBadge";

type EventStatus = {
  hasActiveEvent: boolean;
  mode: string;
  activeEvent?: {
    eventId: string;
    displayLabel: string;
    tier: string;
    cyclone?: { name?: string; maxWindKph?: number; latitude?: number; longitude?: number };
    surge?: { heightM?: number };
    rainfall?: { forecast24hMm?: number };
    fixtureStatus?: string;
  };
  fixtureStatus?: string;
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

  // For now there is never a real active cyclone — demo shows honest empty state
  const hasRealCyclone = false; // Phase 9: wire live adapters

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      {loading ? (
        <div className="text-slate-500 text-sm animate-pulse">Checking live feeds…</div>
      ) : hasRealCyclone ? (
        <div className="text-slate-200">Active event — wired in Phase 9</div>
      ) : (
        <div className="text-center max-w-lg space-y-8">
          {/* Empty state */}
          <div>
            <div className="text-slate-500 text-xs uppercase tracking-widest mb-3">Live Mode</div>
            <h1 className="text-2xl font-bold text-slate-200 mb-2">No active cyclone event</h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              No live cyclone is currently active in the Bay of Bengal / Odisha corridor.
              The application will show live data when an event is detected via GDACS or IMD.
            </p>
          </div>

          {/* Data warning if demo fixture */}
          {status?.dataWarning && (
            <div className="text-[11px] text-amber-700 bg-amber-950/20 border border-amber-800/40 rounded px-3 py-2">
              {status.dataWarning}
            </div>
          )}

          {/* Source tier */}
          {status?.fixtureStatus && (
            <div className="flex justify-center">
              <SourceTierBadge tier={status.fixtureStatus as "DEMO_FIXTURE"} />
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/app/replay"
              onClick={() => { setMode("REPLAY"); resetReplay(); }}
              className="rounded-lg border border-blue-700/60 bg-blue-900/30 hover:bg-blue-800/40 px-6 py-4 text-left transition-colors"
            >
              <div className="text-sm font-semibold text-blue-300 mb-1">Fani 2019 Replay</div>
              <div className="text-[11px] text-blue-500 leading-relaxed">
                Reconstruct the T−24h pre-event state, run the impact engine, and evaluate predictions against historical evidence.
              </div>
            </Link>

            <Link
              href="/app/impact"
              onClick={() => setMode("IMPACT")}
              className="rounded-lg border border-slate-600/60 bg-slate-800/40 hover:bg-slate-700/40 px-6 py-4 text-left transition-colors"
            >
              <div className="text-sm font-semibold text-slate-300 mb-1">Demo Scenario</div>
              <div className="text-[11px] text-slate-500 leading-relaxed">
                Load the Bay of Bengal demonstration scenario to explore the impact engine and priority optimizer.
              </div>
              <div className="mt-2 text-[10px] text-amber-600 font-semibold">
                SIMULATED SCENARIO — DEMO ONLY
              </div>
            </Link>
          </div>

          {/* System status */}
          <div className="text-[10px] text-slate-600 space-y-1">
            <div>Live adapters: GDACS, Open-Meteo/ECMWF (Phase 9)</div>
            <div>Primary demo: Fani 2019 replay works offline</div>
          </div>
        </div>
      )}
    </div>
  );
}
