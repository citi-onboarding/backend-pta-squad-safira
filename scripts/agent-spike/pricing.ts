import type { TokenUsage } from "./providers/triage-provider.js";

/** Prices in USD per million tokens, as published on the official page. */
interface Rates {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

interface PricePeriod {
  /** First day (YYYY-MM-DD) the prices apply; the check date when none earlier is known. */
  from: string;
  /** Last day (YYYY-MM-DD) the prices apply; open-ended when absent. */
  until?: string;
  base: Rates;
  /** Rates for every token of a request whose prompt exceeds the threshold. */
  longPrompt?: { thresholdTokens: number; rates: Rates };
}

interface ModelPricing {
  source: string;
  checkedOn: string;
  periods: readonly PricePeriod[];
}

const CLAUDE_SOURCE =
  "https://platform.claude.com/docs/en/about-claude/pricing";
const CLAUDE_CHECKED_ON = "2026-11-25";
const GEMINI_SOURCE = "https://aistudio.google.com/docs/pricing";
const GEMINI_CHECKED_ON = "2026-11-27";

export const PRICING: Record<string, ModelPricing> = {
  "claude-haiku-5-5": {
    source: CLAUDE_SOURCE,
    checkedOn: CLAUDE_CHECKED_ON,
    periods: [
      {
        from: CLAUDE_CHECKED_ON,
        base: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
        longPrompt: {
          thresholdTokens: 100_000,
          rates: {
            input: 0.5,
            output: 2.5,
            cacheWrite: 0.625,
            cacheRead: 0.05,
          },
        },
      },
    ],
  },
  "claude-sonnet-5-5": {
    source: CLAUDE_SOURCE,
    checkedOn: CLAUDE_CHECKED_ON,
    periods: [
      {
        from: CLAUDE_CHECKED_ON,
        base: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
      },
    ],
  },
  // Paid tier, Standard. Output includes thinking tokens. No cache writes
  // (implicit caching); explicit-cache storage is not used by the spike.
  "gemini-3.8-flash": {
    source: GEMINI_SOURCE,
    checkedOn: GEMINI_CHECKED_ON,
    periods: [
      {
        from: GEMINI_CHECKED_ON,
        until: "2026-12-31",
        base: { input: 0.75, output: 3.75, cacheWrite: 0, cacheRead: 0.075 },
      },
      {
        from: "2027-01-01",
        base: { input: 1.5, output: 7.5, cacheWrite: 0, cacheRead: 0.15 },
      },
    ],
  },
};

/**
 * Cost of one request in integer microdollars (`custoEstimadoMicrodolares`):
 * tokens × USD per million tokens is already in millionths of a dollar.
 * `onDate` (YYYY-MM-DD) picks the price period in force.
 */
export function costOf(
  model: string,
  usage: TokenUsage,
  onDate: string,
): number {
  const pricing = Object.hasOwn(PRICING, model) ? PRICING[model] : undefined;
  if (!pricing) {
    throw new Error(`No checked price for ${model}.`);
  }
  const period = pricing.periods.find(
    ({ from, until }) =>
      from <= onDate && (until === undefined || onDate <= until),
  );
  if (!period) {
    throw new Error(`No checked price for ${model} on ${onDate}.`);
  }
  const prompt = usage.input + usage.cacheWrite + usage.cacheRead;
  const rates =
    period.longPrompt && prompt > period.longPrompt.thresholdTokens
      ? period.longPrompt.rates
      : period.base;

  return Math.round(
    usage.input * rates.input +
      usage.output * rates.output +
      usage.cacheWrite * rates.cacheWrite +
      usage.cacheRead * rates.cacheRead,
  );
}
