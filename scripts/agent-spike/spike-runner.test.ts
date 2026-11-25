import { describe, expect, it, vi } from "vitest";

import type { ExpectedOrder } from "./answer-key.js";
import { parseRunArgs, runSpike } from "./spike-runner.js";
import type { SpikeClient, SpikeDeps, SpikeDocument } from "./spike-runner.js";

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

const usage = {
  input_tokens: 10_000,
  output_tokens: 1_000,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

function deps(client?: SpikeClient): SpikeDeps & {
  createClient: ReturnType<typeof vi.fn>;
} {
  let clock = 0;
  return {
    loadDocuments: () => Promise.resolve(documents),
    loadReference: () => Promise.resolve(referencia),
    createClient: vi.fn(() => client ?? fakeClient()),
    now: () => (clock += 100),
    log: () => undefined,
  };
}

function fakeClient(
  answer: () => unknown = () => ({
    parsed_output: proposal,
    stop_reason: "end_turn",
    usage,
  }),
): SpikeClient {
  return {
    messages: { parse: vi.fn(() => Promise.resolve(answer())) },
  } as unknown as SpikeClient;
}

describe("parseRunArgs", () => {
  it("runs dry by default", () => {
    expect(parseRunArgs([])).toMatchObject({
      execute: false,
      effort: "medium",
      models: ["claude-haiku-5-5", "claude-sonnet-5-5"],
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
  it("plans every request without sending any in a dry run", async () => {
    const dependencies = deps();

    const report = await runSpike(
      { ...parseRunArgs([]), apiKey: "present-but-unused" },
      dependencies,
    );

    // 2 documents × 2 approaches × 2 models + 1 synthetic check × 2 models
    expect(report.planned).toBe(10);
    expect(report.sent).toBe(0);
    expect(dependencies.createClient).not.toHaveBeenCalled();
  });

  it("stops before sending when executing without a key", async () => {
    const dependencies = deps();

    await expect(
      runSpike({ ...parseRunArgs(["--execute"]) }, dependencies),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(dependencies.createClient).not.toHaveBeenCalled();
  });

  it("scores, times, and prices each response when executing", async () => {
    const client = fakeClient();
    const dependencies = deps(client);

    const report = await runSpike(
      {
        ...parseRunArgs(["--execute"]),
        apiKey: "k",
        models: ["claude-sonnet-5-5"],
        approaches: ["text"],
      },
      {
        ...dependencies,
        loadDocuments: () => Promise.resolve([documents[0]]),
      },
    );

    expect(report.sent).toBe(2);
    const [summary] = report.summaries;
    expect(summary).toMatchObject({
      model: "claude-sonnet-5-5",
      approach: "text",
      documents: 1,
      invalid: 0,
      scores: { cliente: 1, itens: 1, quantidades: 1, alertas: 1 },
      latencyMs: 100,
    });
    expect(summary?.costUsd).toBeCloseTo(0.03, 10);
  });

  it("counts a response outside the contract as invalid and scores it 0", async () => {
    const client = fakeClient(() => ({
      parsed_output: null,
      stop_reason: "end_turn",
      usage,
    }));

    const report = await runSpike(
      {
        ...parseRunArgs(["--execute"]),
        apiKey: "k",
        models: ["claude-haiku-5-5"],
        approaches: ["pdf"],
      },
      {
        ...deps(client),
        loadDocuments: () => Promise.resolve([documents[0]]),
      },
    );

    expect(report.summaries[0]).toMatchObject({
      invalid: 1,
      scores: { cliente: 0, itens: 0, quantidades: 0, alertas: 0 },
    });
  });

  it("counts a refused or truncated response as invalid", async () => {
    const client = fakeClient(() => ({
      parsed_output: proposal,
      stop_reason: "max_tokens",
      usage,
    }));

    const report = await runSpike(
      {
        ...parseRunArgs(["--execute"]),
        apiKey: "k",
        models: ["claude-haiku-5-5"],
        approaches: ["text"],
      },
      {
        ...deps(client),
        loadDocuments: () => Promise.resolve([documents[0]]),
      },
    );

    expect(report.summaries[0]?.invalid).toBe(1);
  });

  it("reports whether the synthetic injected instruction was flagged", async () => {
    const client = fakeClient(() => ({
      parsed_output: {
        ...proposal,
        alertas: [{ categoria: "INSTRUCAO_NO_DOCUMENTO", detalhe: "d" }],
      },
      stop_reason: "end_turn",
      usage,
    }));

    const report = await runSpike(
      {
        ...parseRunArgs(["--execute"]),
        apiKey: "k",
        models: ["claude-haiku-5-5"],
        approaches: ["text"],
      },
      { ...deps(client), loadDocuments: () => Promise.resolve([]) },
    );

    expect(report.injectionChecks).toEqual([
      { model: "claude-haiku-5-5", flagged: true, valid: true },
    ]);
  });
});
