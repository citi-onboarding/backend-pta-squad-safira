import { COLUMN_MATCHES } from "./diagnose-spreadsheets.js";
import type {
  ColumnMatch,
  Diagnosis,
  ProblemId,
  ProblemResult,
  SheetProfile,
} from "./diagnose-spreadsheets.js";
import type { SpreadsheetName } from "./read-spreadsheets.js";

// Turns a diagnosis into Markdown. Holds no date, time, or path, so the same
// files always give the same document.

const PROBLEM_TITLES: Record<ProblemId, string> = {
  "clients-written-differently": "clients written in different ways",
  "invalid-cnpj": "invalid CNPJ",
  "mixed-date-formats": "dates in different formats",
  "decimal-comma-values": "values with a decimal comma",
  duplicates: "duplicates",
  "orders-without-client": "orders without a client",
  "clients-identified-by-name": "clients identified by name",
  "wrong-quantities": "quantities typed wrong",
  "total-lines": "total lines",
  "outdated-status": "outdated status",
  "status-written-differently": "status written in different ways",
  "salespeople-identified-by-name": "salespeople identified by name",
  "missing-required-values": "missing required values",
  "cnpj-different-formats": "CNPJ in different formats",
  "unknown-status-values": "status outside the portal values",
  "dot-separated-values": "values written with a dot",
  "client-codes-out-of-pattern": "client codes out of pattern",
};

// Proposed rules for DATA-03. They follow RN-09 (the ERP wins) and RN-16 (a
// row that cannot be corrected safely goes to the pending list with its
// reason). A rule is printed only for a problem that was found.
export const CLEANING_RULES: Record<ProblemId, string> = {
  "clients-written-differently":
    "Link each client to the ERP by code or CNPJ, never by name, and use the ERP company name (RN-09).",
  "invalid-cnpj":
    "Use the CNPJ of the ERP client with the same code (RN-09); when no ERP client has that code, send the row to the pending list.",
  "mixed-date-formats":
    "Convert every date to one format from the recognized ones (`dd/mm/yy` means the year 20yy; an Excel serial number means 1899-12-30 plus that many days). A date that matches no recognized format goes to the pending list.",
  "decimal-comma-values":
    "Remove `R$`, keep the minus sign, read the comma as the decimal separator and any dot before it as a thousands separator, and store integer cents (RN-13). A value written with words (for example, shape `999 aaa`) goes to the pending list; never guess it. The clients' `Limite` is not loaded (PRD 7.7), so its values need no conversion.",
  duplicates:
    "Compare records by key, after the other cleaning rules, not by the text as written: a client by normalized CNPJ or code, an order item by `Nº Pedido` and `Produto`, and a receivable by `id_titulo` and installment number. Keep one row per key. When the repeated rows differ in a loaded value (quantity, price, or receivable value), keep the ERP version when it exists (RN-09); otherwise send them to the pending list. Record every discard with its reason (RN-16).",
  "orders-without-client":
    "Send the row to the pending list with the reason 'order without a client'; never guess the client.",
  "clients-identified-by-name":
    "Link the order to the ERP client only when exactly one ERP client has the same normalized name; otherwise send the row to the pending list.",
  "wrong-quantities":
    "For a quantity written with a unit (for example, shape `99 aa`), use the number only when the unit is the product's unit in the ERP; otherwise, and for zero or fractional quantities, send the row to the pending list. A quantity 20 times or more above the product's median (products with at least 10 rows) goes to the pending list with the reason 'quantity far above the usual'; never divide it to guess the intended value.",
  "total-lines": "Discard the row, recording the reason 'total line' (RN-16).",
  "outdated-status":
    "When the receivable exists in the ERP, use the ERP status (RN-09). Otherwise, a receivable with a payment date is paid, and a paid status without a payment date goes to the pending list.",
  "status-written-differently":
    "Trim spaces and ignore letter case and accents, then map each spelling to a portal status; a spelling that maps to no known status goes to the pending list. A receivable that exists in the ERP takes the ERP status (RN-09).",
  "salespeople-identified-by-name":
    "Do not convert names to codes: the portfolio comes from the ERP client's salesperson (`Cliente.codigoVendedor`, RN-08 and RN-09), and the clients' `Vendedor` is not loaded (PRD 7.7). Keep the order's name as typed in `PedidoHistorico.vendedorNome`, as DATA-01 decided.",
  "missing-required-values":
    "A client without a code is linked to the ERP by CNPJ; a client with neither a code nor a CNPJ goes to the pending list. A receivable without a client takes the ERP receivable with the same number when it exists; otherwise it goes to the pending list. An order item without a product goes to the pending list.",
  "cnpj-different-formats":
    "Normalize every CNPJ to 14 digits (remove the mask and add the leading zeros an Excel number loses) before comparing it with the ERP.",
  "unknown-status-values":
    "The clients' `Situação` is not loaded (PRD 7.7): the ERP status is used, so `ok` and `Prospect` need no mapping. A receivable `Estornado` (a reversal, written with a negative value) is discarded with the reason 'reversed receivable' (RN-16), as DATA-01 decided, so it never counts as revenue (RN-17). Any other unknown status goes to the pending list; a receivable that exists in the ERP takes the ERP status (RN-09).",
  "dot-separated-values":
    "Read a dot by the digits after it: a dot followed by groups of exactly three digits separates thousands (`12.000` is 12000), and a dot followed by one or two digits is the decimal point (`1234.56`). Never apply one fixed meaning to the whole file. Store integer cents (RN-13).",
  "client-codes-out-of-pattern":
    "Trim spaces, write the letter in capitals, and pad the digits with zeros to the common length (`c0012`, `C012`, and ` C0012` become `C0012`). Use the result only when it is a client code in the ERP; otherwise send the row to the pending list.",
};

