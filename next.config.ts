import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MapLibre GL v6 is ESM-only — transpile so Next.js server build can handle it
  transpilePackages: ["maplibre-gl"],

  // Expose only safe, non-secret env vars to the browser
  env: {
    NEXT_PUBLIC_MAP_STYLE_URL: process.env.MAP_STYLE_URL ?? "",
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "0.1.0",
  },

  // Engine runs server-side; h3-js WASM needs async experiments when
  // it would be bundled for the browser — keep it server-only to avoid this.
  serverExternalPackages: ["h3-js"],

  webpack(config) {
    // Support async WebAssembly (needed if h3-js ever ships browser bundle)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },

  // Strict security headers for a decision-support tool
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
