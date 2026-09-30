/**
 * App shell layout — wraps all four modes (LIVE, IMPACT, ACTION, REPLAY).
 *
 * Single compact AppHeader replaces the previous three stacked bands
 * (EventStatusBar + DataProfilePanel + AppNav).
 * Header height: 48px — leaves maximum viewport for map + decision panel.
 */

import type { Metadata } from "next";
import { AppHeader } from "@/components/shell/AppHeader";

export const metadata: Metadata = {
  title: {
    template: "%s — Cyclone Impact Intelligence",
    default: "Cyclone Impact Intelligence",
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Single compact command bar: identity + nav + event/data status */}
      <AppHeader />

      {/* Mode content — gets remaining viewport (h-screen - 48px) */}
      <main className="relative flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
