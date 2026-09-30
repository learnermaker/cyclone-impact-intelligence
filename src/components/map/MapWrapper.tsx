"use client";

/**
 * MapWrapper — dynamic import gate for MapCanvas.
 * MapLibre v6 is ESM-only and browser-only.
 * This wrapper ensures it's never server-side rendered.
 */

import dynamic from "next/dynamic";
import type { MapCanvasProps } from "./MapCanvas";

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#f2efe9]">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto mb-3" />
        <p className="text-stone-400 text-sm">Loading map…</p>
      </div>
    </div>
  ),
});

export function MapWrapper(props: MapCanvasProps) {
  return <MapCanvas {...props} />;
}
