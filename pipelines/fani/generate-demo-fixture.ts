#!/usr/bin/env tsx
/**
 * Fani 2019 Demo Fixture Generator
 *
 * USAGE:
 *   pnpm generate:fixture
 *
 * OUTPUT:
 *   data/fixtures/fani-demo/cells.geojson
 *   (metadata.json, hazard_scenario.json, infrastructure.json are pre-written)
 *
 * DESIGN RULES:
 *  1. Every value is a deterministic pure function of the cell's (lat, lng).
 *     No Math.random(). No external API calls. No timestamp-seeded values.
 *     The same input always produces the same output.
 *
 *  2. All synthetic values are PARAMETER-DERIVED APPROXIMATIONS — not measured data.
 *     They represent plausible spatial patterns based on documented Fani parameters,
 *     not satellite observations, WorldPop, or GEE-derived measurements.
 *
 *  3. Every output file must carry dataStatus: "DEMO_FIXTURE" and synthetic: true.
 *     The evaluation engine checks this field and refuses to compute claimed accuracy
 *     metrics from synthetic data.
 *
 *  4. This script is the AUDIT TRAIL for the committed static fixture.
 *     Run it to reproduce cells.geojson byte-for-byte (modulo generation timestamp,
 *     which is fixed to GENERATION_TIMESTAMP, not new Date()).
 *
 *  5. IMPORTANT: This fixture does NOT reproduce actual Fani impact conditions.
 *     It demonstrates the engine's spatial reasoning pipeline only.
 *
 * CELL COUNT NOTE:
 *   The natural H3 res-8 cell count for a meaningful Fani impact zone is ~8,000–13,000
 *   cells, not the 300–500 originally estimated. The difference is because H3 res-8 cells
 *   are ~0.74 km² — any geographically meaningful coastal zone spans many thousands.
 *   The full natural count is committed; the engine and UI handle it at scale.
 *
 * SELF-CONTAINED:
 *   This script does NOT import from src/ to avoid module resolution issues.
 *   Constants are duplicated here with comments pointing to their canonical source.
 *   If you change weights in src/config/index.ts, update the matching constants below.
 */

import * as h3 from "h3-js";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─────────────────────────────────────────────────────────────
// PATH SETUP
// ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const OUTPUT_DIR = join(REPO_ROOT, "data", "fixtures", "fani-demo");

// ─────────────────────────────────────────────────────────────
// CONSTANTS (must match src/config/index.ts)
// ─────────────────────────────────────────────────────────────

/** H3 spatial resolution — must match SPATIAL_RESOLUTION in config */
const SPATIAL_RESOLUTION = 8;

const FIXTURE_VERSION = "0.1.0";

/**
 * Fixed timestamp for reproducibility.
 * Using a fixed value means rerunning the script produces identical output
 * (except file system timestamps, which are outside our control).
 */
const GENERATION_TIMESTAMP = "2026-09-28T00:00:00Z";

// Fani T-24h parameters (from IMD RSMC archive)
const FANI_MAX_WIND_KPH_T24H = 220;
const FANI_SURGE_SCENARIO_M = 1.5; // scenario assumption — not an official T-24h surge forecast
const SURGE_PROXIMITY_THRESHOLD_KM = 25; // configurable screening approximation

// Normalization bounds — must match NORMALIZATION_BOUNDS in src/config/index.ts
const NORM = {
  windKph: { min: 0, max: 250 },
  rainfall24hMm: { min: 0, max: 300 },
  surgeM: { min: 0, max: 5.0 },
  population: { min: 0, max: 50_000 },
  buildings: { min: 0, max: 5_000 },
  roadKm: { min: 0, max: 20 },
} as const;

// Hazard weights — must match HAZARD_WEIGHTS in src/config/index.ts
const HAZARD_W = { wind: 0.40, rainfall: 0.30, surge: 0.30 } as const;

// Exposure weights — must match EXPOSURE_WEIGHTS in src/config/index.ts
const EXPOSURE_W = {
  population: 0.35,
  buildings: 0.25,
  roads: 0.15,
  criticalInfrastructure: 0.25,
} as const;

// ─────────────────────────────────────────────────────────────
// AOI — PURI/KHURDA/GANJAM COASTAL CORRIDOR
//
// Covers the primary Fani impact zone.
// h3-js v4 uses [lat, lng] order (NOT GeoJSON's [lng, lat]).
// ─────────────────────────────────────────────────────────────

