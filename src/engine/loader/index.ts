/**
 * Fixture Loader — server-side only
 *
 * Loads the Fani demo fixture from disk once and caches it in memory.
 * Never expose the full dataset to the client — always filter before returning.
 *
 * The fixture is ~24 MB uncompressed (43,009 H3 res-8 cells).
 * In a Cloud Run container this is a one-time startup cost, not per-request.
 *
 * GUARDRAIL: This module must only be imported from server-side code
 * (API routes, engine runner). Never import it from client components.
 *
 * Filtering contract:
 *   Every function that returns cells must accept at least one of:
 *     - bbox: [minLng, minLat, maxLng, maxLat]
 *     - cellIds: string[]
 *     - maxCount: number (safety cap — never return more than this)
 *   so that no single API call returns 43k cells to the browser.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ─────────────────────────────────────────────────────────────
// RAW FIXTURE TYPES
// ─────────────────────────────────────────────────────────────

export type FixtureCellProperties = {
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

export type FixtureCell = {
  id: string;
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][]; // GeoJSON [lng, lat] pairs
  };
  properties: FixtureCellProperties;
  /** Center coordinates extracted at load time for performance */
  centerLng: number;
  centerLat: number;
};

export type FixtureGeoJSON = {
  type: "FeatureCollection";
  name: string;
  metadata: {
    dataStatus: string;
    synthetic: boolean;
    evaluationWarning: string;
    historicalEventReference: string;
    generationTimestamp: string;
    spatialResolution: number;
    version: string;
    totalCellCount: number;
    landCellCount: number;
    surgeScenarioM: number;
    surgeThresholdKm: number;
  };
  features: Array<{
    type: "Feature";
    id: string;
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
    properties: FixtureCellProperties;
  }>;
};

export type FixtureInfrastructure = {
  _metadata: {
    dataStatus: string;
    synthetic: boolean;
    evaluationWarning: string;
    assetCount: number;
    version: string;
  };
  assets: Array<{
    assetId: string;
    name?: string;
    type: string;
    geometry: { type: "Point"; coordinates: [number, number] }; // [lng, lat]
    criticality: number;
    vulnerability: number;
    exposure: { hazard: number; population: number };
    dependencyCentrality: number;
    risk: number;
    confidence: Record<string, unknown>;
    provenance: Record<string, unknown>;
  }>;
};

export type FixtureHazardScenario = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────
// SINGLETON CACHE
// ─────────────────────────────────────────────────────────────

let _cellsCache: Map<string, FixtureCell> | null = null;
let _infrastructureCache: FixtureInfrastructure | null = null;
let _hazardScenarioCache: FixtureHazardScenario | null = null;
let _fixtureMetadataCache: FixtureGeoJSON["metadata"] | null = null;

const FIXTURE_DIR = join(process.cwd(), "data", "fixtures", "fani-demo");

