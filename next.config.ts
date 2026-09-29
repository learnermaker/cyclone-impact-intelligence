import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker/Cloud Run deployment
  output: "standalone",

  // Expose only safe, non-secret env vars to the browser
  env: {
    NEXT_PUBLIC_MAP_STYLE_URL: process.env.MAP_STYLE_URL ?? "",
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "0.1.0",
  },

  // h3-js runs in Node.js only (never bundled for browser)
  serverExternalPackages: ["h3-js"],

  /**
   * MapLibre GL v6 is NOT bundled by webpack/Turbopack.
   * MapCanvas loads it at runtime from the CDN script tag in layout.tsx.
   * This avoids the ESM/memory issues with bundling MapLibre v6.
   */

  // Security headers for a decision-support tool
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
