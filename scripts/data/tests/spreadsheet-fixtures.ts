import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import ExcelJS from "exceljs";

// Small invented spreadsheets with the same layout as the real ones: title
// rows above the header, the same column names, and a `;`-separated CSV.
// No real client data is used in the tests.

export const CLIENT_COLUMNS = [
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
];

export const ORDER_COLUMNS = [
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
];

export const RECEIVABLE_COLUMNS = [
  "id_titulo",
  "id_cliente",
  "num_pedido",
  "parcela",
  "valor",
  "data_emissao",
  "data_vencimento",
  "data_pagamento",
  "status",
];

type CellInput = string | number | Date | null;

export const defaultClientRows: CellInput[][] = [
  [
    "C001",
    "Construtora Exemplo Ltda",
    "11.222.333/0001-81",
    "Recife/PE",
    "Construtora",
    "V01",
    50000,
    "Ativo",
    "Ana Exemplo",
    "(81) 90000-0001",
    new Date(Date.UTC(2026, 0, 10)),
  ],
  [
    "C002",
    "Eletrica Modelo SA",
    "45.723.174/0001-10",
    "Olinda/PE",
    "Revenda",
    "V02",
    "12.500,00",
    "Ativo",
    "Bruno Modelo",
    "(81) 90000-0002",
    "15/01/2026",
  ],
];

export const defaultOrderRows: CellInput[][] = [
  [
    1001,
    new Date(Date.UTC(2025, 1, 3)),
    "C001",
    "V01",
    "P10",
    "Cabo flexível 2,5mm",
    10,
    "M",
    2.5,
    25,
    "Faturado",
  ],
  [
    1001,
    new Date(Date.UTC(2025, 1, 3)),
    "C001",
    "V01",
    "P11",
    "Disjuntor 20A",
    2,
    "UN",
    30,
    60,
    "Faturado",
  ],
];

export const defaultReceivableLines = [
  "T1;C001;1001;1;85,00;2025-02-03;2025-03-05;2025-03-04;PAGO",
  "T2;C002;1002;1;1.234,56;03/02/2025;05/03/2025;;EM ABERTO",
];

interface FixtureOptions {
  clientColumns?: string[];
  clientRows?: CellInput[][];
  orderRows?: CellInput[][];
  receivableLines?: string[];
  /** Adds a blank row between the clients' content rows. */
  blankClientRowAfter?: number;
  omit?: "clients" | "orders" | "receivables";
}

async function writeWorkbook(
  filePath: string,
  sheetName: string,
  titles: string[],
  columns: string[],
  rows: CellInput[][],
  blankAfter?: number,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  for (const title of titles) {
    sheet.addRow([title]);
  }
  sheet.addRow([]);
  sheet.addRow(columns);
  rows.forEach((row, index) => {
    sheet.addRow(row);
    if (blankAfter !== undefined && index + 1 === blankAfter) {
      sheet.addRow([]);
    }
  });
  await workbook.xlsx.writeFile(filePath);
}

export async function writeFixtures(
  options: FixtureOptions = {},
): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "spreadsheets-"));

  if (options.omit !== "clients") {
    await writeWorkbook(
      path.join(folder, "Clientes - Comercial.xlsx"),
      "Clientes",
      ["CADASTRO DE CLIENTES – COMERCIAL"],
      options.clientColumns ?? CLIENT_COLUMNS,
      options.clientRows ?? defaultClientRows,
      options.blankClientRowAfter,
    );
  }
  if (options.omit !== "orders") {
    await writeWorkbook(
      path.join(folder, "Pedidos 2025-2026 - Comercial.xlsx"),
      "Pedidos",
      [
        "DISTRILUX · CONTROLE DE PEDIDOS 2025-2026 (COMERCIAL)",
        "Planilha de exemplo para testes",
      ],
      ORDER_COLUMNS,
      options.orderRows ?? defaultOrderRows,
    );
  }
  if (options.omit !== "receivables") {
    const lines = [
      RECEIVABLE_COLUMNS.join(";"),
      ...(options.receivableLines ?? defaultReceivableLines),
    ];
    await writeFile(
      path.join(folder, "titulos.csv"),
      `${lines.join("\r\n")}\r\n`,
      "ascii",
    );
  }

  return folder;
}
