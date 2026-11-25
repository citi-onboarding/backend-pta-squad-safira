// IA-01 spike: compare approach A (extracted text) and B (PDF) on Claude Haiku
// and Claude Sonnet. Dry run by default; calls the API only with --execute and
// ANTHROPIC_API_KEY in the environment or .env.
// Usage: pnpm exec tsx scripts/agent-spike/run.ts [--execute] [--effort medium] [--materials <dir>]
import "dotenv/config";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { loadAnswerKey } from "./answer-key.js";
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
const apiKey = process.env.ANTHROPIC_API_KEY;
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
  { ...options, apiKey: apiKey === "" ? undefined : apiKey },
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
    createClient: (key) => {
      const client = new Anthropic({ apiKey: key });
      return { messages: { parse: (params) => client.messages.parse(params) } };
    },
    now: () => performance.now(),
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
      model: summary.model,
      approach: summary.approach,
      tipo: summary.tipo,
      documents: summary.documents,
      invalid: summary.invalid,
      ...summary.scores,
      latencyMs: Math.round(summary.latencyMs),
      costUsd: summary.costUsd.toFixed(4),
    })),
  );
  console.table(report.injectionChecks);
}
