/**
 * Vitest global test setup.
 *
 * Enforces engine invariants as suite-level guards:
 *   - No test should import from data/historical/fani/actual/ (post-event firewall)
 *   - Weight sums are validated at module load (caught by config/index.ts)
 */

import { expect } from "vitest";

// Custom matcher: value is in [0, 1]
expect.extend({
  toBeUnitInterval(received: unknown) {
    const pass =
      typeof received === "number" && received >= 0 && received <= 1;
    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} NOT to be in [0, 1]`
          : `Expected ${received} to be in [0, 1] (unit interval)`,
    };
  },
});

// Extend TypeScript types for custom matcher
declare module "vitest" {
  interface Assertion {
    toBeUnitInterval(): void;
  }
  interface AsymmetricMatchersContaining {
    toBeUnitInterval(): void;
  }
}
