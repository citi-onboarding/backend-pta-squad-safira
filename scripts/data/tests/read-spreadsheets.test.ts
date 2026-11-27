import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MissingColumnError,
  MissingFileError,
  readSpreadsheets,
} from "../read-spreadsheets.js";
import {
  CLIENT_COLUMNS,
  RECEIVABLE_COLUMNS,
  writeFixtures,
} from "./spreadsheet-fixtures.js";

const FILES = [
  "Clientes - Comercial.xlsx",
  "Pedidos 2025-2026 - Comercial.xlsx",
  "titulos.csv",
];

async function fingerprint(folder: string): Promise<string[]> {
  return Promise.all(
    FILES.map(async (file) =>
      createHash("sha256")
        .update(await readFile(path.join(folder, file)))
        .digest("hex"),
    ),
  );
}

describe("readSpreadsheets", () => {
  it("finds the header below the title rows and keeps the real row numbers", async () => {
    const folder = await writeFixtures();

    const { clientes, pedidos } = await readSpreadsheets(folder);

    expect(clientes.headerRow).toBe(3);
    expect(clientes.columns).toEqual(CLIENT_COLUMNS);
    expect(clientes.rows.map((row) => row.rowNumber)).toEqual([4, 5]);
    expect(pedidos.headerRow).toBe(4);
    expect(pedidos.rows.map((row) => row.rowNumber)).toEqual([5, 6]);
  });

  it("returns each cell with its kind", async () => {
    const folder = await writeFixtures();

    const { clientes } = await readSpreadsheets(folder);
    const [first, second] = clientes.rows;

    expect(first?.cells.Limite).toEqual({ kind: "number", value: 50000 });
    expect(first?.cells["Últ. atualização"]).toEqual({
      kind: "date",
      value: new Date(Date.UTC(2026, 0, 10)),
    });
    expect(second?.cells.Limite).toEqual({
      kind: "text",
      value: "12.500,00",
    });
    expect(second?.cells["Últ. atualização"]).toEqual({
      kind: "text",
      value: "15/01/2026",
    });
  });

  it("keeps blank rows between content rows as rows with only empty cells", async () => {
    const folder = await writeFixtures({ blankClientRowAfter: 1 });

    const { clientes } = await readSpreadsheets(folder);

    expect(clientes.rows.map((row) => row.rowNumber)).toEqual([4, 5, 6]);
    expect(
      Object.values(clientes.rows[1]?.cells ?? {}).every(
        (cell) => cell.kind === "empty",
      ),
    ).toBe(true);
  });

  it("reads the semicolon-separated CSV as text exactly as written", async () => {
    const folder = await writeFixtures();

    const { titulos } = await readSpreadsheets(folder);

    expect(titulos.headerRow).toBe(1);
    expect(titulos.columns).toEqual(RECEIVABLE_COLUMNS);
    expect(titulos.rows.map((row) => row.rowNumber)).toEqual([2, 3]);
    expect(titulos.rows[1]?.cells.valor).toEqual({
      kind: "text",
      value: "1.234,56",
    });
    expect(titulos.rows[1]?.cells.data_emissao).toEqual({
      kind: "text",
      value: "03/02/2025",
    });
    expect(titulos.rows[1]?.cells.data_pagamento).toEqual({
      kind: "empty",
    });
  });

  it("leaves the three files unchanged", async () => {
    const folder = await writeFixtures();
    const before = await fingerprint(folder);

    await readSpreadsheets(folder);

    await expect(fingerprint(folder)).resolves.toEqual(before);
  });

  it("names the missing column and the file", async () => {
    const folder = await writeFixtures({
      clientColumns: CLIENT_COLUMNS.map((column) =>
        column === "CNPJ" ? "Documento" : column,
      ),
    });

    const error = await readSpreadsheets(folder).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(MissingColumnError);
    expect((error as Error).message).toContain("CNPJ");
    expect((error as Error).message).toContain("Clientes - Comercial.xlsx");
  });

  it("names the missing file", async () => {
    const folder = await writeFixtures({ omit: "receivables" });

    const error = await readSpreadsheets(folder).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(MissingFileError);
    expect((error as Error).message).toContain("titulos.csv");
  });
});
