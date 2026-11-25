import { describe, expect, it } from "vitest";

import { costOf, PRICING } from "./pricing.js";

const usage = (
  input: number,
  output: number,
  cacheWrite = 0,
  cacheRead = 0,
) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: cacheWrite,
  cache_read_input_tokens: cacheRead,
});

describe("costOf", () => {
  it("prices Claude Sonnet 5.5 from token usage", () => {
    expect(costOf("claude-sonnet-5-5", usage(10_000, 1_000))).toBeCloseTo(
      0.03,
      10,
    );
  });

  it("prices cache writes and reads", () => {
    // 1M write × $2.50 + 1M read × $0.10
    expect(
      costOf("claude-sonnet-5-5", usage(0, 0, 1_000_000, 1_000_000)),
    ).toBeCloseTo(2.6, 10);
  });

  it("prices a short Claude Haiku 5.5 prompt at the base rates", () => {
    expect(costOf("claude-haiku-5-5", usage(100_000, 1_000))).toBeCloseTo(
      0.0105,
      10,
    );
  });

  it("prices every token of a long Claude Haiku 5.5 prompt at the long-prompt rates", () => {
    // prompt = 90k input + 20k cache read = 110k > 100k
    const expected = (90_000 * 0.5 + 20_000 * 0.05 + 2_000 * 2.5) / 1_000_000;

    expect(
      costOf("claude-haiku-5-5", usage(90_000, 2_000, 0, 20_000)),
    ).toBeCloseTo(expected, 10);
  });

  it("treats missing cache counts as zero", () => {
    expect(
      costOf("claude-sonnet-5-5", {
        input_tokens: 10_000,
        output_tokens: 1_000,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      }),
    ).toBeCloseTo(0.03, 10);
  });

  it("rejects a model without a checked price", () => {
    expect(() => costOf("claude-opus-5-5", usage(1, 1))).toThrow(
      "claude-opus-5-5",
    );
  });

  it("records where and when the prices were checked", () => {
    expect(PRICING.checkedOn).toBe("2026-11-25");
    expect(PRICING.source).toBe(
      "https://platform.claude.com/docs/en/about-claude/pricing",
    );
  });
});
