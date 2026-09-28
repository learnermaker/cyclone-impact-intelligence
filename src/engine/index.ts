/**
 * Engine barrel — re-exports all engine modules.
 *
 * Pipeline:
 *   HazardScenario
 *     → hazard engine  → normalized hazard per H3 cell
 *     → exposure engine → population/building/road counts per cell
 *     → susceptibility  → flood susceptibility, wind exposure
 *     → impact engine   → impactExposure = hazard × exposure × susceptibility
 *     → infrastructure  → criticality + dependency per cell
 *     → priority engine → top-K prioritization
 *
 * All engine functions are pure and deterministic.
 * H3 operations are server-side only (h3-js is a serverExternalPackage).
 */

export * from "./hazard/index";
export * from "./exposure/index";
export * from "./impact/index";
export * from "./infrastructure/index";
export * from "./priority/index";
export * from "./scenarios/index";
