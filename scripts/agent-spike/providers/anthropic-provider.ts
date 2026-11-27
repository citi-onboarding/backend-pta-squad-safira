import { buildTriageRequest } from "../../../src/modules/triage/triage-request.js";
import type { TriageProvider } from "./triage-provider.js";

interface AnthropicResponse {
  parsed_output: unknown;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number | null;
    cache_read_input_tokens: number | null;
  };
}

/** The part of the Anthropic SDK client the spike uses. */
export interface AnthropicMessagesClient {
  messages: {
    parse(
      params: ReturnType<typeof buildTriageRequest>,
    ): Promise<AnthropicResponse>;
  };
}

export function createAnthropicProvider(
  client: AnthropicMessagesClient,
): TriageProvider {
  return {
    async triage(input) {
      const response = await client.messages.parse(buildTriageRequest(input));
      return {
        parsed_output: response.parsed_output,
        completed: response.stop_reason === "end_turn",
        stopReason: response.stop_reason,
        usage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
          cacheRead: response.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}
