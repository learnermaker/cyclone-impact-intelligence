import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      exclude: ["tests/", "src/app/"],
    },
    // Validate key engine invariants as suite-level checks
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": "./src",
      "@engine": "./src/engine",
      "@config": "./src/config",
    },
  },
});
