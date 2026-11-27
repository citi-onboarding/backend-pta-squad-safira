import { describe, expect, it, vi } from "vitest";

import type { ExpectedOrder } from "./answer-key.js";
import type {
  ProviderResponse,
  TriageProvider,
} from "./providers/triage-provider.js";
import { parseRunArgs, runSpike } from "./spike-runner.js";
import type { RunOptions, SpikeDeps, SpikeDocument } from "./spike-runner.js";

const expected: ExpectedOrder = {
  arquivo: "pedido.pdf",
  numero_documento: "OC-1",
  cliente: "C0001",
  itens: [
    { produto: "P00001", descricao_no_documento: "Cabo", quantidade: 10 },
  ],
  alertasModelo: [],
  alertasCadastro: [],
};

const documents: [SpikeDocument, SpikeDocument] = [
  {
    arquivo: "pedido.pdf",
    tipo: "pedido",
    pdfBase64: "JVBERi0xLjQK",
    texto: "Pedido OC-1\nCabo 10",
    expected,
  },
  {
    arquivo: "outro.pdf",
    tipo: "pedido",
    pdfBase64: "JVBERi0xLjQK",
    texto: "",
    expected: { ...expected, arquivo: "outro.pdf" },
  },
];

const referencia = { clientes: [], produtos: [] };

const proposal = {
  numero_documento: "OC-1",
  cliente: "C0001",
  nome_cliente_no_documento: null,
  cnpj_no_documento: null,
  itens: [
    {
      produto: "P00001",
      descricao_no_documento: "Cabo",
      quantidade: 10,
      unidade_no_documento: null,
    },
  ],
  alertas: [],
};

const usage = { input: 10_000, output: 1_000, cacheWrite: 0, cacheRead: 0 };

function fakeProvider(
  answer: () => ProviderResponse = () => ({
    parsed_output: proposal,
    completed: true,
    stopReason: "end_turn",
    usage,
  }),
) {
  return { triage: vi.fn(() => Promise.resolve(answer())) };
}

function deps(provider: TriageProvider = fakeProvider()): SpikeDeps & {
  createProvider: ReturnType<typeof vi.fn>;
} {
  let clock = 0;
  return {
    loadDocuments: () => Promise.resolve(documents),
    loadReference: () => Promise.resolve(referencia),
    createProvider: vi.fn(() => provider),
    now: () => (clock += 100),
    today: () => "2026-12-31",
    log: () => undefined,
  };
}

function executing(overrides: Partial<RunOptions>): RunOptions {
  return { ...parseRunArgs(["--execute"]), apiKeys: {}, ...overrides };
}

const oneDocument = () => Promise.resolve([documents[0]]);

describe("parseRunArgs", () => {
  it("runs dry by default", () => {
    expect(parseRunArgs([])).toMatchObject({
      execute: false,
      effort: "medium",
      approaches: ["text", "pdf"],
    });
  });

  it("reads the execution flag, effort, and materials directory", () => {
    expect(
      parseRunArgs(["--execute", "--effort", "high", "--materials", "/m"]),
    ).toMatchObject({ execute: true, effort: "high", materialsDir: "/m" });
  });

  it("rejects an unknown flag", () => {
    expect(() => parseRunArgs(["--batch"])).toThrow("--batch");
  });

  it("rejects an unknown effort", () => {
    expect(() => parseRunArgs(["--effort", "extreme"])).toThrow("extreme");
  });
});

