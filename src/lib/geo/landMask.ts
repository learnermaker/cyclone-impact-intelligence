/**
 * landMask.ts — Piecewise synthetic coastline heuristic for the Odisha AOI.
 *
 * STATUS: DEMO_HEURISTIC_PIECEWISE — not a validated land-cover dataset.
 *
 * This replaces the previous two-endpoint linear approximation with a
 * piecewise linear walk of all 14 coastline waypoints. This reduces false
 * positives (offshore cells classified as land) near pronounced coastline
 * bends, particularly around the Chilika mouth (~20.05°N) and Paradip.
 *
 * The correct long-term fix is to replace this entirely with the JRC Global
 * Surface Water Mapping Layers v1.4 aggregated to H3 res-8 cells.
 * See: docs/05_GEE_LANDWATER_MASK_PLAN.md
 *
 * Do NOT claim GEE-derived accuracy for this function.
 */

// Odisha coastal waypoints, [lat, lng] order (internal convention).
// Source: manually digitised from ISRO Bhuvan / OSM coastline, approximate.
const COAST_WAYPOINTS: [number, number][] = [
  [18.7,  84.50],  // S of Gopalpur
  [19.0,  84.80],  // Near Gopalpur
  [19.2,  85.10],  // Southern Ganjam coast
  [19.5,  85.45],  // Puri south
  [19.6,  85.55],
  [19.75, 85.77],  // Near Puri
  [19.80, 85.83],  // Puri beach (Fani landfall vicinity)
  [19.92, 85.96],
  [20.05, 86.08],  // Satapada / Chilika mouth
  [20.18, 86.21],
  [20.32, 86.38],  // Near Paradip
  [20.48, 86.57],
  [20.65, 86.72],  // Dhamra
  [20.80, 86.85],
];

/**
 * Returns the approximate coastline longitude at a given latitude using
 * piecewise linear interpolation along all COAST_WAYPOINTS.
 *
 * Outside the lat range, extrapolates from the nearest endpoint segment.
 */
export function piecewiseCoastLngAtLat(lat: number): number {
  const pts = COAST_WAYPOINTS;
  if (pts.length < 2) return 85.0; // safety fallback — should never happen

  const first = pts[0]!;
  const last  = pts[pts.length - 1]!;

  // Below the southernmost point — extrapolate from first segment
  if (lat <= first[0]) {
    const [lat0, lng0] = first;
    const [lat1, lng1] = pts[1]!;
    return lng0 + ((lat - lat0) / (lat1 - lat0)) * (lng1 - lng0);
  }
  // Above the northernmost point — extrapolate from last segment
  if (lat >= last[0]) {
    const [lat0, lng0] = pts[pts.length - 2]!;
    const [lat1, lng1] = last;
    return lng0 + ((lat - lat0) / (lat1 - lat0)) * (lng1 - lng0);
  }
  // Walk segments to find the bracketing pair
  for (let i = 0; i < pts.length - 1; i++) {
    const [lat0, lng0] = pts[i]!;
    const [lat1, lng1] = pts[i + 1]!;
    if (lat >= lat0 && lat < lat1) {
      return lng0 + ((lat - lat0) / (lat1 - lat0)) * (lng1 - lng0);
    }
  }
  // Fallback (unreachable in practice)
  return last[1];
}

/**
 * Returns true when the cell centre is likely on land.
 *
 * Rule: the centre longitude is west of (or within ~9 km seaward of)
 * the piecewise-interpolated coastline longitude at that latitude.
 *
 * The 0.08° buffer (≈ 9 km at these latitudes) deliberately includes
 * cells that straddle the coast so that very-near-coast land cells
 * are not dropped.
 *
 * LABEL: DEMO_HEURISTIC_PIECEWISE — accuracy depends on waypoint density.
 */
export function isLikelyLandPiecewise(lat: number, lng: number): boolean {
  return lng < piecewiseCoastLngAtLat(lat) + 0.08;
}

export const LAND_MASK_SOURCE = "DEMO_HEURISTIC_PIECEWISE" as const;