const AOI_OUTER_RING: [number, number][] = [
  [19.2, 84.8], // SW — Southern Ganjam coast
  [19.2, 86.8], // SE — Bay of Bengal eastern boundary
  [20.7, 86.8], // NE — Jagatsinghpur / Kendrapara
  [20.7, 84.8], // NW — Inland Khurda / Nayagarh
  [19.2, 84.8], // Close ring
];

// ─────────────────────────────────────────────────────────────
// GEOGRAPHIC REFERENCE DATA
// All coordinates [lat, lng].
// ─────────────────────────────────────────────────────────────

/**
 * Approximate Odisha coastline segments.
 * Used to compute coastal proximity for each cell.
 * Points derived from known coastal features (Gopalpur → Dhamra).
 */
const COAST_LINE: [number, number][] = [
  [18.7, 84.5],  // S of Gopalpur
  [19.0, 84.8],  // Near Gopalpur
  [19.2, 85.1],  // Southern Ganjam coast
  [19.5, 85.45], // Puri south coast
  [19.6, 85.55],
  [19.75, 85.77], // Near Puri
  [19.80, 85.83], // Puri beach (landfall vicinity)
  [19.92, 85.96],
  [20.05, 86.08], // Satapada/Chilika mouth
  [20.18, 86.21],
  [20.32, 86.38], // Near Paradip
  [20.48, 86.57],
  [20.65, 86.72], // Dhamra
  [20.80, 86.85],
];

/**
 * Fani pre-event track from Bay of Bengal to Odisha landfall.
 * Approximate positions based on IMD RSMC post-event report.
 * T-24h position: ~16.0°N, 87.0°E.
 * Landfall: ~19.8°N, 85.83°E at ~0500 UTC 3 May 2019.
 */
const FANI_TRACK: [number, number][] = [
  [12.0, 88.5],  // T-72h (pre-intensification)
  [13.5, 88.1],  // T-60h
  [14.5, 87.6],  // T-48h
  [16.0, 87.0],  // T-24h (PREDICTION CUTOFF — no data after this in prediction)
  [17.5, 86.5],  // T-18h
  [18.5, 86.2],  // T-12h
  [19.2, 86.0],  // T-6h
  [19.8, 85.83], // Landfall
];

/**
 * Major settlements for synthetic population distribution.
 * Population values are approximate 2019 figures from public census data.
 * sigma = Gaussian spread radius (km).
 */
const SETTLEMENTS: Array<{
  lat: number;
  lng: number;
  pop: number;
  sigma: number;
  name: string;
}> = [
  { lat: 19.80, lng: 85.83, pop: 225_000, sigma: 8,  name: "Puri" },
  { lat: 20.27, lng: 85.82, pop: 450_000, sigma: 15, name: "Bhubaneswar" },
  { lat: 20.35, lng: 86.17, pop: 40_000,  sigma: 6,  name: "Jagatsinghpur" },
  { lat: 19.98, lng: 85.97, pop: 22_000,  sigma: 4,  name: "Nimapara" },
  { lat: 19.89, lng: 86.12, pop: 18_000,  sigma: 3,  name: "Konark" },
  { lat: 20.15, lng: 85.92, pop: 28_000,  sigma: 5,  name: "Pipli" },
  { lat: 19.60, lng: 85.52, pop: 10_000,  sigma: 3,  name: "Brahmagiri" },
  { lat: 19.50, lng: 85.30, pop: 15_000,  sigma: 3,  name: "Chhatrapur area" },
  { lat: 20.02, lng: 86.30, pop: 12_000,  sigma: 3,  name: "Ersama" },
  { lat: 19.73, lng: 85.47, pop: 8_000,   sigma: 2,  name: "Satapada area" },
  { lat: 20.48, lng: 85.91, pop: 20_000,  sigma: 4,  name: "Khurda town" },
  { lat: 20.25, lng: 86.35, pop: 18_000,  sigma: 4,  name: "Paradip" },
];

/**
 * NH-16 (coastal highway) approximate alignment.
 * Major road running parallel to the coast through the impact zone.
 */
const NH16: [number, number][] = [
  [19.35, 85.02],
  [19.55, 85.28],
  [19.70, 85.55],
  [19.85, 85.75],
  [19.97, 85.88],
  [20.12, 86.00],
  [20.28, 86.15],
  [20.45, 86.32],
];

// ─────────────────────────────────────────────────────────────
// GEOMETRY UTILITIES
// ─────────────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Minimum distance from a point to a polyline segment, in km.
 * Uses linear interpolation (good approximation for short distances).
 */