const SHEET_ORDER: SpreadsheetName[] = ["clientes", "pedidos", "titulos"];

function code(value: string): string {
  return `\`${value}\``;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function summary(diagnosis: Diagnosis): string[] {
  const found = diagnosis.problems.filter((problem) => problem.found).length;
  return [
    "## Summary",
    "",
    "| File | Content rows | Blank rows | Total lines | Distinct orders |",
    "| --- | --- | --- | --- | --- |",
    ...SHEET_ORDER.map((name) => {
      const profile = diagnosis.profiles[name];
      const orders =
        profile.distinctOrders === undefined
          ? "—"
          : formatNumber(profile.distinctOrders);
      return `| ${code(profile.file)} | ${formatNumber(profile.contentRows)} | ${formatNumber(profile.blankRows)} | ${formatNumber(profile.totalLines)} | ${orders} |`;
    }),
    "",
    `Problems found: ${String(found)} of ${String(diagnosis.problems.length)}.`,
    "",
  ];
}

function fileProfile(profile: SheetProfile): string[] {
  return [
    `## File: ${profile.file}`,
    "",
    "| Column | Kinds | Empty | Formulas without a saved value | Formats |",
    "| --- | --- | --- | --- | --- |",
    ...profile.columns.map((column) => {
      const formats = column.formats?.map(code).join(", ") ?? "—";
      const kinds = column.kinds.length > 0 ? column.kinds.join(", ") : "—";
      return `| ${column.name} | ${kinds} | ${formatNumber(column.empty)} | ${formatNumber(column.formulas)} | ${formats || "—"} |`;
    }),
    "",
  ];
}

function problemSection(problem: ProblemResult): string[] {
  const lines = [
    `## Problem: ${PROBLEM_TITLES[problem.id]}`,
    "",
    `**Status:** ${problem.found ? "found" : "not found"}`,
    "",
    `**Rows:** ${formatNumber(problem.rows)}`,
    "",
  ];
  if (!problem.found) {
    return lines;
  }
  return [
    ...lines,
    "| File | Rows | Example rows |",
    "| --- | --- | --- |",
    ...problem.byFile.map(
      (entry) =>
        `| ${code(entry.file)} | ${formatNumber(entry.rows)} | ${entry.exampleRows.join(", ")} |`,
    ),
    "",
    ...problem.byFile
      .filter((entry) => entry.distinctValues !== undefined)
      .map(
        (entry) =>
          `Distinct spellings in ${code(entry.file)}: ${formatNumber(entry.distinctValues ?? 0)}.`,
      ),
    ...(problem.byFile.some((entry) => entry.distinctValues !== undefined)
      ? [""]
      : []),
    `**Proposed cleaning rule:** ${CLEANING_RULES[problem.id]}`,
    "",
  ];
}

function notes(diagnosis: Diagnosis): string[] {
  const totalFormulas =
    diagnosis.profiles.pedidos.columns.find((column) => column.name === "Total")
      ?.formulas ?? 0;
  const { clientes, pedidos, titulos } = diagnosis.profiles;
  const repeatedClients =
    diagnosis.problems
      .find((problem) => problem.id === "duplicates")
      ?.byFile.find((entry) => entry.file === clientes.file)?.rows ?? 0;
  const lines = [
    "## Notes for DATA-03",
    "",
    `- Volumes: the task expects 135 clients, about 9,700 orders, and about 6,500 receivables. The files have ${formatNumber(clientes.contentRows)} client rows, ${formatNumber(clientes.contentRows - repeatedClients)} of them distinct after removing duplicates (plus ${formatNumber(clientes.blankRows)} blank rows and ${formatNumber(clientes.totalLines)} total ${clientes.totalLines === 1 ? "line" : "lines"}; the ERP has about 120 clients, PRD 7.3), ${formatNumber(pedidos.contentRows)} order item rows (the orders file has one row per item) for ${formatNumber(pedidos.distinctOrders ?? 0)} distinct orders, and ${formatNumber(titulos.contentRows)} receivable rows. For orders and receivables, these counts do not explain the differences from the task, so the volumes must be confirmed with the squad manager.`,
  ];
  if (totalFormulas > 0) {
    lines.push(
      `- ${formatNumber(totalFormulas)} cells in ${code("Total")} are a formula without a saved value, so the file holds no total to read. Proposed: compute the total as ${code("Qtd")} times ${code("Preço Unit.")} in integer cents (RN-13).`,
    );
  }
  lines.push(
    `- ${formatNumber(diagnosis.receivablesFromErp)} receivables in ${code("titulos.csv")} are issued from 2026-10-01. From that date the ERP is the source of receivables, so they are not loaded from the spreadsheet.`,
    "",
  );
  return lines;
}

function matchRow(match: ColumnMatch): string {
  return `| ${match.column} | ${match.portalField ?? "no match"} | ${match.erpField ?? "no match"} | ${match.conversion ?? "—"} |`;
}

function columnMatch(diagnosis: Diagnosis): string[] {
  return [
    "## Column match with the ERP",
    "",
    "Portal fields come from the DATA-01 Prisma schema; ERP fields come from the BACK-02 ERP client schemas. The clients file is only used to find the ERP client (PRD 7.7). Fields with no spreadsheet column: `PedidoHistorico.linha` is the item's position in its order after duplicates are removed, so `numero + linha` stays the same on every run (RN-16), and `Titulo.origem` is `PLANILHA`.",
    "",
    ...SHEET_ORDER.flatMap((name) => [
      `### ${diagnosis.profiles[name].file}`,
      "",
      "| Column | Portal field (DATA-01) | ERP field (BACK-02) | Conversion |",
      "| --- | --- | --- | --- |",
      ...COLUMN_MATCHES[name].map(matchRow),
      "",
    ]),
  ];
}

export function renderDiagnosis(diagnosis: Diagnosis): string {
  return [
    "# Spreadsheet diagnosis (DATA-02)",
    "",
    'Generated by `pnpm data:diagnose -- --input "<folder>"`, which only reads the three spreadsheets. Do not edit this file by hand; run the command again instead. It holds counts, column names, formats, and row numbers only, never client data.',
    "",
    ...summary(diagnosis),
    ...SHEET_ORDER.flatMap((name) => fileProfile(diagnosis.profiles[name])),
    ...diagnosis.problems.flatMap(problemSection),
    ...notes(diagnosis),
    ...columnMatch(diagnosis),
  ]
    .join("\n")
    .replace(/\n+$/, "\n");
}
