import { SPREADSHEETS } from "./read-spreadsheets.js";
import type {
  Cell,
  Sheet,
  SheetRow,
  SpreadsheetName,
  Spreadsheets,
} from "./read-spreadsheets.js";

// Pure functions: they only look at the rows the reader returned.

export const PROBLEM_IDS = [
  "clients-written-differently",
  "invalid-cnpj",
  "mixed-date-formats",
  "decimal-comma-values",
  "duplicates",
  "orders-without-client",
  "clients-identified-by-name",
  "wrong-quantities",
  "total-lines",
  "outdated-status",
] as const;

export type ProblemId = (typeof PROBLEM_IDS)[number];

export interface FileOccurrence {
  file: string;
  rows: number;
  exampleRows: number[];
}

export interface ProblemResult {
  id: ProblemId;
  found: boolean;
  rows: number;
  byFile: FileOccurrence[];
}

export interface ColumnProfile {
  name: string;
  kinds: Cell["kind"][];
  empty: number;
  /** Formulas whose result was not saved in the file. */
  formulas: number;
  /** Date or value formats; only for date, money, and quantity columns. */
  formats?: string[];
}

export interface SheetProfile {
  file: string;
  contentRows: number;
  blankRows: number;
  totalLines: number;
  columns: ColumnProfile[];
  distinctOrders?: number;
}

export interface ColumnMatch {
  column: string;
  portalField: string | null;
  erpField: string | null;
}

export interface Diagnosis {
  profiles: Record<SpreadsheetName, SheetProfile>;
  problems: ProblemResult[];
  receivablesFromErp: number;
}

const SHEET_ORDER: SpreadsheetName[] = ["clientes", "pedidos", "titulos"];
const MAX_EXAMPLES = 5;
const ERP_RECEIVABLES_FROM = Date.UTC(2026, 9, 1);

const DATE_COLUMNS: Record<SpreadsheetName, string[]> = {
  clientes: ["Últ. atualização"],
  pedidos: ["Data"],
  titulos: ["data_emissao", "data_vencimento", "data_pagamento"],
};

const VALUE_COLUMNS: Record<SpreadsheetName, string[]> = {
  clientes: ["Limite"],
  pedidos: ["Qtd", "Preço Unit.", "Total"],
  titulos: ["valor"],
};

// Portal field (DATA-01 Prisma schema) and ERP field (BACK-02 client schemas)
// for every column. Written by hand: BACK-02 is not merged into this branch.
export const COLUMN_MATCHES: Record<SpreadsheetName, ColumnMatch[]> = {
  clientes: [
    match("Cód.", "Cliente.codigoErp", "cliente.codigo"),
    match("Razão Social", "Cliente.razaoSocial", "cliente.razaoSocial"),
    match("CNPJ", "Cliente.cnpj", "cliente.cnpj"),
    match(
      "Cidade/UF",
      "Cliente.cidade + Cliente.uf",
      "cliente.cidade + cliente.uf",
    ),
    match("Segmento", "Cliente.segmento", "cliente.segmento"),
    match("Vendedor", "Cliente.codigoVendedor", "cliente.vendedor"),
    match(
      "Limite",
      "Cliente.limiteCreditoCentavos",
      "cliente.limiteCreditoCentavos",
    ),
    match("Situação", "Cliente.status", "cliente.status"),
    match("Contato", null, null),
    match("Telefone", null, null),
    match("Últ. atualização", "Cliente.atualizadoEm", "cliente.atualizadoEm"),
  ],
  pedidos: [
    match("Nº Pedido", "PedidoHistorico.numero", "pedido.numero"),
    match("Data", "PedidoHistorico.data", "pedido.criadoEm"),
    match("Cliente", "PedidoHistorico.clienteId", "pedido.cliente"),
    match("Vendedor", "PedidoHistorico.vendedorNome", null),
    match("Produto", "PedidoHistorico.produtoId", "pedido.itens.produto"),
    match("Descrição", "Produto.descricao", "pedido.itens.descricao"),
    match("Qtd", "PedidoHistorico.quantidade", "pedido.itens.quantidade"),
    match("Un", "Produto.unidade", "produto.unidade"),
    match(
      "Preço Unit.",
      "PedidoHistorico.precoUnitarioCentavos",
      "pedido.itens.precoUnitarioCentavos",
    ),
    match("Total", null, "pedido.itens.subtotalCentavos"),
    match("Status", "PedidoHistorico.status", "pedido.status"),
  ],
  titulos: [
    match("id_titulo", "Titulo.numero", "titulo.numero"),
    match("id_cliente", "Titulo.clienteId", "titulo.cliente"),
    match("num_pedido", "Titulo.pedidoErp", "titulo.pedidoErp"),
    match("parcela", "Titulo.parcela", "titulo.parcela"),
    match("valor", "Titulo.valorCentavos", "titulo.valorCentavos"),
    match("data_emissao", "Titulo.emissao", "titulo.emissao"),
    match("data_vencimento", "Titulo.vencimento", "titulo.vencimento"),
    match("data_pagamento", "Titulo.pagamento", "titulo.pagamento"),
    match("status", "Titulo.status", "titulo.status"),
  ],
};

