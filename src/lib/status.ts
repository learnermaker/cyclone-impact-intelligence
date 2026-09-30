/**
 * status.ts — Single source of truth for GEE / data-profile status vocabulary.
 *
 * All pages and components must import from here. No ad-hoc inline mappings.
 */

// ── Label shown in UI ────────────────────────────────────────
export const GEE_STATUS_LABELS: Record<string, string> = {
  GEE_ENRICHED:       "GEE ENRICHED",
  GEE_ENRICHED_MIXED: "GEE ENRICHED · MIXED",
  PARTIAL_GEE:        "PARTIAL GEE",
  DEMO_ONLY:          "DEMO FIXTURE",
};

// ── Compact label for inline badges ─────────────────────────
export const GEE_STATUS_SHORT: Record<string, string> = {
  GEE_ENRICHED:       "GEE",
  GEE_ENRICHED_MIXED: "GEE ·MIXED",
  PARTIAL_GEE:        "PARTIAL",
  DEMO_ONLY:          "DEMO",
};

// ── Tailwind color classes for the badge ─────────────────────
export const GEE_STATUS_COLOR: Record<string, string> = {
  GEE_ENRICHED:       "text-green-700",
  GEE_ENRICHED_MIXED: "text-amber-700",
  PARTIAL_GEE:        "text-amber-700",
  DEMO_ONLY:          "text-stone-500",
};

// ── Full label (DataProfilePanel expanded form) ──────────────
export const GEE_STATUS_FULL_LABELS: Record<string, string> = {
  GEE_ENRICHED:       "GEE ENRICHED",
  GEE_ENRICHED_MIXED: "GEE ENRICHED · MIXED COVERAGE",
  PARTIAL_GEE:        "PARTIAL GEE",
  DEMO_ONLY:          "DEMO FIXTURE",
};

// ── Border + background badge classes ────────────────────────
export const GEE_STATUS_BADGE: Record<string, string> = {
  GEE_ENRICHED:       "text-green-700 bg-green-50 border-green-300",
  GEE_ENRICHED_MIXED: "text-amber-700 bg-amber-50 border-amber-300",
  PARTIAL_GEE:        "text-amber-700 bg-amber-50 border-amber-300",
  DEMO_ONLY:          "text-stone-600 bg-stone-100 border-stone-300",
};

/** Return a human-readable status label for the given raw API string. */
export function formatGeeStatus(raw: string | undefined | null): string {
  if (!raw) return "DEMO FIXTURE";
  return GEE_STATUS_LABELS[raw] ?? "DEMO FIXTURE";
}

/** Return a compact status string for inline header badges. */
export function formatGeeStatusShort(raw: string | undefined | null): string {
  if (!raw) return "DEMO";
  return GEE_STATUS_SHORT[raw] ?? "DEMO";
}

/** Return Tailwind color class for the status text. */
export function statusColorClass(raw: string | undefined | null): string {
  if (!raw) return "text-stone-500";
  return GEE_STATUS_COLOR[raw] ?? "text-stone-500";
}
