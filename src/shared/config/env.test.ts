import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./env.js";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test",
  CORS_ORIGINS: "http://localhost:5173, https://example.com ",
};

describe("parseEnvironment", () => {
  it("parses defaults and a comma-separated CORS allowlist", () => {
    const environment = parseEnvironment(validEnvironment);

    expect(environment.SERVER_PORT).toBe(3001);
    expect(environment.corsOrigins).toEqual([
      "http://localhost:5173",
      "https://example.com",
    ]);
  });

  it("rejects invalid database URLs", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: "mysql://localhost/test",
      }),
    ).toThrow();
  });

  it("rejects an empty CORS allowlist", () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, CORS_ORIGINS: " , " }),
    ).toThrow("CORS_ORIGINS must contain at least one origin.");
  });

  it("accepts a missing model key", () => {
    const environment = parseEnvironment(validEnvironment);

    expect(environment.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("exposes a non-empty model key", () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      ANTHROPIC_API_KEY: "model-test-key",
    });

    expect(environment.ANTHROPIC_API_KEY).toBe("model-test-key");
  });

  it("rejects an empty model key", () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, ANTHROPIC_API_KEY: "" }),
    ).toThrow();
  });
});
