import type { Metadata } from "next";

export const metadata: Metadata = { title: "Action" };

/**
 * ACTION mode — priority recommendations and advisory workflow.
 *
 * Controls: response capacity K, objective, scenario sliders.
 * Shows ranked recommendation cards with drivers and evidence.
 * "Why?" launches Gemini / deterministic explanation.
 * Advisory generation → approval → dispatch flow.
 * Insurance / parametric liquidity panel.
 *
 * Phase 1 stub — wired in Phases 7-8.
 */
export default function ActionPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-slate-500 text-sm uppercase tracking-widest">
        Action & Advisory — wired in Phase 7
      </p>
    </div>
  );
}
