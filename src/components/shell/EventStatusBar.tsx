"use client";

/**
 * Persistent top bar showing event status, source, freshness.
 *
 * Phase 1: static placeholder.
 * Phase 6+: wired to /api/events endpoint for live data.
 */
export function EventStatusBar() {
  return (
    <div
      className="flex items-center justify-between border-b border-[#2e3450] bg-[#12151f] px-4 py-2 text-xs"
      role="banner"
    >
      {/* Left: product identity */}
      <div className="flex items-center gap-3">
        <span className="font-bold text-slate-200 tracking-tight">
          Cyclone Impact Intelligence
        </span>
        <span className="text-[10px] text-slate-600 uppercase tracking-widest">
          Decision Support
        </span>
      </div>

      {/* Right: event status + source provenance */}
      <div className="flex items-center gap-4 text-slate-500">
        <span>No active event</span>
        <span className="text-slate-700">|</span>
        <span className="text-[10px] uppercase tracking-widest">
          Not an official warning system
        </span>
      </div>
    </div>
  );
}
