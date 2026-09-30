"use client";

/**
 * MapCanvas — MapLibre GL v6 interactive map.
 *
 * Must be imported via next/dynamic with ssr:false — see MapWrapper.tsx.
 *
 * Design:
 *  - Map is initialised once in a useEffect with empty deps.
 *  - All event handlers read from `fetchFnRef` (a mutable ref) rather than
 *    from a React closure, so they always call the *latest* fetch function
 *    without the stale-closure problem that plagued the previous version.
 *  - `isStyleLoaded()` is NOT used as a gate — instead we check whether the
 *    "cells" source has been added yet.
 *  - Paint properties are updated via `setPaintProperty` when `activeLayer`
 *    changes, without recreating the map.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { MapLayerId } from "@/lib/types/index";

// ─────────────────────────────────────────────────────────────
// COLOUR SCALES  — value [0..1] → hex colour
// Based on ColorBrewer YlOrRd / Blues cartographic ramps for
// clarity on both light and dark basemaps.
// ─────────────────────────────────────────────────────────────

type ColorStop = [number, string];

const LAYER_COLORS: Record<string, ColorStop[]> = {
  // YlOrRd ramp — warm hazard gradient
  wind:            [[0,"#ffffb2"],[0.25,"#fecc5c"],[0.5,"#fd8d3c"],[0.75,"#e31a1c"],[1,"#800026"]],
  // Blues ramp
  rainfall:        [[0,"#deebf7"],[0.25,"#9ecae1"],[0.5,"#4292c6"],[0.75,"#2171b5"],[1,"#084594"]],
  // Greens ramp — surge
  surge:           [[0,"#e5f5e0"],[0.3,"#74c476"],[0.55,"#41ab5d"],[0.75,"#006d2c"],[1,"#00441b"]],
  // YlOrRd — combined hazard (same as wind, stronger red emphasis)
  combined_hazard: [[0,"#ffffb2"],[0.25,"#fecc5c"],[0.5,"#fd8d3c"],[0.75,"#e31a1c"],[1,"#800026"]],
  // Blues — population density
  population:      [[0,"#deebf7"],[0.25,"#9ecae1"],[0.5,"#4292c6"],[0.75,"#2171b5"],[1,"#084594"]],
  // YlGnBu — composite impact
  // impactExposure.score = hazard × exposure × susceptibility — a product of
  // three sub-1 factors, so values cluster 0.0–0.20 in practice.
  // Stops calibrated to the observed Odisha/Fani data range, not theoretical [0,1].
  impact:          [[0,"#ffffcc"],[0.02,"#a1dab4"],[0.05,"#41b6c4"],[0.10,"#2c7fb8"],[0.20,"#253494"]],
  // YlOrRd — priority (only selected cells rendered after API fix)
  priority:        [[0.05,"#ffffb2"],[0.3,"#fecc5c"],[0.6,"#fd8d3c"],[0.8,"#f03b20"],[1,"#bd0026"]],
  // Blues — Sentinel-1 actual flood extent
  actual_impact:   [[0,"#c6dbef"],[0.3,"#6baed6"],[0.6,"#2171b5"],[1,"#08306b"]],
};

function makeInterpolation(stops: ColorStop[]) {
  return ["interpolate", ["linear"], ["get", "v"], ...stops.flatMap(([v, c]) => [v, c])];
}

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
  "https://tiles.openfreemap.org/styles/liberty";

// Odisha coastal corridor centred — Bhubaneswar/coast balanced, sea not dominant.
const INITIAL_CENTER: [number, number] = [85.65, 20.0];
const INITIAL_ZOOM = 7.5;
// Fallback bbox covering the Odisha AOI if getBounds() is unavailable
const FALLBACK_BBOX: [number, number, number, number] = [84.8, 19.2, 86.8, 20.7];

// ─────────────────────────────────────────────────────────────
// PROP TYPES
// ─────────────────────────────────────────────────────────────

export type MapCanvasProps = {
  activeLayer: MapLayerId;
  scenarioParams?: {
    surgeHeight?: number;
    windMult?: number;
    rainMult?: number;
    surgeMethod?: string;
    /** Response capacity K — controls how many priority cells are selected */
    k?: number;
    /** Priority objective: "balanced" | "population" | "infrastructure" | "service_continuity" */
    objective?: string;
  };
  onCellClick?: (cellId: string) => void;
  /** Show curated infrastructure asset markers (hospitals, shelters, bridges, etc.) */
  showAssets?: boolean;
  onAssetClick?: (assetId: string, name: string, type: string) => void;
  /** Cell to highlight with a blue selection outline (controlled by parent). */
  selectedCellId?: string | null;
  /** Cell to fit/flyTo when this prop changes (controlled by parent). */
  focusCellId?: string | null;
};

