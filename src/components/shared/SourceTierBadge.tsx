"use client";

import type { SourceTier } from "@/lib/types/index";

const TIER_CONFIG: Record<SourceTier, { label: string; className: string }> = {
  OFFICIAL: { label: "OFFICIAL", className: "badge-official" },
  AUTHORITATIVE_OPEN: { label: "AUTHORITATIVE", className: "badge-authoritative" },
  MODEL_DERIVED: { label: "MODEL-DERIVED", className: "badge-model" },
  SCENARIO: { label: "SCENARIO", className: "badge-scenario" },
  DEMO_FIXTURE: { label: "DEMO FIXTURE", className: "badge-demo" },
};

export function SourceTierBadge({ tier }: { tier: SourceTier }) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.DEMO_FIXTURE;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

export function ScenarioWarning({ label }: { label?: string }) {
  return (
    <div className="scenario-warning">
      {label ?? "SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST"}
    </div>
  );
}

export function DemoFixtureWarning() {
  return (
    <div className="demo-fixture-warning">
      DEMO FIXTURE — synthetic data · not historical ground truth · do not cite as accuracy
    </div>
  );
}
