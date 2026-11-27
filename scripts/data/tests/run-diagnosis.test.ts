import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import * as prettier from "prettier";
import { describe, expect, it } from "vitest";

import { runDiagnosis } from "../run-diagnosis.js";
import { writeFixtures } from "./spreadsheet-fixtures.js";

async function outputPath(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "diagnosis-output-"));
  return path.join(folder, "diagnostico-planilhas.md");
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

function collector() {
  const lines: string[] = [];
  return { lines, write: (line: string) => lines.push(line) };
}

describe("runDiagnosis", () => {
  it("stops without --input, explains how to pass the folder, and writes nothing", async () => {
    const output = await outputPath();
    const { lines, write } = collector();

    const exitCode = await runDiagnosis({
      args: [],
      outputPath: output,
      write,
    });

    expect(exitCode).toBe(1);
    expect(lines.join("\n")).toContain("--input");
    await expect(exists(output)).resolves.toBe(false);
  });

  it("names a missing file and writes nothing", async () => {
    const folder = await writeFixtures({ omit: "orders" });
    const output = await outputPath();
    const { lines, write } = collector();

    const exitCode = await runDiagnosis({
      args: ["--input", folder],
      outputPath: output,
      write,
    });

    expect(exitCode).toBe(1);
    expect(lines.join("\n")).toContain("Pedidos 2025-2026 - Comercial.xlsx");
    await expect(exists(output)).resolves.toBe(false);
  });

  it("writes a byte-identical document when run twice", async () => {
    const folder = await writeFixtures();
    const output = await outputPath();
    const { write } = collector();

    await expect(
      runDiagnosis({ args: ["--input", folder], outputPath: output, write }),
    ).resolves.toBe(0);
    const first = await readFile(output);
    await expect(
      runDiagnosis({ args: ["--input", folder], outputPath: output, write }),
    ).resolves.toBe(0);
    const second = await readFile(output);

    expect(first.length).toBeGreaterThan(0);
    expect(second.equals(first)).toBe(true);
  });

  it("prints only file names and totals, never spreadsheet values", async () => {
    const folder = await writeFixtures();
    const output = await outputPath();
    const { lines, write } = collector();

    await runDiagnosis({
      args: ["--input", folder],
      outputPath: output,
      write,
    });

    const printed = lines.join("\n");
    expect(printed).toContain("titulos.csv");
    for (const secret of [
      "Construtora Exemplo",
      "Ana Exemplo",
      "90000-0001",
      "11.222.333/0001-81",
    ]) {
      expect(printed).not.toContain(secret);
    }
  });

  it("writes a document already formatted with the repository's Prettier settings", async () => {
    const folder = await writeFixtures();
    const output = await outputPath();
    const { write } = collector();

    await runDiagnosis({
      args: ["--input", folder],
      outputPath: output,
      write,
    });

    const document = await readFile(output, "utf8");
    const settings = await prettier.resolveConfig(
      path.resolve("docs/data/diagnostico-planilhas.md"),
    );
    await expect(
      prettier.check(document, { ...settings, parser: "markdown" }),
    ).resolves.toBe(true);
  });
});
