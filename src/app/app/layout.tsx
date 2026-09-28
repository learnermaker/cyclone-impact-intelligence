/**
 * App shell layout — wraps all four modes (LIVE, IMPACT, ACTION, REPLAY).
 *
 * Persistent elements:
 *   - Event status bar (top)
 *   - Mode tab navigation
 *   - Response capacity control
 *   - Source / freshness indicator
 */

import type { Metadata } from "next";
import { AppNav } from "@/components/shell/AppNav";
import { EventStatusBar } from "@/components/shell/EventStatusBar";

export const metadata: Metadata = {
  title: {
    template: "%s — Cyclone Impact Intelligence",
    default: "Cyclone Impact Intelligence",
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Persistent top status bar — event, source, freshness, time-to-landfall */}
      <EventStatusBar />

      {/* Mode tab navigation */}
      <AppNav />

      {/* Mode content */}
      <main className="relative flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