function readFixtureFile<T>(filename: string): T {
  try {
    return JSON.parse(readFileSync(join(FIXTURE_DIR, filename), "utf-8")) as T;
  } catch (err) {
    throw new Error(
      `Failed to read fixture file "${filename}": ${String(err)}.\n` +
        `Run "pnpm generate:fixture" to generate the fixture.`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// LOADERS
// ─────────────────────────────────────────────────────────────

/**
 * Load (and cache) all fixture cells.
 * Returns a Map<cellId, FixtureCell> for O(1) lookup by cellId.
 *
 * Geometry is extracted from each feature for map rendering use.
 * Center coordinates are computed from the first ring's average.
 */
export function loadFixtureCells(): Map<string, FixtureCell> {
  if (_cellsCache) return _cellsCache;

  const raw = readFixtureFile<FixtureGeoJSON>("cells.geojson");
  _fixtureMetadataCache = raw.metadata;

  const map = new Map<string, FixtureCell>();

  for (const feature of raw.features) {
    const ring = feature.geometry.coordinates[0];
    if (!ring || ring.length === 0) continue;

    // Compute approximate center from polygon ring
    const sumLng = ring.reduce((s, p) => s + (p[0] ?? 0), 0);
    const sumLat = ring.reduce((s, p) => s + (p[1] ?? 0), 0);
    const centerLng = sumLng / ring.length;
    const centerLat = sumLat / ring.length;

    map.set(feature.id, {
      id: feature.id,
      geometry: feature.geometry,
      properties: feature.properties,
      centerLng,
      centerLat,
    });
  }

  _cellsCache = map;
  return map;
}

/** Load (and cache) infrastructure assets from fixture */
export function loadFixtureInfrastructure(): FixtureInfrastructure {
  if (_infrastructureCache) return _infrastructureCache;
  _infrastructureCache = readFixtureFile<FixtureInfrastructure>(
    "infrastructure.json"
  );
  return _infrastructureCache;
}

/** Load (and cache) the T-24h hazard scenario */
export function loadFixtureHazardScenario(): FixtureHazardScenario {
  if (_hazardScenarioCache) return _hazardScenarioCache;
  _hazardScenarioCache = readFixtureFile<FixtureHazardScenario>(
    "hazard_scenario.json"
  );
  return _hazardScenarioCache;
}

/** Return cached fixture GeoJSON metadata (does not include features) */
export function getFixtureMetadata(): FixtureGeoJSON["metadata"] {
  if (!_fixtureMetadataCache) loadFixtureCells(); // triggers load + metadata cache
  return _fixtureMetadataCache!;
}

// ─────────────────────────────────────────────────────────────
// FILTERING — never return the full 43k dataset
// ─────────────────────────────────────────────────────────────

export type BBox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

/** Maximum cells returned by any single API call */
export const MAX_CELLS_PER_RESPONSE = 4_000;

/**
 * Filter cells by viewport bounding box with spatial grid-sampling.
 *
 * Previous behaviour — stopping the Map iteration at maxCount — caused
 * geographic gaps: H3 insertion order clusters cells by region, so the
 * first N cells came from one part of Odisha and the northeast (Cuttack,
 * Bhubaneswar, Paradip) was consistently under-represented.
 *
 * New behaviour:
 *   1. Collect ALL cells whose centre falls in the bbox (no early stop).
 *   2. If count <= maxCount, return as-is.
 *   3. Otherwise divide the bbox into a GRID_COLS × GRID_ROWS grid and take
 *      at most perCell = ceil(maxCount / gridCells) cells per bucket.
 *      This produces a spatially uniform sample regardless of H3 ordering.
 */
export function filterCellsByBbox(
  cells: Map<string, FixtureCell>,
  bbox: BBox,
  maxCount = MAX_CELLS_PER_RESPONSE
): FixtureCell[] {
  const [minLng, minLat, maxLng, maxLat] = bbox;

  // Step 1: collect every cell whose centre is inside the bbox
  const inBbox: FixtureCell[] = [];
  for (const cell of cells.values()) {
    if (
      cell.centerLng >= minLng &&
      cell.centerLng <= maxLng &&
      cell.centerLat >= minLat &&
      cell.centerLat <= maxLat
    ) {
      inBbox.push(cell);
    }
  }

  if (inBbox.length <= maxCount) return inBbox;

  // Step 2: spatial grid-sample for geographic uniformity
  const GRID_COLS = 20;
  const GRID_ROWS = 12;
  const gridTotal = GRID_COLS * GRID_ROWS;
  const perCell   = Math.max(1, Math.ceil(maxCount / gridTotal));

  const dLng = (maxLng - minLng) / GRID_COLS;
  const dLat = (maxLat - minLat) / GRID_ROWS;

  const grid: FixtureCell[][] = Array.from({ length: gridTotal }, () => []);
  for (const cell of inBbox) {
    const col = Math.min(GRID_COLS - 1, Math.floor((cell.centerLng - minLng) / dLng));
    const row = Math.min(GRID_ROWS - 1, Math.floor((cell.centerLat - minLat) / dLat));
    const bucket = grid[row * GRID_COLS + col];
    if (bucket && bucket.length < perCell) bucket.push(cell);
  }

  const result: FixtureCell[] = [];
  for (const bucket of grid) {
    if (!bucket) continue;
    for (const cell of bucket) {
      result.push(cell);
      if (result.length >= maxCount) return result;
    }
  }
  return result;
}

/**
 * Retrieve specific cells by ID list.
 * Returns only the cells that exist in the fixture.
 */
export function getCellsByIds(
  cells: Map<string, FixtureCell>,
  cellIds: string[]
): FixtureCell[] {
  return cellIds.flatMap((id) => {
    const cell = cells.get(id);
    return cell ? [cell] : [];
  });
}

/**
 * Get a single cell by ID. Returns undefined if not found.
 */
export function getCellById(
  cells: Map<string, FixtureCell>,
  cellId: string
): FixtureCell | undefined {
  return cells.get(cellId);
}

/**
 * Returns cells sorted by a property value (e.g., for top-N high-hazard cells).
 * Never returns more than maxCount.
 */
export function getTopCellsByProperty(
  cells: Map<string, FixtureCell>,
  selector: (c: FixtureCell) => number,
  maxCount: number,
  landOnly = true
): FixtureCell[] {
  const all: FixtureCell[] = [];
  for (const cell of cells.values()) {
    if (landOnly && !cell.properties.isLand) continue;
    all.push(cell);
  }
  return all
    .sort((a, b) => selector(b) - selector(a))
    .slice(0, maxCount);
}

/**
 * Returns all land cells — used internally by the engine runner.
 * NEVER expose this directly to an API endpoint.
 */
export function getAllLandCells(cells: Map<string, FixtureCell>): FixtureCell[] {
  const result: FixtureCell[] = [];
  for (const cell of cells.values()) {
    if (cell.properties.isLand) result.push(cell);
  }
  return result;
}

/** Clear the in-memory cache (used in tests) */
export function clearFixtureCache(): void {
  _cellsCache = null;
  _infrastructureCache = null;
  _hazardScenarioCache = null;
  _fixtureMetadataCache = null;
}