function match(
  column: string,
  portalField: string | null,
  erpField: string | null,
): ColumnMatch {
  return { column, portalField, erpField };
}

// ---------- cell helpers ----------

function text(cell: Cell | undefined): string {
  if (!cell || cell.kind === "empty" || cell.kind === "formula") return "";
  if (cell.kind === "date") return cell.value.toISOString();
  return String(cell.value).trim();
}

function isEmpty(cell: Cell | undefined): boolean {
  return !cell || cell.kind === "empty";
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Describes text by its shape, never by its value: digits become 9 and
// letters become a (for example, "10 cx" becomes "99 aa").
function shapeOf(value: string): string {
  return `shape ${value.replace(/\p{L}/gu, "a").replace(/\p{N}/gu, "9")}`;
}

const DATE_PATTERNS: { name: string; pattern: RegExp; order: "dmy" | "ymd" }[] =
  [
    {
      name: "dd/mm/yyyy",
      pattern: /^(\d{2})\/(\d{2})\/(\d{4})$/,
      order: "dmy",
    },
    { name: "dd/mm/yy", pattern: /^(\d{2})\/(\d{2})\/(\d{2})$/, order: "dmy" },
    {
      name: "dd.mm.yyyy",
      pattern: /^(\d{2})\.(\d{2})\.(\d{4})$/,
      order: "dmy",
    },
    { name: "dd-mm-yyyy", pattern: /^(\d{2})-(\d{2})-(\d{4})$/, order: "dmy" },
    { name: "yyyy-mm-dd", pattern: /^(\d{4})-(\d{2})-(\d{2})$/, order: "ymd" },
  ];

// Excel stores dates as days since 1899-12-30; copied to a CSV, they become
// five-digit numbers written as text.
const EXCEL_SERIAL = /^\d{5}$/;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_IN_MS = 86_400_000;

function dateFormat(cell: Cell): string {
  if (cell.kind === "date") return "Excel date";
  const value = text(cell);
  if (EXCEL_SERIAL.test(value)) return "Excel serial number";
  return (
    DATE_PATTERNS.find(({ pattern }) => pattern.test(value))?.name ??
    shapeOf(value)
  );
}

function valueFormat(cell: Cell): string {
  if (cell.kind === "number") return "number";
  const value = text(cell);
  if (value.includes(",")) return "text with decimal comma";
  if (/^-?\d+(\.\d+)?$/.test(value)) return "text with decimal point";
  return shapeOf(value);
}

function toNumber(cell: Cell | undefined): number | null {
  if (cell?.kind === "number") return cell.value;
  if (cell?.kind !== "text") return null;
  const value = cell.value.trim();
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const parsed = Number(normalized);
  return normalized === "" || Number.isNaN(parsed) ? null : parsed;
}

function toUtcDay(cell: Cell | undefined): number | null {
  if (!cell || cell.kind === "empty") return null;
  if (cell.kind === "date") return cell.value.getTime();
  const value = text(cell);
  if (EXCEL_SERIAL.test(value)) return EXCEL_EPOCH + Number(value) * DAY_IN_MS;
  for (const { pattern, order } of DATE_PATTERNS) {
    const [, first = "", second = "", third = ""] = pattern.exec(value) ?? [];
    if (first === "") continue;
    const [day, month, year] =
      order === "dmy" ? [first, second, third] : [third, second, first];
    // Two-digit years in these files are all from the 2000s.
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    return Date.UTC(fullYear, Number(month) - 1, Number(day));
  }
  return null;
}

function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const checkDigit = (length: number): number => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce(
      (total, weight, index) => total + weight * Number(digits[index]),
      0,
    );
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return (
    checkDigit(12) === Number(digits[12]) &&
    checkDigit(13) === Number(digits[13])
  );
}

// ---------- row classification ----------

type RowKind = "content" | "blank" | "total";

function rowKind(sheet: Sheet, row: SheetRow): RowKind {
  const filled = sheet.columns
    .map((column) => row.cells[column])
    .filter((cell): cell is Cell => !isEmpty(cell));
  const first = filled[0];
  if (!first) return "blank";
  if (first.kind === "text" && /^total/i.test(first.value.trim())) {
    return "total";
  }
  return "content";
}

