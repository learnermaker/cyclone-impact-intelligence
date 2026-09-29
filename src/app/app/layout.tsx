/**
 * App shell layout — wraps all four modes (LIVE, IMPACT, ACTION, REPLAY).
 *
 * Persistent elements:
 *   - Event status bar (top)
 *   - Data profile panel (GEE/source status strip)
 *   - Mode tab navigation
 */

import type { Metadata } from "next";
import { AppNav } from "@/components/shell/AppNav";
import { EventStatusBar } from "@/components/shell/EventStatusBar";
import { DataProfilePanel } from "@/components/platform/DataProfilePanel";

export const metadata: Metadata = {
  title: {
    template: "%s — Cyclone Impact Intelligence",
    default: "Cyclone Impact Intelligence",
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Persistent top status bar — event, source, freshness */}
      <EventStatusBar />

      {/* Data profile / GEE source status strip */}
      <DataProfilePanel />

      {/* Mode tab navigation */}
      <AppNav />

      {/* Mode content */}
      <main className="relative flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
