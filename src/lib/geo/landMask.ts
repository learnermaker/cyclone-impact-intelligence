/**
 * landMask.ts — Synthetic land/water classification for the Odisha AOI.
 *
 * STATUS: DEMO_HEURISTIC_PIECEWISE_V2 — not a validated land-cover dataset.
 *
 * Method:
 *   1. Piecewise linear outer-coast test (corrected waypoints v2).
 *   2. Chilika Lake exclusion via axis-based ellipse — the lake sits WEST of
 *      the outer coast so the 1D test alone cannot exclude it.
 *
 * Root causes fixed vs v1:
 *   - Waypoint [19.2, 85.10] was ~18 km too far east; corrected to [19.2, 84.93]
 *     This caused sea cells near Gopalpur/Nayiput to be classified as land.
 *   - Chilika Lake cells (85.05-85.55°E, 19.35-19.85°N) were west of the outer
 *      coast so the 1D heuristic incorrectly labelled them as land.
 *
 * The correct long-term fix is JRC GSW v1.4 aggregated to H3 res-8.
 * See: docs/05_GEE_LANDWATER_MASK_PLAN.md
 */

// ── Outer coast waypoints ────────────────────────────────────
// [lat, lng] pairs tracing the Bay of Bengal coast S→N.
// v2 corrections: [19.2] waypoint corrected; [19.5] outer beach adjusted.
const COAST_WAYPOINTS: [number, number][] = [
  [18.7,  84.50],  // S of Gopalpur (AOI southern boundary)
  [19.0,  84.80],  // Markandi / Gopalpur approach
  [19.2,  84.93],  // Gopalpur-on-Sea area  ← corrected from 85.10
  [19.5,  85.38],  // Outer Chilika barrier beach (S)  ← adjusted from 85.45
  [19.6,  85.50],  // Outer Chilika barrier beach (mid)
  [19.75, 85.72],  // Puri south approach
  [19.80, 85.83],  // Puri beach (Fani landfall vicinity)
  [19.92, 85.96],
  [20.05, 86.08],  // Satapada / Chilika mouth
  [20.18, 86.34],  // Outer coast N of Chilika (corrected from 86.21 — 14 km too far W)
  [20.32, 86.60],  // Paradip port area (corrected from 86.38 — was 22 km too far W)
  [20.48, 86.70],  // Mahanadi delta / N of Paradip (corrected from 86.57)
  [20.65, 86.79],  // Toward Dhamra (corrected from 86.72)
  [20.80, 86.85],
];

// ── Chilika Lake exclusion ────────────────────────────────────
//
// Chilika Lake (~1100 km²) is a coastal lagoon in Odisha at 19.35–19.85°N,
// 85.05–85.55°E. It lies WEST of the outer coast, so the 1D coast heuristic
// classifies its cells as land. We exclude the lake body explicitly.
//
// Model: axis-aligned ellipse oriented along the lake's NE–SW main axis.
//   Axis: from SW corner (19.35°N, 85.05°E) to NE corner (19.83°N, 85.52°E)
//   Axis direction vector: (dlng=0.47, dlat=0.48)
//   Width: 0 at endpoints → ~0.22° at widest midpoint (sinusoidal envelope)
//
// Verified against sample cells:
//   (85.267, 19.411) — inside lake → excluded ✓
//   (85.352, 19.765) — inside lake → excluded ✓
//   (85.636, 19.815) — t>1.1, outside → kept ✓

const CHILIKA_AXIS_START: [number, number] = [19.35, 85.05]; // [lat, lng]
const CHILIKA_AXIS_DLAT = 0.48;
const CHILIKA_AXIS_DLNG = 0.47;
const CHILIKA_AXIS_LEN2 =
  CHILIKA_AXIS_DLAT * CHILIKA_AXIS_DLAT + CHILIKA_AXIS_DLNG * CHILIKA_AXIS_DLNG; // ≈0.4513

function isInChilikaLake(lat: number, lng: number): boolean {
  // Quick bounding-box rejection
  if (lat < 19.30 || lat > 19.90) return false;
  if (lng < 84.95 || lng > 85.65) return false;

  // Project (lat, lng) onto the lake axis
  const dlat = lat - CHILIKA_AXIS_START[0];
  const dlng = lng - CHILIKA_AXIS_START[1];

  const t = (dlat * CHILIKA_AXIS_DLAT + dlng * CHILIKA_AXIS_DLNG) / CHILIKA_AXIS_LEN2;

  // Only cells within the lake's length ± small margin
  if (t < -0.08 || t > 1.08) return false;

  // Perpendicular distance from axis
  const perpLat = dlat - t * CHILIKA_AXIS_DLAT;
  const perpLng = dlng - t * CHILIKA_AXIS_DLNG;
  const perpDist = Math.sqrt(perpLat * perpLat + perpLng * perpLng);

  // Lake half-width profile: 0 at tips, 0.22° at midpoint
  const tClamped  = Math.max(0, Math.min(1, t));
  const halfWidth = 0.22 * Math.sin(Math.PI * tClamped) + 0.04;

  return perpDist < halfWidth;
}

// ── Outer coastline interpolation ────────────────────────────

export function piecewiseCoastLngAtLat(lat: number): number {
  const pts = COAST_WAYPOINTS;
  if (pts.length < 2) return 85.0;

  const first = pts[0]!;
  const last  = pts[pts.length - 1]!;

  if (lat <= first[0]) {
    const [lat0, lng0] = first;
    const [lat1, lng1] = pts[1]!;
    return lng0 + ((lat - lat0) / (lat1 - lat0)) * (lng1 - lng0);
  }
  if (lat >= last[0]) {
    const [lat0, lng0] = pts[pts.length - 2]!;
    const [lat1, lng1] = last;
    return lng0 + ((lat - lat0) / (lat1 - lat0)) * (lng1 - lng0);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [lat0, lng0] = pts[i]!;
    const [lat1, lng1] = pts[i + 1]!;
    if (lat >= lat0 && lat < lat1) {
      return lng0 + ((lat - lat0) / (lat1 - lat0)) * (lng1 - lng0);
    }
  }
  return last[1];
}

// ── Public API ────────────────────────────────────────────────

/**
 * Returns true when the cell centre is likely on land.
 *
 * Conditions for land classification:
 *   1. Longitude is west of (outer coast + 0.05° buffer).
 *   2. Cell centre is NOT inside the Chilika Lake ellipse.
 *
 * LABEL: DEMO_HEURISTIC_PIECEWISE_V2
 */
export function isLikelyLandPiecewise(lat: number, lng: number): boolean {
  if (lng >= piecewiseCoastLngAtLat(lat) + 0.05) return false;
  if (isInChilikaLake(lat, lng)) return false;
  return true;
}

export const LAND_MASK_SOURCE = "DEMO_HEURISTIC_PIECEWISE_V2" as const;
