import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cyclone Impact Intelligence & Action Engine",
  description:
    "AI-assisted decision engine that converts cyclone hazard forecasts into " +
    "localized impact intelligence, infrastructure-aware response priorities, " +
    "explainable advisories, and historical replay evaluation.",
  keywords: [
    "cyclone",
    "disaster management",
    "impact intelligence",
    "Odisha",
    "decision support",
    "Fani",
  ],
  authors: [{ name: "Code for Communities 2.0 — Cyclone Track" }],
  robots: "noindex, nofollow", // Not a public-facing production service
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1117",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* MapLibre GL v6 ships its own CSS */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/maplibre-gl@6.0.0/dist/maplibre-gl.css"
        />
      </head>
      <body className="h-screen overflow-hidden bg-[#0f1117] text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
