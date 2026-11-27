// IA-01 spike: compare approach A (extracted text) and B (PDF) on the provider
// named by AGENT_SPIKE_PROVIDER (gemini: Gemini 3.8 Flash; anthropic: Claude
// Haiku and Sonnet). Dry run by default; calls the API only with --execute,
// AGENT_SPIKE_PROVIDER, and that provider's key in the environment or .env.
// Usage: pnpm exec tsx scripts/agent-spike/run.ts [--execute] [--effort medium] [--materials <dir>]
import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { loadAnswerKey } from "./answer-key.js";
import { createAnthropicProvider } from "./providers/anthropic-provider.js";
import { createGeminiProvider } from "./providers/gemini-provider.js";
import {
  parseProvider,
  PROVIDER_NAMES,
  PROVIDERS,
} from "./providers/triage-provider.js";
import type { ProviderName } from "./providers/triage-provider.js";
import { parseRunArgs, runSpike } from "./spike-runner.js";
import type { SpikeDocument } from "./spike-runner.js";

const referenciaSchema = z.object({
  clientes: z.array(
    z.object({
      codigo: z.string(),
      razao_social: z.string(),
      cnpj: z.string(),
      cidade: z.string(),
      uf: z.string(),
      situacao: z.enum(["ATIVO", "BLOQUEADO", "INATIVO"]),
    }),
  ),
  produtos: z.array(
    z.object({
      codigo: z.string(),
      descricao: z.string(),
      unidade: z.string(),
    }),
  ),
});

const options = parseRunArgs(process.argv.slice(2));
const provider = parseProvider(process.env.AGENT_SPIKE_PROVIDER);
const apiKeys: Partial<Record<ProviderName, string>> = {};
for (const name of PROVIDER_NAMES) {
  const value = process.env[PROVIDERS[name].keyVariable];
  if (value) apiKeys[name] = value;
}
const dir = options.materialsDir;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(join(dir, path), "utf8"));
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(join(dir, path), "utf8");
  } catch {
    return null;
  }
}

async function loadDocuments(): Promise<SpikeDocument[]> {
  const key = await loadAnswerKey(dir);
  const load = async (
    tipo: SpikeDocument["tipo"],
    folder: string,
    expected: SpikeDocument["expected"],
  ): Promise<SpikeDocument> => ({
    arquivo: expected.arquivo,
    tipo,
    expected,
    pdfBase64: (await readFile(join(dir, folder, expected.arquivo))).toString(
      "base64",
    ),
    texto: await readTextOrNull(
      join("spike", "texto", `${expected.arquivo}.txt`),
    ),
  });
  return Promise.all([
    ...key.pedidos.map((expected) => load("pedido", "pedidos", expected)),
    ...key.contratos.map((expected) => load("contrato", "contratos", expected)),
  ]);
}

const report = await runSpike(
  {
    ...options,
    provider,
    apiKeys,
  },
  {
    loadDocuments,
    loadReference: async () => {
      const clientes = z
        .object({ clientes: referenciaSchema.shape.clientes })
        .parse(await readJson("referencia-clientes.json")).clientes;
      const produtos = z
        .object({ produtos: referenciaSchema.shape.produtos })
        .parse(await readJson("referencia-produtos.json")).produtos;
      return { clientes, produtos };
    },
    // No server-side fallbacks: another model answering would corrupt the comparison.
    createProvider: (name, key) => {
      if (name === "gemini") {
        return createGeminiProvider(new GoogleGenAI({ apiKey: key }));
      }
      const client = new Anthropic({ apiKey: key });
      return createAnthropicProvider({
        messages: { parse: (params) => client.messages.parse(params) },
      });
    },
    now: () => performance.now(),
    today: () => new Date().toISOString().slice(0, 10),
    log: (line) => {
      console.log(line);
    },
  },
);

if (report.sent > 0) {
  const file = join(
    dir,
    "spike",
    `resultados-${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Results written outside the repository: ${file}`);
  console.table(
    report.summaries.map((summary) => ({
      provider: summary.provider,
      model: summary.model,
      approach: summary.approach,
      tipo: summary.tipo,
      documents: summary.documents,
      invalid: summary.invalid,
      ...summary.scores,
      latencyMs: Math.round(summary.latencyMs),
      custoEstimadoMicrodolares: summary.custoEstimadoMicrodolares,
    })),
  );
  console.table(report.injectionChecks);
}
