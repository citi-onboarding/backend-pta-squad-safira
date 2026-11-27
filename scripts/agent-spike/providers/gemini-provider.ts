import { FinishReason, ThinkingLevel } from "@google/genai";
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  Part,
} from "@google/genai";
import { z } from "zod";

import {
  documentPrompt,
  MAX_TOKENS,
  proposalSchema,
  referenceBlock,
  triageInstructions,
} from "../../../src/modules/triage/triage-request.js";
import type {
  Effort,
  TriageRequestInput,
} from "../../../src/modules/triage/triage-request.js";
import type { TriageProvider } from "./triage-provider.js";

/** The part of the `@google/genai` client the spike uses. */
export interface GeminiModelsClient {
  models: {
    generateContent(
      params: GenerateContentParameters,
    ): Promise<
      Pick<GenerateContentResponse, "text" | "candidates" | "usageMetadata">
    >;
  };
}

// Gemini has no level above XHIGH, so `max` uses the highest one.
const THINKING_LEVELS: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
  xhigh: ThinkingLevel.XHIGH,
  max: ThinkingLevel.XHIGH,
};

/**
 * Builds a `generateContent` request with the same instructions, reference
 * lists, and document content as the Anthropic request. No tools (RN-19);
 * document content kept apart from the instructions (RN-10); the answer
 * constrained to the proposal contract through a JSON schema.
 */
export function buildGeminiTriageRequest(
  input: TriageRequestInput,
): GenerateContentParameters {
  const prompt: Part = { text: documentPrompt(input.tipo, input.documento) };
  const user: Part[] =
    input.documento.formato === "pdf"
      ? [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: input.documento.base64,
            },
          },
          prompt,
        ]
      : [prompt];

  return {
    model: input.modelo,
    contents: [{ role: "user", parts: user }],
    config: {
      systemInstruction: {
        parts: [
          { text: triageInstructions(input.tipo) },
          { text: referenceBlock(input.referencia) },
        ],
      },
      maxOutputTokens: MAX_TOKENS,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(proposalSchema(input.tipo)),
      thinkingConfig: { thinkingLevel: THINKING_LEVELS[input.effort] },
    },
  };
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createGeminiProvider(
  client: GeminiModelsClient,
): TriageProvider {
  return {
    async triage(input) {
      const response = await client.models.generateContent(
        buildGeminiTriageRequest(input),
      );
      const finishReason = response.candidates?.[0]?.finishReason ?? null;
      const metadata = response.usageMetadata;
      const cacheRead = metadata?.cachedContentTokenCount ?? 0;
      return {
        parsed_output: parseJson(response.text),
        completed: finishReason === FinishReason.STOP,
        stopReason: finishReason,
        usage: {
          // Cached tokens are part of the prompt count but bill at the cache price.
          input: (metadata?.promptTokenCount ?? 0) - cacheRead,
          // Thinking tokens bill as output.
          output:
            (metadata?.candidatesTokenCount ?? 0) +
            (metadata?.thoughtsTokenCount ?? 0),
          cacheWrite: 0,
          cacheRead,
        },
      };
    },
  };
}