function distToSegmentKm(
  lat: number,
  lng: number,
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const d1 = haversineKm(lat, lng, lat1, lng1);
  const d2 = haversineKm(lat, lng, lat2, lng2);
  const d12 = haversineKm(lat1, lng1, lat2, lng2);

  if (d12 < 0.01) return d1;

  // Project using law of cosines (approximate for small areas)
  const t = Math.max(0, Math.min(1, (d1 ** 2 + d12 ** 2 - d2 ** 2) / (2 * d1 * d12)));
  const iLat = lat1 + t * (lat2 - lat1);
  const iLng = lng1 + t * (lng2 - lng1);
  return haversineKm(lat, lng, iLat, iLng);
}

function distToPolylineKm(
  lat: number,
  lng: number,
  line: [number, number][]
): number {
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distToSegmentKm(
      lat, lng,
      line[i][0], line[i][1],
      line[i + 1][0], line[i + 1][1]
    );
    if (d < min) min = d;
  }
  return min;
}

function clampNorm(value: number, min: number, max: number): number {
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function r4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// LAND / OCEAN CLASSIFICATION
//
// Approximate: a cell is "land" if its center is west of the
// Odisha coastline (with a small seaward buffer for coastal cells).
// This is a rough geometric heuristic, not a land cover dataset.
// ─────────────────────────────────────────────────────────────

/**
 * Piecewise linear interpolation along all COAST_LINE waypoints.
 *
 * LABEL: DEMO_HEURISTIC_PIECEWISE — not a validated land-cover dataset.
 * The correct fix is JRC GSW v1.4 aggregated to H3 res-8 (see docs/05).
 */
function approxCoastLngAtLat(lat: number): number {
  const pts = COAST_LINE;
  const last = pts.length - 1;
  if (lat <= pts[0][0]) {
    const [lat0, lng0] = pts[0];
    const [lat1, lng1] = pts[1];
    return lng0 + ((lat - lat0) / (lat1 - lat0)) * (lng1 - lng0);
  }
  if (lat >= pts[last][0]) {
    const [lat0, lng0] = pts[last - 1];
    const [lat1, lng1] = pts[last];
    return lng0 + ((lat - lat0) / (lat1 - lat0)) * (lng1 - lng0);
  }
  for (let i = 0; i < last; i++) {
    const [lat0, lng0] = pts[i];
    const [lat1, lng1] = pts[i + 1];
    if (lat >= lat0 && lat < lat1) {
      return lng0 + ((lat - lat0) / (lat1 - lat0)) * (lng1 - lng0);
    }
  }
  return pts[last][1];
}

function isLikelyLand(lat: number, lng: number): boolean {
  // ~9km seaward buffer (≈ 0.08° at these latitudes) to include coastal land cells
  return lng < approxCoastLngAtLat(lat) + 0.08;
}

// ─────────────────────────────────────────────────────────────
// SYNTHETIC VALUE FUNCTIONS
// All functions are pure: same (lat, lng) → same result always.
// ─────────────────────────────────────────────────────────────

function coastalProximityKm(lat: number, lng: number): number {
  return distToPolylineKm(lat, lng, COAST_LINE);
}

function trackDistanceKm(lat: number, lng: number): number {
  return distToPolylineKm(lat, lng, FANI_TRACK);
}

/**
 * Synthetic elevation (m) based on distance from coast.
 * Models the typical flat coastal plain of Odisha:
 * 0–3m within a few km of coast, rising to ~30m at 50km inland.
 *
 * Terrain variation: deterministic ±2m based on lat/lng.
 * Uses integer arithmetic to ensure bit-for-bit reproducibility.
 */
function syntheticElevationM(coastDistKm: number, lat: number, lng: number): number {
  if (!isLikelyLand(lat, lng)) return -10; // ocean sentinel

  let base: number;
  if (coastDistKm <= 2) base = coastDistKm * 0.6;
  else if (coastDistKm <= 8) base = 1.2 + (coastDistKm - 2) * 0.5;
  else if (coastDistKm <= 20) base = 4.2 + (coastDistKm - 8) * 0.8;
  else if (coastDistKm <= 50) base = 13.8 + (coastDistKm - 20) * 0.6;
  else base = 31.8 + (coastDistKm - 50) * 0.4;

  // Deterministic ±2m variation — integer hash, no floating-point entropy
  const hash = ((Math.round(lat * 100) * 31 + Math.round(lng * 100) * 17) % 20);
  const variation = (hash / 10 - 1.0) * 2; // maps [0,20) → [-2, +2)

  return Math.max(0.0, r2(base + variation));
}

/**
 * Synthetic wind severity [0,1].
 * Exponential decay from the Fani track.
 * At T-24h center (~16°N, 87°E): max wind ~220 km/h.
 * RMW ~40 km; decay scale ~130 km.
 */
function syntheticWindNormalized(trackDistKm: number): number {
  const RMW = 40;
  const DECAY_SCALE = 130;
  const effectiveDist = Math.max(0, trackDistKm - RMW);
  const windKph = FANI_MAX_WIND_KPH_T24H * Math.exp(-effectiveDist / DECAY_SCALE);
  return r4(clampNorm(windKph, NORM.windKph.min, NORM.windKph.max));
}

/**
 * Synthetic rainfall severity [0,1].
 * Wider spatial extent than wind + coastal orographic enhancement.
 */
function syntheticRainfallNormalized(
  trackDistKm: number,
  coastDistKm: number
): number {
  const MAX_RAIN = 200;
  const TRACK_SCALE = 220;
  const COAST_SCALE = 60;
  const COAST_BOOST = 0.30;

  const trackFactor = Math.exp(-trackDistKm / TRACK_SCALE);
  const coastFactor = Math.exp(-coastDistKm / COAST_SCALE) * COAST_BOOST;
  const rawMm = MAX_RAIN * Math.min(1.3, trackFactor + coastFactor);

  return r4(clampNorm(rawMm, NORM.rainfall24hMm.min, NORM.rainfall24hMm.max));
}

/**
 * Synthetic surge severity [0,1].
 * Decreases exponentially with distance from coast.
 * Zero if cell is above surge height or too far inland.
 */
function syntheticSurgeNormalized(
  coastDistKm: number,
  elevationM: number,
  surgeHeightM: number
): number {
  if (elevationM < 0 || elevationM > surgeHeightM + 0.5 || coastDistKm > 35) {
    return 0;
  }
  const surgeAtLocation = surgeHeightM * Math.exp(-coastDistKm / 12);
  return r4(clampNorm(surgeAtLocation, NORM.surgeM.min, NORM.surgeM.max));
}

function combineHazard(wind: number, rainfall: number, surge: number): number {
  return r4(HAZARD_W.wind * wind + HAZARD_W.rainfall * rainfall + HAZARD_W.surge * surge);
}

/**
 * Synthetic population count.
 * Sum of Gaussians centred on known settlements.
 * Returns 0 for ocean cells.
 */
function syntheticPopulation(lat: number, lng: number, isLand: boolean): number {
  if (!isLand) return 0;
  const total = SETTLEMENTS.reduce((sum, s) => {
    const dist = haversineKm(lat, lng, s.lat, s.lng);
    return sum + s.pop * Math.exp(-(dist * dist) / (2 * s.sigma ** 2));
  }, 0);
  return Math.max(0, Math.round(total));
}

function syntheticBuildings(population: number): number {
  return Math.max(0, Math.round(population / 4.2));
}

function syntheticBuiltAreaHa(buildings: number): number {
  return r2(buildings * 0.015); // ~150 m² per structure
}

/**
 * Synthetic road km for cell.
 * Background rural density + highway bonus if within 5 km of NH-16.
 */
function syntheticRoadKm(lat: number, lng: number, isLand: boolean): number {
  if (!isLand) return 0;
  const nh16Dist = distToPolylineKm(lat, lng, NH16);
  const highwayBonus = nh16Dist < 0.5 ? 5 : nh16Dist < 2 ? 3 : nh16Dist < 5 ? 1.5 : 0;
  return r2(0.8 + highwayBonus);
}

function combineExposure(
  popN: number,
  bldN: number,
  roadN: number,
  critN: number
): number {
  return r4(
    EXPOSURE_W.population * popN +
    EXPOSURE_W.buildings * bldN +
    EXPOSURE_W.roads * roadN +
    EXPOSURE_W.criticalInfrastructure * critN
  );
}

/**
 * Flood susceptibility [0,1].
 * Derived from elevation — lower elevation → higher susceptibility.
 * NOTE: susceptibility ≠ vulnerability. See docs/LIMITATIONS.md.
 */
function floodSusceptibility(elevationM: number): number {
  if (elevationM <= 0) return 1.0;
  return r4(Math.max(0, 1 - Math.min(1, elevationM / 22)));
}

/**
 * Wind exposure [0,1].
 * Decreases with distance from coast (inland terrain reduces exposure).
 */
function windExposure(coastDistKm: number): number {
  return r4(Math.max(0, 1 - Math.min(1, coastDistKm / 80)));
}

function isSurgeExposed(
  elevationM: number,
  coastDistKm: number,
  surgeHeightM: number,
  thresholdKm: number
): boolean {
  return elevationM >= 0 && elevationM <= surgeHeightM && coastDistKm <= thresholdKm;
}

// ─────────────────────────────────────────────────────────────
// CELL GENERATION
// ─────────────────────────────────────────────────────────────

type CellFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
  properties: {
    cellId: string;
    isLand: boolean;
    hazard: {
      wind: number;
      rainfall: number;
      surge: number;
      combined: number;
    };
    exposure: {
      population: number;
      buildings: number;
      builtAreaHa: number;
      roadKm: number;
      criticalAssetCount: number;
      combined: number;
    };
    susceptibility: {
      floodSusceptibility: number;
      windExposure: number;
      coastalProximityKm: number;
      elevationMedianM: number;
      surgeExposed: boolean;
    };
  };
};

