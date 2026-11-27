import { access } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

// Reads the three legacy spreadsheets without ever writing to them.

export const SPREADSHEETS = {
  clientes: {
    file: "Clientes - Comercial.xlsx",
    columns: [
      "Cód.",
      "Razão Social",
      "CNPJ",
      "Cidade/UF",
      "Segmento",
      "Vendedor",
      "Limite",
      "Situação",
      "Contato",
      "Telefone",
      "Últ. atualização",
    ],
  },
  pedidos: {
    file: "Pedidos 2025-2026 - Comercial.xlsx",
    columns: [
      "Nº Pedido",
      "Data",
      "Cliente",
      "Vendedor",
      "Produto",
      "Descrição",
      "Qtd",
      "Un",
      "Preço Unit.",
      "Total",
      "Status",
    ],
  },
  titulos: {
    file: "titulos.csv",
    columns: [
      "id_titulo",
      "id_cliente",
      "num_pedido",
      "parcela",
      "valor",
      "data_emissao",
      "data_vencimento",
      "data_pagamento",
      "status",
    ],
  },
} as const;

export type SpreadsheetName = keyof typeof SPREADSHEETS;

export type Cell =
  | { kind: "empty" }
  | { kind: "number"; value: number }
  | { kind: "date"; value: Date }
  | { kind: "text"; value: string }
  /** A formula whose result was not saved in the file. */
  | { kind: "formula" };

export interface SheetRow {
  /** Row number as shown by Excel (or the line number in the CSV). */
  rowNumber: number;
  cells: Record<string, Cell>;
}

export interface Sheet {
  file: string;
  headerRow: number;
  columns: string[];
  rows: SheetRow[];
}

export type Spreadsheets = Record<SpreadsheetName, Sheet>;

export class MissingFileError extends Error {
  constructor(readonly file: string) {
    super(`Missing file "${file}" in the input folder.`);
    this.name = "MissingFileError";
  }
}

export class MissingColumnError extends Error {
  constructor(
    readonly file: string,
    readonly column: string,
  ) {
    super(`Missing column "${column}" in "${file}".`);
    this.name = "MissingColumnError";
  }
}

const EMPTY: Cell = { kind: "empty" };

function toCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) {
    return EMPTY;
  }
  if (value instanceof Date) {
    return { kind: "date", value };
  }
  if (typeof value === "number") {
    return { kind: "number", value };
  }
  if (typeof value === "string") {
    return value.trim() === "" ? EMPTY : { kind: "text", value };
  }
  if (typeof value === "boolean") {
    return { kind: "text", value: String(value) };
  }
  if ("richText" in value) {
    return toCell(value.richText.map((part) => part.text).join(""));
  }
  if ("formula" in value || "sharedFormula" in value) {
    const { result } = value as { result?: ExcelJS.CellValue };
    return result === undefined ? { kind: "formula" } : toCell(result);
  }
  if ("text" in value) {
    return toCell(value.text);
  }
  return EMPTY;
}

function textOf(value: ExcelJS.CellValue): string {
  const cell = toCell(value);
  return cell.kind === "text" ? cell.value.trim() : "";
}

function cellsOf(row: ExcelJS.Row, columnCount: number): ExcelJS.CellValue[] {
  const values: ExcelJS.CellValue[] = [];
  for (let column = 1; column <= columnCount; column += 1) {
    values.push(row.getCell(column).value);
  }
  return values;
}

function toSheet(
  worksheet: ExcelJS.Worksheet,
  file: string,
  expectedColumns: readonly string[],
): Sheet {
  const columnCount = Math.max(worksheet.columnCount, expectedColumns.length);
  let headerRow = 0;
  let header: string[] = [];

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const names = cellsOf(worksheet.getRow(rowNumber), columnCount).map(textOf);
    if (expectedColumns.every((column) => names.includes(column))) {
      headerRow = rowNumber;
      header = names;
      break;
    }
  }

  if (headerRow === 0) {
    const firstRows = Array.from(
      { length: Math.min(worksheet.rowCount, 10) },
      (_, index) =>
        cellsOf(worksheet.getRow(index + 1), columnCount).map(textOf),
    );
    const missing =
      expectedColumns.find(
        (column) => !firstRows.some((names) => names.includes(column)),
      ) ?? expectedColumns[0];
    throw new MissingColumnError(file, missing ?? "");
  }

  const columns = header.filter((name) => name !== "");
  const rows: SheetRow[] = [];
  for (
    let rowNumber = headerRow + 1;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const values = cellsOf(worksheet.getRow(rowNumber), columnCount);
    const cells: Record<string, Cell> = {};
    header.forEach((name, index) => {
      if (name !== "") {
        cells[name] = toCell(values[index] ?? null);
      }
    });
    rows.push({ rowNumber, cells });
  }

  return { file, headerRow, columns, rows };
}

async function ensureExists(folder: string, file: string): Promise<string> {
  const filePath = path.join(folder, file);
  try {
    await access(filePath);
  } catch {
    throw new MissingFileError(file);
  }
  return filePath;
}

async function readWorkbookSheet(
  folder: string,
  name: "clientes" | "pedidos",
): Promise<Sheet> {
  const { file, columns } = SPREADSHEETS[name];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await ensureExists(folder, file));
  const worksheet = workbook.worksheets[0];
  if (worksheet === undefined) {
    throw new MissingColumnError(file, columns[0]);
  }
  return toSheet(worksheet, file, columns);
}

async function readCsvSheet(folder: string): Promise<Sheet> {
  const { file, columns } = SPREADSHEETS.titulos;
  const workbook = new ExcelJS.Workbook();
  // Keep every value as the text written in the file: converting numbers or
  // dates here would hide the different formats the diagnosis must report.
  const worksheet = await workbook.csv.readFile(
    await ensureExists(folder, file),
    {
      parserOptions: { delimiter: ";" },
      map: (value: unknown) => value,
    },
  );
  return toSheet(worksheet, file, columns);
}

export async function readSpreadsheets(folder: string): Promise<Spreadsheets> {
  for (const { file } of Object.values(SPREADSHEETS)) {
    await ensureExists(folder, file);
  }
  return {
    clientes: await readWorkbookSheet(folder, "clientes"),
    pedidos: await readWorkbookSheet(folder, "pedidos"),
    titulos: await readCsvSheet(folder),
  };
}
