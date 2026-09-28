# data/fixtures/fani-demo/

**Status: DEMO FIXTURE — synthetic data for development.**

All files in this directory carry `dataStatus: "DEMO_FIXTURE"` and
`synthetic: true`. They must never be used to generate claimed "Fani accuracy"
evaluation metrics. The Zod schema enforces this at runtime.

## Purpose

Enables the engine and UI to operate without running the GEE preprocessing
pipeline. Parameters are derived from well-documented public sources about
Cyclone Fani 2019, but the spatial distributions and per-cell values are
approximations, not measurements.

## Fixture files

| File | Description | Phase |
|------|-------------|-------|
| `metadata.json` | DemoFixtureMetadata — version, provenance, warning | Phase 2 |
| `hazard_scenario.json` | HazardScenario at T−24h (2019-05-02T05:00:00Z) | Phase 2 |
| `cells.geojson` | H3 res-8 cells with hazard/exposure/susceptibility | Phase 2 |
| `infrastructure.geojson` | Critical infrastructure for Puri/Khurda/Ganjam | Phase 2 |
| `impact_cells.json` | Pre-computed ImpactCell[] | Phase 2 |
| `priorities.json` | Pre-computed PriorityRecommendation[] (K=10) | Phase 2 |

## Parameter basis (published sources)

- IMD RSMC post-event report: https://rsmcnewdelhi.imd.gov.in/
- Landfall location: near Puri (~19.80°N, 85.83°E), ~0500 UTC 3 May 2019
- Peak wind: ~250 km/h; at T−24h: ~220 km/h
- Minimum pressure: ~932 hPa
- Documented surge: ~3.5m
- Affected districts: Puri, Khurda, Ganjam, Jagatsinghpur, Kendrapara

## Replacing with real data

When GEE pipeline outputs are available:
1. Replace `cells.geojson` with GEE-derived H3 aggregated data
2. Replace `infrastructure.geojson` with OSM January 2019 extract
3. Update `metadata.json` to `dataStatus: "REAL_DATA"` and `synthetic: false`
4. Re-run evaluation — metrics will now be computed

The engine contract (TypeScript types + Zod schemas) does not change.