function generateAllCells(): CellFeature[] {
  console.log("Generating H3 cells for Puri/Khurda coastal corridor...");
  console.log(`Resolution: ${SPATIAL_RESOLUTION}`);
  console.log(
    `AOI: lat [${Math.min(...AOI_OUTER_RING.map((p) => p[0]))}, ` +
    `${Math.max(...AOI_OUTER_RING.map((p) => p[0]))}], ` +
    `lng [${Math.min(...AOI_OUTER_RING.map((p) => p[1]))}, ` +
    `${Math.max(...AOI_OUTER_RING.map((p) => p[1]))}]`
  );

  // h3-js v4: polygonToCells expects CoordPair[][] (array of rings)
  // First ring = outer boundary, additional rings = holes
  const cellIds = h3.polygonToCells([AOI_OUTER_RING], SPATIAL_RESOLUTION);
  console.log(`Total cells in AOI polygon: ${cellIds.length}`);

  const features: CellFeature[] = [];
  let landCount = 0;
  let oceanCount = 0;
  let surgeExposedCount = 0;

  for (const cellId of cellIds) {
    const [lat, lng] = h3.cellToLatLng(cellId);

    // h3-js cellToBoundary returns [lat, lng] pairs
    // GeoJSON requires [lng, lat] — convert here
    const boundary = h3.cellToBoundary(cellId);
    const geoCoords: [number, number][] = boundary.map(([clat, clng]) => [
      Math.round(clng * 100000) / 100000, // [lng, lat] for GeoJSON, 5dp ≈ 1.1m
      Math.round(clat * 100000) / 100000,
    ]);
    geoCoords.push(geoCoords[0]!); // close the polygon ring

    // Compute derived geometry values
    const coastDist = coastalProximityKm(lat, lng);
    const trackDist = trackDistanceKm(lat, lng);
    const elevM = syntheticElevationM(coastDist, lat, lng);
    const isLand = elevM >= -1; // include very-near-coast cells

    if (isLand) landCount++;
    else oceanCount++;

    // Synthetic hazard
    const windN = syntheticWindNormalized(trackDist);
    const rainN = syntheticRainfallNormalized(trackDist, coastDist);
    const surgeN = syntheticSurgeNormalized(coastDist, elevM, FANI_SURGE_SCENARIO_M);
    const hazardCombined = combineHazard(windN, rainN, surgeN);

    // Synthetic exposure
    const pop = syntheticPopulation(lat, lng, isLand);
    const bld = syntheticBuildings(pop);
    const builtHa = syntheticBuiltAreaHa(bld);
    const roadKm = syntheticRoadKm(lat, lng, isLand);

    const popN = clampNorm(pop, NORM.population.min, NORM.population.max);
    const bldN = clampNorm(bld, NORM.buildings.min, NORM.buildings.max);
    const roadN = clampNorm(roadKm, NORM.roadKm.min, NORM.roadKm.max);
    // critN populated by infrastructure engine (Phase 3); 0 here
    const exposureCombined = combineExposure(popN, bldN, roadN, 0);

    // Susceptibility
    const floodSusc = floodSusceptibility(elevM);
    const windExp = windExposure(coastDist);
    const surgeExp = isSurgeExposed(
      elevM, coastDist, FANI_SURGE_SCENARIO_M, SURGE_PROXIMITY_THRESHOLD_KM
    );
    if (surgeExp) surgeExposedCount++;

    features.push({
      type: "Feature",
      id: cellId,
      geometry: {
        type: "Polygon",
        coordinates: [geoCoords],
      },
      properties: {
        cellId,
        isLand,
        hazard: {
          wind: windN,
          rainfall: rainN,
          surge: surgeN,
          combined: hazardCombined,
        },
        exposure: {
          population: pop,
          buildings: bld,
          builtAreaHa: builtHa,
          roadKm,
          criticalAssetCount: 0,
          combined: exposureCombined,
        },
        susceptibility: {
          floodSusceptibility: floodSusc,
          windExposure: windExp,
          coastalProximityKm: r2(coastDist),
          elevationMedianM: r2(elevM),
          surgeExposed: surgeExp,
        },
      },
    });
  }

  console.log(`  Land cells:         ${landCount}`);
  console.log(`  Ocean cells:        ${oceanCount}`);
  console.log(`  Surge-exposed:      ${surgeExposedCount}`);

  return features;
}

