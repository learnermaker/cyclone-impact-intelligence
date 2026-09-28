/**
 * Zustand application state store.
 *
 * Holds UI/session/scenario state only.
 * Does NOT duplicate backend datasets — those stay server-side.
 *
 * State shape mirrors AppState from types/index.ts.
 */

"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  AppMode,
  AppState,
  MapLayerId,
  ReplayPhase,
  Scenario,
} from "@/lib/types/index";
import { RESPONSE_CAPACITY } from "@/config/index";

type AppStore = AppState & {
  // ── Actions ─────────────────────────────────────────────────
  setMode: (mode: AppMode) => void;
  setSelectedEvent: (eventId: string | null) => void;
  setSelectedCell: (cellId: string | null) => void;
  setSelectedAsset: (assetId: string | null) => void;
  setResponseCapacity: (capacity: number) => void;
  setScenario: (scenario: Scenario | null) => void;
  setReplayPhase: (phase: ReplayPhase | null) => void;
  toggleLayer: (layer: MapLayerId) => void;
  setLayerVisible: (layer: MapLayerId, visible: boolean) => void;
  revealActual: () => void;
  resetReplay: () => void;
};

const DEFAULT_VISIBLE_LAYERS: Set<MapLayerId> = new Set([
  "combined_hazard",
  "infrastructure",
  "priority",
]);

export const useAppStore = create<AppStore>()(
  devtools(
    (set) => ({
      // ── Initial state ─────────────────────────────────────
      mode: "REPLAY",
      selectedEventId: null,
      selectedCellId: null,
      selectedAssetId: null,
      responseCapacity: RESPONSE_CAPACITY.default,
      scenario: null,
      replayPhase: null,
      visibleLayers: DEFAULT_VISIBLE_LAYERS,
      actualRevealed: false,

      // ── Actions ───────────────────────────────────────────
      setMode: (mode) => set({ mode }, false, "setMode"),

      setSelectedEvent: (eventId) =>
        set({ selectedEventId: eventId }, false, "setSelectedEvent"),

      setSelectedCell: (cellId) =>
        set({ selectedCellId: cellId }, false, "setSelectedCell"),

      setSelectedAsset: (assetId) =>
        set({ selectedAssetId: assetId }, false, "setSelectedAsset"),

      setResponseCapacity: (capacity) => {
        const clamped = Math.max(
          RESPONSE_CAPACITY.min,
          Math.min(RESPONSE_CAPACITY.max, capacity)
        );
        set({ responseCapacity: clamped }, false, "setResponseCapacity");
      },

      setScenario: (scenario) =>
        set({ scenario }, false, "setScenario"),

      setReplayPhase: (phase) =>
        set({ replayPhase: phase }, false, "setReplayPhase"),

      toggleLayer: (layer) =>
        set(
          (state) => {
            const next = new Set(state.visibleLayers);
            if (next.has(layer)) {
              next.delete(layer);
            } else {
              next.add(layer);
            }
            return { visibleLayers: next };
          },
          false,
          "toggleLayer"
        ),

      setLayerVisible: (layer, visible) =>
        set(
          (state) => {
            const next = new Set(state.visibleLayers);
            if (visible) {
              next.add(layer);
            } else {
              next.delete(layer);
            }
            return { visibleLayers: next };
          },
          false,
          "setLayerVisible"
        ),

      revealActual: () =>
        set({ actualRevealed: true }, false, "revealActual"),

      resetReplay: () =>
        set(
          {
            replayPhase: "PREDICTION",
            actualRevealed: false,
            selectedCellId: null,
            selectedAssetId: null,
          },
          false,
          "resetReplay"
        ),
    }),
    { name: "cyclone-impact-intelligence" }
  )
);
