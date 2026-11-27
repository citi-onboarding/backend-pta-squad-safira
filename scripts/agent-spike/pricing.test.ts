import { describe, expect, it } from "vitest";

import { costOf, PRICING } from "./pricing.js";

const usage = (
  input: number,
  output: number,
  cacheWrite = 0,
  cacheRead = 0,
) => ({ input, output, cacheWrite, cacheRead });

const ON = "2026-11-27";

describe("costOf", () => {
  it("prices Claude Sonnet 5.5 from token usage in microdollars", () => {
    // 10k × $2 + 1k × $10 per MTok = US$ 0.03
    expect(costOf("claude-sonnet-5-5", usage(10_000, 1_000), ON)).toBe(30_000);
  });

  it("prices cache writes and reads", () => {
    // 1M write × $2.50 + 1M read × $0.10
    expect(
      costOf("claude-sonnet-5-5", usage(0, 0, 1_000_000, 1_000_000), ON),
    ).toBe(2_600_000);
  });

  it("prices a short Claude Haiku 5.5 prompt at the base rates", () => {
    expect(costOf("claude-haiku-5-5", usage(100_000, 1_000), ON)).toBe(10_500);
  });

  it("prices every token of a long Claude Haiku 5.5 prompt at the long-prompt rates", () => {
    // prompt = 90k input + 20k cache read = 110k > 100k
    // 90k × 0.5 + 20k × 0.05 + 2k × 2.5
    expect(
      costOf("claude-haiku-5-5", usage(90_000, 2_000, 0, 20_000), ON),
    ).toBe(51_000);
  });

  it("prices Gemini 3.8 Flash at the price in force through 2026-12-31", () => {
    // 10k × $0.75 + 1k × $3.75 per MTok
    expect(costOf("gemini-3.8-flash", usage(10_000, 1_000), "2026-12-31")).toBe(
      11_250,
    );
  });

  it("prices Gemini 3.8 Flash at the price in force from 2027-01-01", () => {
    // 10k × $1.50 + 1k × $7.50 per MTok
    expect(costOf("gemini-3.8-flash", usage(10_000, 1_000), "2027-01-01")).toBe(
      22_500,
    );
  });

  it("prices Gemini cached tokens at the cache-read price", () => {
    // 10k × 0.75 + 1k × 3.75 + 2k × 0.075
    expect(costOf("gemini-3.8-flash", usage(10_000, 1_000, 0, 2_000), ON)).toBe(
      11_400,
    );
  });

  it("rounds a fractional cost to the nearest microdollar", () => {
    // Haiku input $0.10 per MTok: 7 tokens = 0.7 µ$, 4 tokens = 0.4 µ$
    expect(costOf("claude-haiku-5-5", usage(7, 0), ON)).toBe(1);
    expect(costOf("claude-haiku-5-5", usage(4, 0), ON)).toBe(0);
  });

  it("returns whole microdollars", () => {
    expect(
      Number.isInteger(
        costOf("claude-haiku-5-5", usage(12_345, 678, 9, 10), ON),
      ),
    ).toBe(true);
  });

  it("rejects a model without a checked price", () => {
    expect(() => costOf("claude-opus-5-5", usage(1, 1), ON)).toThrow(
      "No checked price for claude-opus-5-5",
    );
  });

  it("rejects a run date before the prices were checked", () => {
    expect(() => costOf("gemini-3.8-flash", usage(1, 1), "2026-11-01")).toThrow(
      "No checked price for gemini-3.8-flash on 2026-11-01",
    );
  });

  it("records where and when each price was checked", () => {
    expect(PRICING["claude-sonnet-5-5"]).toMatchObject({
      source: "https://platform.claude.com/docs/en/about-claude/pricing",
      checkedOn: "2026-11-25",
    });
    expect(PRICING["gemini-3.8-flash"]).toMatchObject({
      source: "https://aistudio.google.com/docs/pricing",
      checkedOn: "2026-11-27",
    });
  });
});