// ─────────────────────────────────────────────────────────────
// WRITE OUTPUT
// ─────────────────────────────────────────────────────────────

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("\n=== Fani Demo Fixture Generator ===");
  console.log("DEMO_FIXTURE — synthetic data only, not historical ground truth\n");

  const features = generateAllCells();
  const landFeatures = features.filter((f) => f.properties.isLand);

  const geojson = {
    type: "FeatureCollection",
    name: "fani-demo-cells",
    metadata: {
      dataStatus: "DEMO_FIXTURE",
      synthetic: true,
      evaluationWarning:
        "SYNTHETIC — DO NOT use to generate claimed historical accuracy metrics",
      historicalEventReference: "Cyclone Fani 2019",
      description:
        "Deterministically generated H3 res-8 cells for the Puri/Khurda/Ganjam " +
        "coastal corridor. Values are synthetic approximations based on documented " +
        "Fani parameters — not satellite or GEE-derived measurements.",
      generationScript: "pipelines/fani/generate-demo-fixture.ts",
      generationTimestamp: GENERATION_TIMESTAMP,
      spatialResolution: SPATIAL_RESOLUTION,
      version: FIXTURE_VERSION,
      totalCellCount: features.length,
      landCellCount: landFeatures.length,
      aoi: "Puri/Khurda/Ganjam coastal corridor, Odisha, India",
      predictionCutoff: "2019-05-02T05:00:00Z",
      surgeModelMethod: "proximity_threshold",
      surgeScenarioM: FANI_SURGE_SCENARIO_M,
      surgeThresholdKm: SURGE_PROXIMITY_THRESHOLD_KM,
      parameterBasis: [
        "IMD RSMC Post-Cyclone Report — Very Severe Cyclonic Storm FANI (2019)",
        "https://rsmcnewdelhi.imd.gov.in",
        "Approximate 2019 population from Census of India",
        "OpenStreetMap road network (approximate NH-16 alignment)",
        "NASADEM elevation model (synthetic approximation)",
      ],
    },
    features,
  };

  const outputPath = join(OUTPUT_DIR, "cells.geojson");
  // Compact JSON for smaller file size — not pretty-printed
  writeFileSync(outputPath, JSON.stringify(geojson), "utf-8");

  const rawBytes = Buffer.byteLength(JSON.stringify(geojson), "utf-8");
  const rawMB = (rawBytes / 1_048_576).toFixed(2);

  console.log(`\n✓ Written: ${outputPath}`);
  console.log(`  Raw size:     ${rawMB} MB`);
  console.log(`  Total cells:  ${features.length}`);
  console.log(`  Land cells:   ${landFeatures.length}`);
  console.log(`\n⚠  CELL COUNT NOTE:`);
  console.log(
    `  The original estimate was 300–500 cells. The natural H3 res-8 count for a`
  );
  console.log(
    `  geographically meaningful coastal zone is ${features.length} cells (land: ${landFeatures.length}).`
  );
  console.log(
    `  This is correct — res-8 cells are ~0.74 km² each; any real impact zone spans thousands.`
  );
  console.log(`\n⚠  This file is DEMO_FIXTURE synthetic data.`);
  console.log(
    `  Replace with real GEE pipeline outputs (see pipelines/gee/) for submission.`
  );
}

main();
