// Approach A, step 1: extract the text of every sample PDF and classify it.
// Usage: pnpm exec tsx scripts/agent-spike/extract-text.ts [--materials <dir>]
// Writes extracted text and metrics under <materials>/spike/ (outside the
// repository) and prints metrics only, never document content.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { extractText, getDocumentProxy } from "unpdf";

import { expectedTermsFor, loadAnswerKey } from "./answer-key.js";
import { classifyExtraction } from "./extraction-quality.js";

const flag = process.argv.indexOf("--materials");
const materialsDir =
  flag >= 0
    ? (process.argv[flag + 1] ?? "")
    : resolve("..", "materiais-distrilux");

const key = await loadAnswerKey(materialsDir);
const outputDir = join(materialsDir, "spike", "texto");
await mkdir(outputDir, { recursive: true });

const documents = [
  ...key.pedidos.map((expected) => ({
    tipo: "pedido" as const,
    folder: "pedidos",
    expected,
  })),
  ...key.contratos.map((expected) => ({
    tipo: "contrato" as const,
    folder: "contratos",
    expected,
  })),
];

const rows = [];
for (const { tipo, folder, expected } of documents) {
  const bytes = await readFile(join(materialsDir, folder, expected.arquivo));
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  await writeFile(join(outputDir, `${expected.arquivo}.txt`), text, "utf8");
  const quality = classifyExtraction({
    text,
    pageCount: totalPages,
    expectedTerms: expectedTermsFor(expected),
  });
  rows.push({
    arquivo: expected.arquivo,
    tipo,
    paginas: totalPages,
    ...quality,
  });
}

await writeFile(
  join(materialsDir, "spike", "extracao.json"),
  `${JSON.stringify(rows, null, 2)}\n`,
  "utf8",
);
for (const row of rows) {
  console.log(
    [
      row.classe.padEnd(9),
      row.tipo.padEnd(8),
      `${String(row.paginas)} p`,
      `${row.charsPerPage.toFixed(0)} chars/p`,
      `${String(row.termsFound)}/${String(row.termsExpected)} terms`,
      row.inOrder ? "in order" : "out of order",
      row.arquivo,
    ].join(" | "),
  );
}
