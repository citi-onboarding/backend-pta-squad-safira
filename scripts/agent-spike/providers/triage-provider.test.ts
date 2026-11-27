import { describe, expect, it } from "vitest";

import { parseProvider, PROVIDERS } from "./triage-provider.js";

describe("parseProvider", () => {
  it("accepts gemini and anthropic", () => {
    expect(parseProvider("gemini")).toBe("gemini");
    expect(parseProvider("anthropic")).toBe("anthropic");
  });

  it("treats a missing or empty value as no provider", () => {
    expect(parseProvider(undefined)).toBeUndefined();
    expect(parseProvider("")).toBeUndefined();
  });

  it("rejects any other value, naming it", () => {
    expect(() => parseProvider("openai")).toThrow(
      "Unknown AGENT_SPIKE_PROVIDER: openai",
    );
  });
});

describe("PROVIDERS", () => {
  it("runs Gemini 3.8 Flash with GEMINI_API_KEY", () => {
    expect(PROVIDERS.gemini).toEqual({
      keyVariable: "GEMINI_API_KEY",
      defaultModels: ["gemini-3.8-flash"],
    });
  });

  it("runs Claude Haiku 5.5 and Sonnet 5.5 with ANTHROPIC_API_KEY", () => {
    expect(PROVIDERS.anthropic).toEqual({
      keyVariable: "ANTHROPIC_API_KEY",
      defaultModels: ["claude-haiku-5-5", "claude-sonnet-5-5"],
    });
  });
});
