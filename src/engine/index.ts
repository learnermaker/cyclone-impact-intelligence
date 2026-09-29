/**
 * Engine barrel — re-exports all engine modules.
 *
 * Pipeline:
 *   HazardScenario
 *     → hazard engine  → normalized hazard + surge exposure (flood-fill preferred)
 *     → exposure engine → population/building/road counts per cell
 *     → susceptibility  → flood susceptibility, wind exposure (separate from vulnerability)
 *     → impact engine   → impactExposure = hazard × exposure × susceptibility
 *     → infrastructure  → criticality + dependency per cell (H3 spatial proxy)
 *     → priority engine → top-K prioritization (greedy + H3 overlap guard)
 *     → advisory engine → structured advisory generation
 *     → insurance engine → illustrative parametric trigger evaluation
 *     → evaluation engine → replay metrics (DEMO_FIXTURE firewall enforced)
 *
 * Runner: src/engine/runner.ts — main entry point that orchestrates the pipeline.
 *
 * All engine functions are pure and deterministic.
 * h3-js operations are server-side only (configured in next.config.ts).
 */

export * from "./hazard/index";
export * from "./exposure/index";
export * from "./susceptibility/index";
export * from "./impact/index";
export * from "./infrastructure/index";
export * from "./priority/index";
export * from "./scenarios/index";
export * from "./advisory/index";
export * from "./insurance/index";
// evaluation/index exports are not re-exported here to avoid accidental browser bundling
// Import directly from "./evaluation/index" where needed (server-side only)
