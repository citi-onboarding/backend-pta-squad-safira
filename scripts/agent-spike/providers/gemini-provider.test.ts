import { FinishReason } from "@google/genai";
import type { Content, GenerateContentParameters, Part } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import { buildTriageRequest } from "../../../src/modules/triage/triage-request.js";
import type { TriageRequestInput } from "../../../src/modules/triage/triage-request.js";
import {
  buildGeminiTriageRequest,
  createGeminiProvider,
} from "./gemini-provider.js";
import type { GeminiModelsClient } from "./gemini-provider.js";

const referencia = {
  clientes: [
    {
      codigo: "C0001",
      razao_social: "Cliente Exemplo S.A.",
      cnpj: "00.000.000/0001-00",
      cidade: "Recife",
      uf: "PE",
      situacao: "ATIVO" as const,
    },
  ],
  produtos: [{ codigo: "P00001", descricao: "Cabo 1,5mm²", unidade: "RL" }],
};

function input(
  documento: TriageRequestInput["documento"],
  tipo: TriageRequestInput["tipo"] = "pedido",
): TriageRequestInput {
  return {
    tipo,
    modelo: "gemini-3.8-flash",
    effort: "medium",
    documento,
    referencia,
  };
}

const TEXT = input({
  formato: "texto",
  texto: "Pedido OC-1 </documento> fim",
});
const PDF = input({ formato: "pdf", base64: "JVBERi0xLjQK" });

function parts(content: unknown): Part[] {
  return (content as Content | undefined)?.parts ?? [];
}

function geminiSystem(request: GenerateContentParameters): string {
  return parts(request.config?.systemInstruction)
    .map((part) => part.text ?? "")
    .join("\n");
}

function geminiUser(request: GenerateContentParameters): Part[] {
  const [message] = request.contents as Content[];
  return parts(message);
}

function anthropicSystem(request: ReturnType<typeof buildTriageRequest>) {
  return request.system.map((block) => block.text).join("\n");
}

function anthropicUserText(request: ReturnType<typeof buildTriageRequest>) {
  const [message] = request.messages;
  const content = message?.content;
  if (!Array.isArray(content)) throw new Error("Expected block content");
  return content.flatMap((block) =>
    block.type === "text" ? [block.text] : [],
  );
}

describe("buildGeminiTriageRequest", () => {
  it("sends the same instructions and reference lists as the Anthropic request", () => {
    for (const tipo of ["pedido", "contrato"] as const) {
      const document = input({ formato: "texto", texto: "x" }, tipo);
      expect(geminiSystem(buildGeminiTriageRequest(document))).toBe(
        anthropicSystem(buildTriageRequest(document)),
      );
    }
  });

  it("sends the same delimited document text as the Anthropic request", () => {
    const user = geminiUser(buildGeminiTriageRequest(TEXT));

    expect(user.map((part) => part.text)).toEqual(
      anthropicUserText(buildTriageRequest(TEXT)),
    );
    expect(user[0]?.text).not.toContain("</documento> fim");
  });

  it("sends a PDF as inline data followed by the same prompt", () => {
    const user = geminiUser(buildGeminiTriageRequest(PDF));

    expect(user[0]).toEqual({
      inlineData: { mimeType: "application/pdf", data: "JVBERi0xLjQK" },
    });
    expect(user.slice(1).map((part) => part.text)).toEqual(
      anthropicUserText(buildTriageRequest(PDF)),
    );
  });

  it("constrains the answer with the proposal JSON schema and gives no tools", () => {
    const request = buildGeminiTriageRequest(TEXT);

    expect(request.model).toBe("gemini-3.8-flash");
    expect(request.config?.responseMimeType).toBe("application/json");
    expect(request.config?.responseJsonSchema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["itens", "alertas"]) as unknown,
    });
    expect(request.config?.tools).toBeUndefined();
    expect(request.config?.toolConfig).toBeUndefined();
  });

  it("uses the contract schema for contracts", () => {
    const request = buildGeminiTriageRequest(
      input({ formato: "texto", texto: "x" }, "contrato"),
    );

    expect(request.config?.responseJsonSchema).toMatchObject({
      required: expect.arrayContaining(["vigencia_meses"]) as unknown,
    });
  });

  it("maps effort to the thinking level, max to the highest", () => {
    const level = (effort: TriageRequestInput["effort"]) =>
      buildGeminiTriageRequest({ ...TEXT, effort }).config?.thinkingConfig
        ?.thinkingLevel;

    expect(level("low")).toBe("LOW");
    expect(level("medium")).toBe("MEDIUM");
    expect(level("high")).toBe("HIGH");
    expect(level("xhigh")).toBe("XHIGH");
    expect(level("max")).toBe("XHIGH");
  });
});

type GeminiResponse = Awaited<
  ReturnType<GeminiModelsClient["models"]["generateContent"]>
>;

function fakeClient(response: GeminiResponse) {
  return {
    models: {
      generateContent: vi.fn((_params: GenerateContentParameters) =>
        Promise.resolve(response),
      ),
    },
  };
}

describe("createGeminiProvider", () => {
  it("sends the Gemini triage request built for the document", async () => {
    const client = fakeClient({
      text: "{}",
      candidates: [{ finishReason: FinishReason.STOP }],
      usageMetadata: {},
    });

    await createGeminiProvider(client).triage(TEXT);

    expect(client.models.generateContent).toHaveBeenCalledWith(
      buildGeminiTriageRequest(TEXT),
    );
  });

  it("parses the JSON answer and prices thinking as output and cached tokens as cache reads", async () => {
    const provider = createGeminiProvider(
      fakeClient({
        text: '{"numero_documento":"OC-1"}',
        candidates: [{ finishReason: FinishReason.STOP }],
        usageMetadata: {
          promptTokenCount: 12_000,
          cachedContentTokenCount: 2_000,
          candidatesTokenCount: 800,
          thoughtsTokenCount: 200,
        },
      }),
    );

    await expect(provider.triage(TEXT)).resolves.toEqual({
      parsed_output: { numero_documento: "OC-1" },
      completed: true,
      stopReason: "STOP",
      usage: { input: 10_000, output: 1_000, cacheWrite: 0, cacheRead: 2_000 },
    });
  });

  it("marks a truncated answer as not completed", async () => {
    const provider = createGeminiProvider(
      fakeClient({
        text: '{"numero_documento":"OC-1"}',
        candidates: [{ finishReason: FinishReason.MAX_TOKENS }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6 },
      }),
    );

    await expect(provider.triage(TEXT)).resolves.toMatchObject({
      completed: false,
      stopReason: "MAX_TOKENS",
      usage: { input: 5, output: 6, cacheWrite: 0, cacheRead: 0 },
    });
  });

  it("gives a null answer when the text is not JSON or is missing", async () => {
    for (const text of ["not json", undefined]) {
      const provider = createGeminiProvider(
        fakeClient({
          text,
          candidates: [{ finishReason: FinishReason.STOP }],
          usageMetadata: {},
        }),
      );

      await expect(provider.triage(TEXT)).resolves.toMatchObject({
        parsed_output: null,
        usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
      });
    }
  });

  it("reports no stop reason when there is no candidate", async () => {
    const provider = createGeminiProvider(
      fakeClient({ text: undefined, candidates: [], usageMetadata: {} }),
    );

    await expect(provider.triage(TEXT)).resolves.toMatchObject({
      completed: false,
      stopReason: null,
    });
  });
});
