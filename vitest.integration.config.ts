import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup-env.ts"],
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    passWithNoTests: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