function contentRows(sheet: Sheet): SheetRow[] {
  return sheet.rows.filter((row) => rowKind(sheet, row) === "content");
}

// ---------- profile ----------

function profileOf(name: SpreadsheetName, sheet: Sheet): SheetProfile {
  const kinds = sheet.rows.map((row) => rowKind(sheet, row));
  const content = contentRows(sheet);
  const formatColumns = new Map<string, (cell: Cell) => string>([
    ...DATE_COLUMNS[name].map((column) => [column, dateFormat] as const),
    ...VALUE_COLUMNS[name].map((column) => [column, valueFormat] as const),
  ]);

  const columns = sheet.columns.map((column): ColumnProfile => {
    const cells = content.map((row) => row.cells[column]);
    const filled = cells.filter((cell): cell is Cell => !isEmpty(cell));
    const values = filled.filter((cell) => cell.kind !== "formula");
    const profile: ColumnProfile = {
      name: column,
      kinds: [...new Set(filled.map((cell) => cell.kind))].sort(),
      empty: cells.length - filled.length,
      formulas: filled.length - values.length,
    };
    const format = formatColumns.get(column);
    if (format) {
      profile.formats = [...new Set(values.map(format))].sort();
    }
    return profile;
  });

  const profile: SheetProfile = {
    file: sheet.file,
    contentRows: content.length,
    blankRows: kinds.filter((kind) => kind === "blank").length,
    totalLines: kinds.filter((kind) => kind === "total").length,
    columns,
  };
  if (name === "pedidos") {
    profile.distinctOrders = new Set(
      content
        .map((row) => text(row.cells["Nº Pedido"]))
        .filter((value) => value !== ""),
    ).size;
  }
  return profile;
}

// ---------- problems ----------

type RowsByFile = Partial<Record<SpreadsheetName, number[]>>;

function result(id: ProblemId, rowsByFile: RowsByFile): ProblemResult {
  const byFile = SHEET_ORDER.flatMap((name): FileOccurrence[] => {
    const rows = [...new Set(rowsByFile[name] ?? [])].sort((a, b) => a - b);
    return rows.length === 0
      ? []
      : [
          {
            file: SPREADSHEETS[name].file,
            rows: rows.length,
            exampleRows: rows.slice(0, MAX_EXAMPLES),
          },
        ];
  });
  const rows = byFile.reduce((total, entry) => total + entry.rows, 0);
  return { id, found: rows > 0, rows, byFile };
}

function clientsWrittenDifferently(sheets: Spreadsheets): RowsByFile {
  const groups = new Map<string, { spellings: Set<string>; rows: number[] }>();
  for (const row of contentRows(sheets.clientes)) {
    const name = text(row.cells["Razão Social"]);
    if (name === "") continue;
    const key = normalizeName(name);
    const group = groups.get(key) ?? { spellings: new Set(), rows: [] };
    group.spellings.add(name);
    group.rows.push(row.rowNumber);
    groups.set(key, group);
  }
  const rows = [...groups.values()]
    .filter((group) => group.spellings.size > 1)
    .flatMap((group) => group.rows);
  return { clientes: rows };
}

function invalidCnpj(sheets: Spreadsheets): RowsByFile {
  return {
    clientes: contentRows(sheets.clientes)
      .filter((row) => {
        const value = text(row.cells.CNPJ);
        return value !== "" && !isValidCnpj(value);
      })
      .map((row) => row.rowNumber),
  };
}

function mixedDateFormats(sheets: Spreadsheets): RowsByFile {
  const found: RowsByFile = {};
  for (const name of SHEET_ORDER) {
    const rows = new Set<number>();
    for (const column of DATE_COLUMNS[name]) {
      const cells = contentRows(sheets[name])
        .map((row) => ({ row: row.rowNumber, cell: row.cells[column] }))
        .filter((entry): entry is { row: number; cell: Cell } =>
          Boolean(
            entry.cell && !isEmpty(entry.cell) && entry.cell.kind !== "formula",
          ),
        );
      const counts = new Map<string, number>();
      for (const { cell } of cells) {
        const format = dateFormat(cell);
        counts.set(format, (counts.get(format) ?? 0) + 1);
      }
      if (counts.size < 2) continue;
      const dominant = [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0];
      for (const { row, cell } of cells) {
        if (dateFormat(cell) !== dominant) rows.add(row);
      }
    }
    found[name] = [...rows];
  }
  return found;
}

