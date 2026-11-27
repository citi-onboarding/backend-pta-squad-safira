import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as prettier from "prettier";

import { diagnose } from "./diagnose-spreadsheets.js";
import {
  MissingColumnError,
  MissingFileError,
  readSpreadsheets,
} from "./read-spreadsheets.js";
import { renderDiagnosis } from "./render-diagnosis.js";

// Command: pnpm data:diagnose -- --input "<folder with the three files>".
// Reads the spreadsheets, never changes them, and writes only the document.

const DEFAULT_OUTPUT = fileURLToPath(
  new URL("../../docs/data/diagnostico-planilhas.md", import.meta.url),
);

const USAGE =
  'Usage: pnpm data:diagnose -- --input "<folder with Clientes - Comercial.xlsx, Pedidos 2025-2026 - Comercial.xlsx, and titulos.csv>"';

export interface RunOptions {
  args: string[];
  outputPath: string;
  /** Receives every line the command prints. Never receives cell values. */
  write: (line: string) => void;
}

function inputFolder(args: string[]): string | null {
  const index = args.indexOf("--input");
  const folder = index === -1 ? undefined : args[index + 1];
  return folder === undefined || folder.startsWith("--") ? null : folder;
}

export async function runDiagnosis({
  args,
  outputPath,
  write,
}: RunOptions): Promise<number> {
  const folder = inputFolder(args);
  if (folder === null) {
    write("Missing the --input folder.");
    write(USAGE);
    return 1;
  }

  try {
    const sheets = await readSpreadsheets(folder);
    const diagnosis = diagnose(sheets);
    // Format with the repository's Prettier settings, so `pnpm format:check`
    // accepts the generated document as it is.
    const settings = await prettier.resolveConfig(DEFAULT_OUTPUT);
    const document = await prettier.format(renderDiagnosis(diagnosis), {
      ...settings,
      parser: "markdown",
    });
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, document, "utf8");

    for (const profile of Object.values(diagnosis.profiles)) {
      write(
        `${profile.file}: ${String(profile.contentRows)} content rows, ${String(profile.blankRows)} blank rows, ${String(profile.totalLines)} total lines.`,
      );
    }
    const found = diagnosis.problems.filter((problem) => problem.found).length;
    write(
      `Problems found: ${String(found)} of ${String(diagnosis.problems.length)}.`,
    );
    write(`Document written to ${outputPath}.`);
    return 0;
  } catch (error) {
    if (
      error instanceof MissingFileError ||
      error instanceof MissingColumnError
    ) {
      write(error.message);
      return 1;
    }
    throw error;
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  process.exitCode = await runDiagnosis({
    args: process.argv.slice(2),
    outputPath: DEFAULT_OUTPUT,
    write: (line) => {
      process.stdout.write(`${line}\n`);
    },
  });
}
