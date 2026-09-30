"use client";

/**
 * AppHeader — single compact command bar replacing three stacked shell bands.
 *
 * Height: 48px total (border-b included).
 * Layout:
 *   LEFT   — product identity
 *   CENTER — mode navigation (LIVE / IMPACT / ACTION / REPLAY)
 *   RIGHT  — event badge (FANI 2019 · T−24H) + DATA status expand + disclaimer
 *
 * Replaces: EventStatusBar + DataProfilePanel + AppNav
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatGeeStatus, statusColorClass } from "@/lib/status";

const MODES = [
  { href: "/app/live",   label: "LIVE",   title: "Active event monitoring" },
  { href: "/app/impact", label: "IMPACT", title: "Hazard × exposure map" },
  { href: "/app/action", label: "ACTION", title: "Priority recommendations" },
  { href: "/app/replay", label: "REPLAY", title: "Fani 2019 historical replay" },
] as const;

// ── Types (subset of ProfileData used here) ──────────────────
type GEEFile = { available: boolean; role: string };
type ProfileSummary = {
  hasRealPopulation: boolean;
  hasRealElevation: boolean;
  hasFloodObservation: boolean;
  hasRainfallObservation: boolean;
  overallStatus: string;
  coveragePercent?: number;
};
type ProfileData = {
  geeFiles: Record<string, GEEFile>;
  summary: ProfileSummary;
  geeCoverage?: { overallCoverageNote?: string };
};

// ─────────────────────────────────────────────────────────────

export function AppHeader() {
  const pathname = usePathname();
  const [profile, setProfile]   = useState<ProfileData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const dropdownRef             = useRef<HTMLDivElement>(null);

  // Fetch platform profile once on mount
  useEffect(() => {
    fetch("/api/platform/profile")
      .then((r) => r.json())
      .then((j: { ok: boolean; data?: ProfileData }) => {
        if (j.ok && j.data) setProfile(j.data);
      })
      .catch(() => null);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!expanded) return;
    function onOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [expanded]);

  const statusRaw   = profile?.summary?.overallStatus;
  const statusLabel = formatGeeStatus(statusRaw);
  const statusColor = statusColorClass(statusRaw);
  const coverPct    = profile?.summary?.coveragePercent;

  return (
    <header
      className="relative flex h-[48px] flex-shrink-0 items-center border-b border-[#d9d3ca] bg-[#f2efe9]"
      role="banner"
    >
      {/* ── LEFT: product identity ─────────────────────────── */}
      <div className="flex items-baseline gap-2 px-4 min-w-0 flex-shrink-0">
        <span className="font-bold text-[13px] text-stone-900 tracking-tight whitespace-nowrap">
          Cyclone Impact Intelligence
        </span>
        <span className="hidden md:block text-[9px] text-stone-400 uppercase tracking-widest">
          Decision Support
        </span>
      </div>

      {/* ── CENTER: mode navigation ────────────────────────── */}
      <nav
        className="flex flex-1 items-center justify-center"
        role="navigation"
        aria-label="Application mode navigation"
      >
        {MODES.map((mode) => {
          const isActive = pathname.startsWith(mode.href);
          return (
            <Link
              key={mode.href}
              href={mode.href}
              title={mode.title}
              aria-current={isActive ? "page" : undefined}
              className={[
                "flex h-[48px] items-center px-4 text-[11px] font-semibold tracking-widest",
                "transition-colors",
                isActive
                  ? "text-stone-900 border-b-2 border-blue-600"
                  : "text-stone-400 hover:text-stone-700",
              ].join(" ")}
            >
              {mode.label}
            </Link>
          );
        })}
      </nav>

      {/* ── RIGHT: event + data status ─────────────────────── */}
      <div
        ref={dropdownRef}
        className="flex items-center gap-2 px-4 text-[11px] flex-shrink-0"
      >
        {/* Event identifier */}
        <span className="font-mono font-semibold text-stone-700">FANI 2019</span>
        <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-widest
                         bg-amber-50 border border-amber-300 text-amber-700">
          T−24H
        </span>

        {/* Data profile button — expands dropdown */}
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          title="Data profile — sources and coverage"
          className={[
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold",
            "tracking-wider border transition-colors",
            expanded
              ? "border-stone-300 bg-stone-200 text-stone-700"
              : "border-transparent bg-transparent hover:bg-stone-100",
            statusColor,
          ].join(" ")}
        >
          <span>DATA ·</span>
          <span>{statusLabel}</span>
          {coverPct != null && coverPct > 0 && coverPct < 95 && (
            <span className="ml-0.5 font-normal opacity-70">~{coverPct}%</span>
          )}
          <span className="ml-0.5 text-stone-400">{expanded ? "▲" : "▾"}</span>
        </button>

        {/* Disclaimer affordance — small ? button, not a band */}
        <button
          title="Not an official warning system — research / decision-support prototype only"
          aria-label="Disclaimer"
          className="flex h-4 w-4 items-center justify-center rounded-full border border-stone-300
                     text-[9px] text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-600
                     leading-none flex-shrink-0"
        >
          ?
        </button>

        {/* ── Data profile dropdown ──────────────────────── */}
        {expanded && profile && (
          <div className="absolute right-0 top-[47px] z-50 w-72 rounded-b border border-[#d9d3ca]
                          bg-[#f2efe9] p-3 shadow-lg text-[11px]">
            {/* Source availability dots */}
            <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {[
                { label: "Population",   ok: profile.summary.hasRealPopulation,    desc: "WorldPop 2019" },
                { label: "Elevation",    ok: profile.summary.hasRealElevation,     desc: "NASADEM" },
                { label: "Flood obs.",   ok: profile.summary.hasFloodObservation,  desc: "Sentinel-1" },
                { label: "Rainfall",     ok: profile.summary.hasRainfallObservation, desc: "GPM IMERG" },
              ].map(({ label, ok, desc }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full
                    ${ok ? "bg-green-500" : "bg-stone-300"}`} />
                  <span className={ok ? "text-stone-700" : "text-stone-400"}>
                    {label}
                  </span>
                  <span className="text-[9px] text-stone-400">{desc}</span>
                </div>
              ))}
            </div>

            {/* GEE file details */}
            {Object.keys(profile.geeFiles ?? {}).length > 0 && (
              <div className="space-y-0.5 border-t border-[#d9d3ca] pt-2">
                {Object.entries(profile.geeFiles).map(([key, f]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full
                      ${f.available ? "bg-green-500" : "bg-stone-300"}`} />
                    <span className={f.available ? "text-stone-600" : "text-stone-400"}>
                      {f.role}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {profile.geeCoverage?.overallCoverageNote && (
              <p className="mt-2 text-[9px] italic leading-relaxed text-stone-400">
                {profile.geeCoverage.overallCoverageNote}
              </p>
            )}

            <p className="mt-1 text-[9px] leading-relaxed text-stone-400">
              Unavailable sources fall back to deterministic DEMO_FIXTURE.
              Not an official warning system.
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