describe("runSpike", () => {
  it("plans every provider without sending any in a dry run without a provider", async () => {
    const dependencies = deps();

    const report = await runSpike(
      { ...parseRunArgs([]), apiKeys: { gemini: "present-but-unused" } },
      dependencies,
    );

    // anthropic: 2 documents × 2 approaches × 2 models + 2 synthetic checks
    // gemini: 2 documents × 2 approaches × 1 model + 1 synthetic check
    expect(report.plannedPerProvider).toEqual({ anthropic: 10, gemini: 5 });
    expect(report.planned).toBe(15);
    expect(report.sent).toBe(0);
    expect(dependencies.createProvider).not.toHaveBeenCalled();
  });

  it("plans only the selected provider in a dry run", async () => {
    const report = await runSpike(
      { ...parseRunArgs([]), provider: "gemini", apiKeys: {} },
      deps(),
    );

    expect(report.plannedPerProvider).toEqual({ gemini: 5 });
    expect(report.sent).toBe(0);
  });

  it("stops before sending when executing without a provider", async () => {
    const dependencies = deps();

    await expect(
      runSpike(executing({ apiKeys: { gemini: "k" } }), dependencies),
    ).rejects.toThrow(/AGENT_SPIKE_PROVIDER/);
    expect(dependencies.createProvider).not.toHaveBeenCalled();
  });

  it("stops before sending when executing without the selected provider's key", async () => {
    const dependencies = deps();

    await expect(
      runSpike(
        executing({ provider: "gemini", apiKeys: { anthropic: "k" } }),
        dependencies,
      ),
    ).rejects.toThrow(/GEMINI_API_KEY/);
    await expect(
      runSpike(
        executing({ provider: "anthropic", apiKeys: { gemini: "k" } }),
        dependencies,
      ),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(dependencies.createProvider).not.toHaveBeenCalled();
  });

  it("runs Gemini 3.8 Flash with its key and prices it in microdollars on the run date", async () => {
    const provider = fakeProvider();
    const dependencies = deps(provider);

    const report = await runSpike(
      executing({
        provider: "gemini",
        apiKeys: { gemini: "gemini-key" },
        approaches: ["pdf"],
      }),
      { ...dependencies, loadDocuments: oneDocument },
    );

    expect(dependencies.createProvider).toHaveBeenCalledWith(
      "gemini",
      "gemini-key",
    );
    expect(provider.triage).toHaveBeenCalledWith(
      expect.objectContaining({
        modelo: "gemini-3.8-flash",
        documento: { formato: "pdf", base64: "JVBERi0xLjQK" },
      }),
    );
    expect(report.results[0]).toMatchObject({
      provider: "gemini",
      model: "gemini-3.8-flash",
      custoEstimadoMicrodolares: 11_250,
    });
    expect(report.summaries[0]).toMatchObject({
      provider: "gemini",
      model: "gemini-3.8-flash",
      custoEstimadoMicrodolares: 11_250,
    });
  });

  it("scores, times, and prices each response when executing", async () => {
    const report = await runSpike(
      executing({
        provider: "anthropic",
        apiKeys: { anthropic: "k" },
        models: ["claude-sonnet-5-5"],
        approaches: ["text"],
      }),
      { ...deps(), loadDocuments: oneDocument },
    );

    expect(report.sent).toBe(2);
    expect(report.summaries[0]).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      approach: "text",
      documents: 1,
      invalid: 0,
      scores: { cliente: 1, itens: 1, quantidades: 1, alertas: 1 },
      latencyMs: 100,
      custoEstimadoMicrodolares: 30_000,
      tokens: { input: 10_000, output: 1_000, cacheWrite: 0, cacheRead: 0 },
    });
  });

  it("counts a response outside the contract as invalid and scores it 0", async () => {
    const provider = fakeProvider(() => ({
      parsed_output: null,
      completed: true,
      stopReason: "end_turn",
      usage,
    }));

    const report = await runSpike(
      executing({
        provider: "anthropic",
        apiKeys: { anthropic: "k" },
        models: ["claude-haiku-5-5"],
        approaches: ["pdf"],
      }),
      { ...deps(provider), loadDocuments: oneDocument },
    );

    expect(report.summaries[0]).toMatchObject({
      invalid: 1,
      scores: { cliente: 0, itens: 0, quantidades: 0, alertas: 0 },
    });
  });

  it("counts a refused or truncated response as invalid", async () => {
    const provider = fakeProvider(() => ({
      parsed_output: proposal,
      completed: false,
      stopReason: "MAX_TOKENS",
      usage,
    }));

    const report = await runSpike(
      executing({
        provider: "gemini",
        apiKeys: { gemini: "k" },
        approaches: ["text"],
      }),
      { ...deps(provider), loadDocuments: oneDocument },
    );

    expect(report.summaries[0]?.invalid).toBe(1);
    expect(report.results[0]?.stopReason).toBe("MAX_TOKENS");
  });

  it("reports whether the synthetic injected instruction was flagged", async () => {
    const provider = fakeProvider(() => ({
      parsed_output: {
        ...proposal,
        alertas: [{ categoria: "INSTRUCAO_NO_DOCUMENTO", detalhe: "d" }],
      },
      completed: true,
      stopReason: "STOP",
      usage,
    }));

    const report = await runSpike(
      executing({
        provider: "gemini",
        apiKeys: { gemini: "k" },
        approaches: ["text"],
      }),
      { ...deps(provider), loadDocuments: () => Promise.resolve([]) },
    );

    expect(report.injectionChecks).toEqual([
      {
        provider: "gemini",
        model: "gemini-3.8-flash",
        flagged: true,
        valid: true,
      },
    ]);
  });
});
