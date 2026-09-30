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
      className="flex items-center justify-between border-b border-[#d9d3ca] bg-[#f2efe9] px-4 py-2 text-xs"
      role="banner"
    >
      {/* Left: product identity */}
      <div className="flex items-center gap-3">
        <span className="font-bold text-stone-900 tracking-tight">
          Cyclone Impact Intelligence
        </span>
        <span className="text-[10px] text-stone-400 uppercase tracking-widest">
          Decision Support
        </span>
      </div>

      {/* Right: event status + source provenance */}
      <div className="flex items-center gap-4 text-stone-400">
        <span>No active event</span>
        <span className="text-stone-300">|</span>
        <span className="text-[10px] uppercase tracking-widest">
          Not an official warning system
        </span>
      </div>
    </div>
  );
}
