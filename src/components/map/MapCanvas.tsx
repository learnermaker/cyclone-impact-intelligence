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
// ─────────────────────────────────────────────────────────────

type ColorStop = [number, string];

const LAYER_COLORS: Record<string, ColorStop[]> = {
  wind:           [[0,"#fef3c7"],[0.3,"#fbbf24"],[0.6,"#f97316"],[0.8,"#dc2626"],[1,"#7f1d1d"]],
  rainfall:       [[0,"#eff6ff"],[0.3,"#93c5fd"],[0.6,"#3b82f6"],[0.8,"#1d4ed8"],[1,"#1e3a8a"]],
  surge:          [[0,"#ecfeff"],[0.4,"#22d3ee"],[0.7,"#0891b2"],[1,"#164e63"]],
  combined_hazard:[[0,"#fef9c3"],[0.25,"#fde047"],[0.5,"#f97316"],[0.75,"#dc2626"],[1,"#7f1d1d"]],
  population:     [[0,"#f0fdf4"],[0.3,"#86efac"],[0.6,"#16a34a"],[0.8,"#15803d"],[1,"#14532d"]],
  impact:         [[0,"#fefce8"],[0.25,"#fde047"],[0.5,"#f97316"],[0.75,"#dc2626"],[1,"#7f1d1d"]],
  priority:       [[0,"#fdf4ff"],[0.25,"#e879f9"],[0.5,"#c026d3"],[0.75,"#86198f"],[1,"#4a044e"]],
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

const INITIAL_CENTER: [number, number] = [85.83, 19.8];
const INITIAL_ZOOM = 7;
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
  };
  onCellClick?: (cellId: string) => void;
};

// ─────────────────────────────────────────────────────────────
// INTERNAL MAP TYPE (avoid importing full MapLibre types)
// ─────────────────────────────────────────────────────────────

type MLMap = {
  on: (event: string, layerOrCb: unknown, cb?: unknown) => void;
  addSource: (id: string, src: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => { setData?: (d: unknown) => void } | undefined;
  getBounds: () => {
    getSouthWest: () => { lng: number; lat: number };
    getNorthEast: () => { lng: number; lat: number };
  } | null | undefined;
  setPaintProperty: (layerId: string, prop: string, value: unknown) => void;
  getCanvas: () => HTMLCanvasElement;
  remove: () => void;
};

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function MapCanvas({
  activeLayer,
  scenarioParams = {},
  onCellClick,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Keep a ref to the latest fetch params so event handlers (registered once)
  // always use current values — avoids the stale-closure trap.
  const layerRef = useRef<MapLayerId>(activeLayer);
  const scenarioRef = useRef(scenarioParams);
  const fetchFnRef = useRef<(() => void) | null>(null);

  // Sync refs to latest prop values
  useEffect(() => { layerRef.current = activeLayer; }, [activeLayer]);
  useEffect(() => { scenarioRef.current = scenarioParams; }, [scenarioParams]);

  // ── Fetch cells and push into GeoJSON source ──────────────
  //
  // Does NOT use isStyleLoaded() — instead checks source existence.
  // Called: (a) once after load event, (b) on moveend, (c) on param change.
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

    const p = new URLSearchParams({
      bbox: bbox.join(","),
      layer: layerRef.current,
      surgeMethod: scenarioRef.current.surgeMethod ?? "flood_fill",
      surgeHeight: String(scenarioRef.current.surgeHeight ?? 1.5),
      windMult:    String(scenarioRef.current.windMult ?? 1.0),
      rainMult:    String(scenarioRef.current.rainMult ?? 1.0),
      maxCount:    "2000",
    });

    try {
      const res = await fetch(`/api/impact?${p}`);
      if (!res.ok) return;
      const json = await res.json() as { ok: boolean; data?: { features?: unknown[] } };
      if (!json.ok || !json.data?.features) return;

      // Re-check source still exists (map might have been removed during async)
      const src = map.getSource("cells");
      src?.setData?.({ type: "FeatureCollection", features: json.data.features });
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
    try {
      map.setPaintProperty("cells-fill", "fill-color", makeInterpolation(stops));
    } catch { /* layer not added yet — load handler will use the correct stops */ }
    // Re-fetch for the new layer
    fetchFnRef.current?.();
  }, [activeLayer]);

  // ── Trigger re-fetch when scenario params change ──────────
  useEffect(() => {
    fetchFnRef.current?.();
  }, [scenarioParams]);

  // ── Initialise map (runs once) ────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let mounted = true;

    import("maplibre-gl").then((ml) => {
      if (!mounted || !containerRef.current) return;

      const map = new ml.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
      }) as unknown as MLMap;

      mapRef.current = map;
      setMapReady(true); // remove "loading" overlay

      map.on("load", () => {
        // ── GeoJSON source ────────────────────────────────────
        map.addSource("cells", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        const stops = LAYER_COLORS[layerRef.current] ?? LAYER_COLORS["combined_hazard"] ?? [];

        // Fill: interpolate layer value → colour
        map.addLayer({
          id: "cells-fill",
          type: "fill",
          source: "cells",
          paint: {
            "fill-color": makeInterpolation(stops),
            "fill-opacity": [
              "case",
              ["boolean", ["get", "surgeExposed"], false], 0.82,
              0.68,
            ],
          },
        });

        // Thin outline
        map.addLayer({
          id: "cells-outline",
          type: "line",
          source: "cells",
          paint: {
            "line-color": "#334155",
            "line-opacity": 0.4,
            "line-width": 0.4,
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

        // Initial data load — use fetchFnRef so it's always fresh
        fetchFnRef.current?.();
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
        if (cellId && onCellClick) onCellClick(cellId);
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
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#12151f]">
          <div className="text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-slate-500">Loading map…</p>
          </div>
        </div>
      )}
    </div>
  );
}
