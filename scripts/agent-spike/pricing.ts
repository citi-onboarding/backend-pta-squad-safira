/** Prices in USD per million tokens, as published on the official page. */
interface Rates {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
}

interface ModelPricing {
  base: Rates;
  /** Rates for every token of a request whose prompt exceeds the threshold. */
  longPrompt?: { thresholdTokens: number; rates: Rates };
}

export const PRICING = {
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  checkedOn: "2026-11-25",
  models: {
    "claude-haiku-5-5": {
      base: { input: 0.1, output: 0.5, cacheWrite5m: 0.125, cacheRead: 0.01 },
      longPrompt: {
        thresholdTokens: 100_000,
        rates: {
          input: 0.5,
          output: 2.5,
          cacheWrite5m: 0.625,
          cacheRead: 0.05,
        },
      },
    },
    "claude-sonnet-5-5": {
      base: { input: 2, output: 10, cacheWrite5m: 2.5, cacheRead: 0.1 },
    },
  } satisfies Record<string, ModelPricing>,
} as const;

export type PricedModel = keyof typeof PRICING.models;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
}

function isPriced(model: string): model is PricedModel {
  return Object.hasOwn(PRICING.models, model);
}

export function costOf(model: string, usage: TokenUsage): number {
  if (!isPriced(model)) {
    throw new Error(`No checked price for ${model}.`);
  }
  const pricing: ModelPricing = PRICING.models[model];
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const prompt = usage.input_tokens + cacheWrite + cacheRead;
  const rates =
    pricing.longPrompt && prompt > pricing.longPrompt.thresholdTokens
      ? pricing.longPrompt.rates
      : pricing.base;

  return (
    (usage.input_tokens * rates.input +
      usage.output_tokens * rates.output +
      cacheWrite * rates.cacheWrite5m +
      cacheRead * rates.cacheRead) /
    1_000_000
  );
}