function decimalCommaValues(sheets: Spreadsheets): RowsByFile {
  const found: RowsByFile = {};
  for (const name of SHEET_ORDER) {
    found[name] = contentRows(sheets[name])
      .filter((row) =>
        VALUE_COLUMNS[name].some((column) => {
          const cell = row.cells[column];
          return cell?.kind === "text" && cell.value.includes(",");
        }),
      )
      .map((row) => row.rowNumber);
  }
  return found;
}

function duplicates(sheets: Spreadsheets): RowsByFile {
  const found: RowsByFile = {};
  for (const name of SHEET_ORDER) {
    const sheet = sheets[name];
    const seenRows = new Set<string>();
    const seenReceivables = new Set<string>();
    const rows: number[] = [];
    for (const row of contentRows(sheet)) {
      const whole = JSON.stringify(
        sheet.columns.map((column) => text(row.cells[column])),
      );
      let duplicated = seenRows.has(whole);
      seenRows.add(whole);
      if (name === "titulos") {
        const id = text(row.cells.id_titulo);
        const installment = text(row.cells.parcela);
        if (id !== "" && installment !== "") {
          const key = `${id}|${installment}`;
          duplicated ||= seenReceivables.has(key);
          seenReceivables.add(key);
        }
      }
      if (duplicated) rows.push(row.rowNumber);
    }
    found[name] = rows;
  }
  return found;
}

function ordersWithoutClient(sheets: Spreadsheets): RowsByFile {
  return {
    pedidos: contentRows(sheets.pedidos)
      .filter((row) => isEmpty(row.cells.Cliente))
      .map((row) => row.rowNumber),
  };
}

function clientsIdentifiedByName(sheets: Spreadsheets): RowsByFile {
  const codes = new Set(
    contentRows(sheets.clientes)
      .map((row) => text(row.cells["Cód."]))
      .filter((code) => code !== ""),
  );
  return {
    pedidos: contentRows(sheets.pedidos)
      .filter((row) => {
        const client = text(row.cells.Cliente);
        return client !== "" && !codes.has(client);
      })
      .map((row) => row.rowNumber),
  };
}

function wrongQuantities(sheets: Spreadsheets): RowsByFile {
  return {
    pedidos: contentRows(sheets.pedidos)
      .filter((row) => {
        const quantity = toNumber(row.cells.Qtd);
        if (quantity === null || !Number.isInteger(quantity) || quantity <= 0) {
          return true;
        }
        const price = toNumber(row.cells["Preço Unit."]);
        const total = toNumber(row.cells.Total);
        if (price === null || total === null) return false;
        // Compare in integer cents to avoid floating-point noise (RN-13).
        const expected = Math.round(quantity * price * 100);
        return Math.abs(expected - Math.round(total * 100)) > 1;
      })
      .map((row) => row.rowNumber),
  };
}

function totalLines(sheets: Spreadsheets): RowsByFile {
  const found: RowsByFile = {};
  for (const name of SHEET_ORDER) {
    const sheet = sheets[name];
    found[name] = sheet.rows
      .filter((row) => rowKind(sheet, row) === "total")
      .map((row) => row.rowNumber);
  }
  return found;
}

function outdatedStatus(sheets: Spreadsheets): RowsByFile {
  return {
    titulos: contentRows(sheets.titulos)
      .filter((row) => {
        const paid = normalizeName(text(row.cells.status)) === "pago";
        const hasPayment = !isEmpty(row.cells.data_pagamento);
        return hasPayment !== paid;
      })
      .map((row) => row.rowNumber),
  };
}

const DETECTORS: Record<ProblemId, (sheets: Spreadsheets) => RowsByFile> = {
  "clients-written-differently": clientsWrittenDifferently,
  "invalid-cnpj": invalidCnpj,
  "mixed-date-formats": mixedDateFormats,
  "decimal-comma-values": decimalCommaValues,
  duplicates,
  "orders-without-client": ordersWithoutClient,
  "clients-identified-by-name": clientsIdentifiedByName,
  "wrong-quantities": wrongQuantities,
  "total-lines": totalLines,
  "outdated-status": outdatedStatus,
};

export function diagnose(sheets: Spreadsheets): Diagnosis {
  const profiles = Object.fromEntries(
    SHEET_ORDER.map((name) => [name, profileOf(name, sheets[name])]),
  ) as Record<SpreadsheetName, SheetProfile>;

  const receivablesFromErp = contentRows(sheets.titulos).filter((row) => {
    const issued = toUtcDay(row.cells.data_emissao);
    return issued !== null && issued >= ERP_RECEIVABLES_FROM;
  }).length;

  return {
    profiles,
    problems: PROBLEM_IDS.map((id) => result(id, DETECTORS[id](sheets))),
    receivablesFromErp,
  };
}
