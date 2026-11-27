import type { TriageRequestInput } from "../../../src/modules/triage/triage-request.js";

export type ProviderName = "anthropic" | "gemini";

/** Tokens billed at each rate, whatever the provider calls them. */
export interface TokenUsage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface ProviderResponse {
  parsed_output: unknown;
  /** True only when the model finished normally (not refused or truncated). */
  completed: boolean;
  stopReason: string | null;
  usage: TokenUsage;
}

export interface TriageProvider {
  triage(input: TriageRequestInput): Promise<ProviderResponse>;
}

export interface ProviderInfo {
  keyVariable: string;
  defaultModels: readonly string[];
}

export const PROVIDERS: Record<ProviderName, ProviderInfo> = {
  anthropic: {
    keyVariable: "ANTHROPIC_API_KEY",
    defaultModels: ["claude-haiku-5-5", "claude-sonnet-5-5"],
  },
  gemini: {
    keyVariable: "GEMINI_API_KEY",
    defaultModels: ["gemini-3.8-flash"],
  },
};

export const PROVIDER_NAMES = Object.keys(PROVIDERS) as ProviderName[];

/** Reads `AGENT_SPIKE_PROVIDER`; missing or empty means no provider selected. */
export function parseProvider(
  value: string | undefined,
): ProviderName | undefined {
  if (value === undefined || value === "") return undefined;
  const provider = PROVIDER_NAMES.find((name) => name === value);
  if (!provider) {
    throw new Error(`Unknown AGENT_SPIKE_PROVIDER: ${value}`);
  }
  return provider;
}