// ─────────────────────────────────────────────────────────────
// INTERNAL MAP TYPE (avoid importing full MapLibre types)
// ─────────────────────────────────────────────────────────────

type MLMap = {
  on: (event: string, layerOrCb: unknown, cb?: unknown) => void;
  addSource: (id: string, src: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => { setData?: (d: unknown) => void } | undefined;
  getLayer: (id: string) => unknown | undefined;
  getBounds: () => {
    getSouthWest: () => { lng: number; lat: number };
    getNorthEast: () => { lng: number; lat: number };
  } | null | undefined;
  setPaintProperty: (layerId: string, prop: string, value: unknown) => void;
  getCanvas: () => HTMLCanvasElement;
  remove: () => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options?: { padding?: number; maxZoom?: number; duration?: number }
  ) => void;
  flyTo: (options: { center: [number, number]; zoom?: number; speed?: number; duration?: number }) => void;
};

// ─────────────────────────────────────────────────────────────
// ASSET TYPE COLOURS
// ─────────────────────────────────────────────────────────────

// MapLibre match expression for asset type → circle color
const ASSET_COLOR_EXPR = [
  "match", ["get", "assetType"],
  "hospital",          "#ef4444",
  "shelter",           "#3b82f6",
  "bridge",            "#eab308",
  "power",             "#f97316",
  "water",             "#06b6d4",
  "emergency_service", "#a855f7",
  "#9ca3af",  // default
];

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function MapCanvas({
  activeLayer,
  scenarioParams = {},
  onCellClick,
  showAssets = false,
  onAssetClick,
  selectedCellId = null,
  focusCellId = null,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Keep a ref to the latest fetch params so event handlers (registered once)
  // always use current values — avoids the stale-closure trap.
  const layerRef = useRef<MapLayerId>(activeLayer);
  const scenarioRef = useRef(scenarioParams);
  const fetchFnRef = useRef<(() => void) | null>(null);
  const showAssetsRef = useRef(showAssets);
  const onAssetClickRef = useRef(onAssetClick);
  const onCellClickRef = useRef(onCellClick);

  // ── Selection / focus refs ────────────────────────────────
  // Refs so the stable doFetch callback always reads current values.
  const selectedCellIdRef    = useRef<string | null>(selectedCellId);
  const cellGeometryCacheRef = useRef<Map<string, unknown>>(new Map());

  // Sync refs to latest prop values
  useEffect(() => { layerRef.current = activeLayer; }, [activeLayer]);
  useEffect(() => { scenarioRef.current = scenarioParams; }, [scenarioParams]);
  useEffect(() => { showAssetsRef.current = showAssets; }, [showAssets]);
  useEffect(() => { onAssetClickRef.current = onAssetClick; }, [onAssetClick]);
  useEffect(() => { onCellClickRef.current = onCellClick; }, [onCellClick]);
  useEffect(() => { selectedCellIdRef.current = selectedCellId; }, [selectedCellId]);

  // ── Fetch cells and push into GeoJSON source ──────────────
  //
  // Does NOT use isStyleLoaded() — instead checks source existence.
  // Called: (a) once after load event, (b) on moveend, (c) on param change.
  //
  // `actual_impact` layer fetches from /api/actual/flood (Sentinel-1 data)
  // instead of /api/impact to respect the TemporalFirewall.
  const doFetch = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource("cells");
    if (!source?.setData) return; // source not added yet — map hasn't loaded

    // Get current viewport bounds; fall back to AOI bbox
    let bbox: [number, number, number, number] = FALLBACK_BBOX;
    try {
      const b = map.getBounds();
      if (b) {
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        bbox = [sw.lng, sw.lat, ne.lng, ne.lat];
      }
    } catch { /* use fallback */ }

    const currentLayer = layerRef.current;
    const isActualLayer = currentLayer === "actual_impact";

    let fetchUrl: string;
    if (isActualLayer) {
      // Actual Sentinel-1 flood extent — dedicated endpoint behind TemporalFirewall
      fetchUrl = `/api/actual/flood?bbox=${bbox.join(",")}`;
    } else {
      const p = new URLSearchParams({
        bbox: bbox.join(","),
        layer: currentLayer,
        surgeMethod: scenarioRef.current.surgeMethod ?? "flood_fill",
        surgeHeight: String(scenarioRef.current.surgeHeight ?? 1.5),
        windMult:    String(scenarioRef.current.windMult ?? 1.0),
        rainMult:    String(scenarioRef.current.rainMult ?? 1.0),
        maxCount:    "4000",
        ...(scenarioRef.current.k        ? { k: String(scenarioRef.current.k) } : {}),
        ...(scenarioRef.current.objective ? { objective: scenarioRef.current.objective } : {}),
      });
      fetchUrl = `/api/impact?${p}`;
    }

    try {
      const res = await fetch(fetchUrl);
      if (!res.ok) {
        console.warn(`[MapCanvas] API ${res.status} for ${fetchUrl}`);
        return;
      }
      const json = await res.json() as { ok: boolean; data?: { features?: unknown[]; meta?: { returnedCells?: number } } };
      if (!json.ok || !json.data?.features) {
        console.warn("[MapCanvas] API response not ok or missing features:", json);
        return;
      }

      const count = json.data.features.length;
      if (process.env.NODE_ENV !== "production") {
        console.info(`[MapCanvas] ✓ ${count} cells loaded (layer: ${layerRef.current})`);
      }

      // Re-check source still exists (map might have been removed during async)
      const src = map.getSource("cells");
      if (!src?.setData) {
        console.warn("[MapCanvas] cells source disappeared after fetch");
        return;
      }
      src.setData({ type: "FeatureCollection", features: json.data.features });

      // ── Cache geometries for selection overlay ────────────
      // Stores the last-seen GeoJSON feature per cellId so the selection
      // outline and flyTo can work without an extra API round-trip.
      const geomCache = cellGeometryCacheRef.current;
      for (const f of json.data.features as Array<{ properties?: { cellId?: string } }>) {
        if (f?.properties?.cellId) geomCache.set(f.properties.cellId, f);
      }
      // Refresh the selection outline in case the selected cell just loaded
      const selSrc = map.getSource("cells-selected");
      if (selSrc?.setData) {
        const cid = selectedCellIdRef.current;
        const selF = cid ? geomCache.get(cid) : undefined;
        selSrc.setData({ type: "FeatureCollection", features: selF ? [selF] : [] });
      }
    } catch (err) {
      console.warn("[MapCanvas] fetch failed:", err);
    }
  }, []); // deps: none — uses refs, not closures

  // Keep fetchFnRef current so event handlers (registered once) always call
  // the latest doFetch.
  useEffect(() => {
    fetchFnRef.current = doFetch;
  }, [doFetch]);

  // ── Update paint when activeLayer changes ─────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const stops = LAYER_COLORS[activeLayer] ?? LAYER_COLORS["combined_hazard"] ?? [];
    // Guard with getLayer — setPaintProperty calls console.error internally before
    // throwing when the layer doesn't exist yet, which triggers the dev overlay.
    // Checking first prevents both the error and the spurious log.
    if (map.getLayer("cells-fill")) {
      map.setPaintProperty("cells-fill", "fill-color", makeInterpolation(stops));
    }
    // Re-fetch for the new layer regardless (load handler uses layerRef.current)
    fetchFnRef.current?.();
  }, [activeLayer]);

  // ── Trigger re-fetch when scenario params change ──────────
  useEffect(() => {
    fetchFnRef.current?.();
  }, [scenarioParams]);

  // ── Update selection outline when selectedCellId changes ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("cells-selected");
    if (!src?.setData) return;
    const cid = selectedCellId;
    if (!cid) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const feature = cellGeometryCacheRef.current.get(cid);
    src.setData({ type: "FeatureCollection", features: feature ? [feature] : [] });
  }, [selectedCellId, mapReady]);

  // ── Fly/fit to focusCellId when it changes ────────────────
  useEffect(() => {
    if (!focusCellId || !mapReady || !mapRef.current) return;
    const feature = cellGeometryCacheRef.current.get(focusCellId) as
      | { geometry?: { coordinates?: [number, number][][] } }
      | undefined;
    const ring = feature?.geometry?.coordinates?.[0];
    if (!ring?.length) return;
    const lngs = ring.map((c) => c[0]);
    const lats  = ring.map((c) => c[1]);
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 120, maxZoom: 13, duration: 800 }
    );
  }, [focusCellId, mapReady]);

  // ── Initialise map (runs once) ────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let mounted = true;

    import("maplibre-gl").then((ml) => {
      if (!mounted || !containerRef.current) return;

      // ── MapLibre v6 worker URL (required for Next.js/Turbopack) ──────────
      // v6 ships ESM-only; bundlers can't auto-detect the worker file from
      // import.meta.url. Without an explicit setWorkerUrl call, GeoJSON
      // sources are processed in the wrong context and render nothing —
      // vector-tile basemaps still appear because they use a different path.
      // Worker files are copied to /public by `pnpm install` (or manually).
      (ml as { setWorkerUrl?: (url: string) => void }).setWorkerUrl?.("/maplibre-gl-worker.mjs");

      const map = new ml.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
      }) as unknown as MLMap;

      mapRef.current = map;
      // Do NOT call setMapReady(true) here — sources/layers don't exist yet.
      // setMapReady is called inside the load handler after everything is ready.

      map.on("load", () => {
        // ── GeoJSON source ────────────────────────────────────
        map.addSource("cells", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        const stops = LAYER_COLORS[layerRef.current] ?? LAYER_COLORS["combined_hazard"] ?? [];

        // Fill: interpolate layer value → colour.
        // Opacity is VALUE-DEPENDENT so low-value cells recede visually and
        // high-value / priority cells dominate. Zero-value cells are invisible.
        map.addLayer({
          id: "cells-fill",
          type: "fill",
          source: "cells",
          paint: {
            "fill-color": makeInterpolation(stops),
            "fill-opacity": [
              "interpolate", ["linear"], ["get", "v"],
              0.0,  0.0,   // no value → transparent
              0.02, 0.07,  // very low → faint tint
              0.10, 0.28,  // low → analytical hint
              0.30, 0.58,  // medium → clearly visible
              0.60, 0.78,  // high → strong
              1.0,  0.92,  // maximum → very prominent
            ],
          },
        });

        // Analytical cell outline — visible only for the highest-value cells.
        // Regional-zoom outlines are removed to prevent the dense grid appearance.
        // Priority rank cells get their own stronger blue outline (layer below).
        map.addLayer({
          id: "cells-outline",
          type: "line",
          source: "cells",
          paint: {
            "line-color": "#334155",
            "line-opacity": [
              "interpolate", ["linear"], ["get", "v"],
              0.0,  0.0,   // invisible for zero/low values
              0.50, 0.0,   // still invisible at medium
              0.80, 0.10,  // faint hint at high values
              1.0,  0.22,  // subtle at maximum
            ],
            "line-width": 0.5,
          },
        });

        // Priority rank cells — distinct blue outline for visual hierarchy.
        // This makes top-K cells clearly distinguishable from ordinary cells.
        map.addLayer({
          id: "cells-rank-outline",
          type: "line",
          source: "cells",
          filter: ["has", "rank"],
          paint: {
            "line-color": "#1d4ed8",
            "line-opacity": 0.80,
            "line-width": 2.0,
          },
        });

        // Priority rank labels
        map.addLayer({
          id: "cells-rank",
          type: "symbol",
          source: "cells",
          filter: ["has", "rank"],
          layout: {
            "text-field": ["concat", "#", ["to-string", ["get", "rank"]]],
            "text-size": 11,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 1,
          },
        });

        // ── Selected-cell overlay ────────────────────────────
        map.addSource("cells-selected", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        // Subtle fill tint
        map.addLayer({
          id: "cells-selected-fill",
          type: "fill",
          source: "cells-selected",
          paint: { "fill-color": "#1d4ed8", "fill-opacity": 0.18 },
        });
        // Bold blue outline on top of all H3 layers
        map.addLayer({
          id: "cells-selected-outline",
          type: "line",
          source: "cells-selected",
          paint: {
            "line-color": "#1d4ed8",
            "line-width": 3,
            "line-opacity": 0.92,
          },
        });

        // ── Infrastructure asset markers (optional) ───────────
        if (showAssetsRef.current) {
          map.addSource("assets", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });

          map.addLayer({
            id: "assets-circles",
            type: "circle",
            source: "assets",
            paint: {
              "circle-radius": [
                "interpolate", ["linear"], ["get", "criticality"],
                0, 5, 0.5, 8, 1, 12,
              ],
              "circle-color": ASSET_COLOR_EXPR,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
              "circle-opacity": 0.92,
            },
          });

          map.addLayer({
            id: "assets-labels",
            type: "symbol",
            source: "assets",
            minzoom: 8,            // hide at regional zoom — reduces clutter
            layout: {
              "text-field": ["get", "name"],
              "text-size": 10,
              // Variable anchors: renderer picks least-collision placement
              "text-variable-anchor": ["top", "bottom", "left", "right"],
              "text-radial-offset": 0.9,
              "text-justify": "auto",
              "text-optional": true,
              "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
              // Higher-criticality assets claim label space first
              "symbol-sort-key": ["*", -1, ["get", "criticality"]],
            },
            paint: {
              "text-color": "#1c1917",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.2,
            },
          });

          // Fetch curated infrastructure assets once
          fetch("/api/assets")
            .then((r) => r.json())
            .then((json: { ok: boolean; data?: { assets?: Array<{
              assetId: string; name: string; type: string;
              coordinates: [number, number]; criticality: number;
              risk: number; containingCellId?: string;
            }> } }) => {
              if (!json.ok || !json.data?.assets) return;
              const features = json.data.assets.map((a) => ({
                type: "Feature" as const,
                properties: {
                  assetId: a.assetId,
                  name: a.name,
                  assetType: a.type,
                  criticality: a.criticality,
                  risk: a.risk,
                  containingCellId: a.containingCellId ?? "",
                },
                geometry: { type: "Point" as const, coordinates: a.coordinates },
              }));
              const src = map.getSource("assets");
              src?.setData?.({ type: "FeatureCollection", features });
            })
            .catch((err) => console.warn("[MapCanvas] failed to fetch assets:", err));

          // Asset hover cursor
          map.on("mouseenter", "assets-circles", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "assets-circles", () => {
            map.getCanvas().style.cursor = "";
          });

          // Asset click
          map.on("click", "assets-circles", (e: unknown) => {
            const ev = e as { features?: Array<{ properties?: { assetId?: string; name?: string; assetType?: string } }> };
            const props = ev.features?.[0]?.properties;
            if (props && onAssetClickRef.current) {
              onAssetClickRef.current(
                props.assetId ?? "",
                props.name ?? "",
                props.assetType ?? ""
              );
            }
          });
        }

        // Initial data load — use fetchFnRef so it's always fresh
        fetchFnRef.current?.();

        // Sources and layers are ready — remove loading overlay.
        // Doing this here (inside load) prevents the race where selectedCell
        // and focusCellId effects fire before sources exist.
        setMapReady(true);
      });

      // Debounced re-fetch on map move
      let moveTimer: ReturnType<typeof setTimeout>;
      map.on("moveend", () => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(() => fetchFnRef.current?.(), 300);
      });

      // Cell click → parent handler
      map.on("click", "cells-fill", (e: unknown) => {
        const ev = e as { features?: Array<{ properties?: { cellId?: string } }> };
        const cellId = ev.features?.[0]?.properties?.cellId;
        if (cellId) onCellClickRef.current?.(cellId);
      });

      map.on("mouseenter", "cells-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "cells-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    }).catch((err) => {
      console.error("[MapCanvas] failed to load maplibre-gl:", err);
    });

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally once

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="map-container h-full w-full" />
      {!mapReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#f2efe9]">
          <div className="text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-stone-400">Loading map…</p>
          </div>
        </div>
      )}
    </div>
  );
}
