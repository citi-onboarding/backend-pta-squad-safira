import { describe, expect, it, vi } from "vitest";

import { buildTriageRequest } from "../../../src/modules/triage/triage-request.js";
import type { TriageRequestInput } from "../../../src/modules/triage/triage-request.js";
import { createAnthropicProvider } from "./anthropic-provider.js";
import type { AnthropicMessagesClient } from "./anthropic-provider.js";

type AnthropicResponse = Awaited<
  ReturnType<AnthropicMessagesClient["messages"]["parse"]>
>;

const input: TriageRequestInput = {
  tipo: "pedido",
  modelo: "claude-haiku-5-5",
  effort: "medium",
  documento: { formato: "texto", texto: "Pedido OC-1" },
  referencia: { clientes: [], produtos: [] },
};

function fakeClient(response: AnthropicResponse) {
  return {
    messages: {
      parse: vi.fn(
        (
          _params: Parameters<AnthropicMessagesClient["messages"]["parse"]>[0],
        ) => Promise.resolve(response),
      ),
    },
  };
}

describe("createAnthropicProvider", () => {
  it("sends the triage request built for the document", async () => {
    const client = fakeClient({
      parsed_output: {},
      stop_reason: "end_turn",
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    });

    await createAnthropicProvider(client).triage(input);

    // The output format carries functions, so compare its data fields.
    const sent = client.messages.parse.mock.calls[0]?.[0];
    const built = buildTriageRequest(input);
    expect(sent).toMatchObject({
      model: built.model,
      max_tokens: built.max_tokens,
      system: built.system,
      messages: built.messages,
      output_config: {
        effort: built.output_config.effort,
        format: { schema: built.output_config.format.schema },
      },
    });
  });

  it("maps a finished response and its usage", async () => {
    const provider = createAnthropicProvider(
      fakeClient({
        parsed_output: { numero_documento: "OC-1" },
        stop_reason: "end_turn",
        usage: {
          input_tokens: 10_000,
          output_tokens: 1_000,
          cache_creation_input_tokens: 300,
          cache_read_input_tokens: 200,
        },
      }),
    );

    await expect(provider.triage(input)).resolves.toEqual({
      parsed_output: { numero_documento: "OC-1" },
      completed: true,
      stopReason: "end_turn",
      usage: { input: 10_000, output: 1_000, cacheWrite: 300, cacheRead: 200 },
    });
  });

  it("marks a truncated response as not completed and counts missing cache as zero", async () => {
    const provider = createAnthropicProvider(
      fakeClient({
        parsed_output: null,
        stop_reason: "max_tokens",
        usage: {
          input_tokens: 5,
          output_tokens: 6,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
        },
      }),
    );

    await expect(provider.triage(input)).resolves.toMatchObject({
      completed: false,
      stopReason: "max_tokens",
      usage: { input: 5, output: 6, cacheWrite: 0, cacheRead: 0 },
    });
  });
});
