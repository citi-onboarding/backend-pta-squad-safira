import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup-env.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/shared/**/*.ts"],
      exclude: ["src/shared/database/generated/**"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
