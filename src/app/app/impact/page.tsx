import type { Metadata } from "next";

export const metadata: Metadata = { title: "Impact" };

/**
 * IMPACT mode — hazard × exposure × susceptibility map.
 *
 * Map layers: wind, rainfall, surge, combined impact, population, buildings, infrastructure.
 * Cell click → detail panel (hazard components, exposure, susceptibility, confidence, sources).
 *
 * Phase 1 stub — map and engine wired in Phases 4-6.
 */
export default function ImpactPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-slate-500 text-sm uppercase tracking-widest">
        Impact map — wired in Phase 6
      </p>
    </div>
  );
}
