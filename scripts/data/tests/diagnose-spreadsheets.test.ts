import { describe, expect, it } from "vitest";

import {
  COLUMN_MATCHES,
  diagnose,
  PROBLEM_IDS,
} from "../diagnose-spreadsheets.js";
import type { ProblemId } from "../diagnose-spreadsheets.js";
import { SPREADSHEETS } from "../read-spreadsheets.js";
import type {
  Cell,
  Sheet,
  SpreadsheetName,
  Spreadsheets,
} from "../read-spreadsheets.js";

type Input = string | number | Date | null | { formula: true };

function cell(value: Input): Cell {
  if (value === null || value === "") return { kind: "empty" };
  if (value instanceof Date) return { kind: "date", value };
  if (typeof value === "object") return { kind: "formula" };
  if (typeof value === "number") return { kind: "number", value };
  return { kind: "text", value };
}

// Builds a sheet from partial rows; columns left out are empty.
function sheet(
  name: SpreadsheetName,
  rows: Partial<Record<string, Input>>[],
  firstRow = 4,
): Sheet {
  const columns = [...SPREADSHEETS[name].columns];
  return {
    file: SPREADSHEETS[name].file,
    headerRow: firstRow - 1,
    columns,
    rows: rows.map((values, index) => ({
      rowNumber: firstRow + index,
      cells: Object.fromEntries(
        columns.map((column) => [column, cell(values[column] ?? null)]),
      ),
    })),
  };
}

const day = (year: number, month: number, date: number) =>
  new Date(Date.UTC(year, month - 1, date));

const validClient = {
  "Cód.": "C001",
  "Razão Social": "Construtora Exemplo Ltda",
  CNPJ: "11.222.333/0001-81",
  Limite: 50000,
  "Últ. atualização": day(2026, 1, 10),
};

const validOrder = {
  "Nº Pedido": 1001,
  Data: day(2025, 2, 3),
  Cliente: "C001",
  Produto: "P10",
  Qtd: 10,
  "Preço Unit.": 2.5,
  Total: 25,
  Status: "Faturado",
};

const validReceivable = {
  id_titulo: "T1",
  id_cliente: "C001",
  parcela: "1",
  valor: "85.00",
  data_emissao: "2025-02-03",
  data_vencimento: "2025-03-05",
  data_pagamento: "2025-03-04",
  status: "PAGO",
};

function spreadsheets(
  overrides: Partial<Record<SpreadsheetName, Partial<Record<string, Input>>[]>>,
): Spreadsheets {
  return {
    clientes: sheet("clientes", overrides.clientes ?? [validClient]),
    pedidos: sheet("pedidos", overrides.pedidos ?? [validOrder], 5),
    titulos: sheet("titulos", overrides.titulos ?? [validReceivable], 2),
  };
}

function problem(sheets: Spreadsheets, id: ProblemId) {
  const result = diagnose(sheets).problems.find((entry) => entry.id === id);
  if (!result) throw new Error(`Problem ${id} not reported`);
  return result;
}

describe("profile of each spreadsheet", () => {
  it("counts content rows, blank rows, total lines, and empty values", () => {
    const sheets = spreadsheets({
      clientes: [
        validClient,
        { ...validClient, "Cód.": "C002", CNPJ: null },
        {},
        { ...validClient, "Cód.": "C003" },
        { "Cód.": "TOTAL GERAL" },
      ],
    });

    const profile = diagnose(sheets).profiles.clientes;

    expect(profile.contentRows).toBe(3);
    expect(profile.blankRows).toBe(1);
    expect(profile.totalLines).toBe(1);
    expect(
      profile.columns.find((column) => column.name === "CNPJ")?.empty,
    ).toBe(1);
  });

  it("reports the kinds of value found in each column", () => {
    const sheets = spreadsheets({
      clientes: [validClient, { ...validClient, Limite: "12.500,00" }],
    });

    const limite = diagnose(sheets).profiles.clientes.columns.find(
      (column) => column.name === "Limite",
    );

    expect(limite?.kinds).toEqual(["number", "text"]);
  });

  it("reports the date and value formats found", () => {
    const sheets = spreadsheets({
      titulos: [
        validReceivable,
        { ...validReceivable, data_emissao: "03/02/2025", valor: "1.234,56" },
      ],
    });

    const columns = diagnose(sheets).profiles.titulos.columns;

    expect(
      columns.find((column) => column.name === "data_emissao")?.formats,
    ).toEqual(["dd/mm/yyyy", "yyyy-mm-dd"]);
    expect(columns.find((column) => column.name === "valor")?.formats).toEqual([
      "text with decimal comma",
      "text with decimal point",
    ]);
  });

  it("counts formulas without a saved result apart from empty values", () => {
    const sheets = spreadsheets({
      pedidos: [{ ...validOrder, Total: { formula: true } }],
    });

    const total = diagnose(sheets).profiles.pedidos.columns.find(
      (column) => column.name === "Total",
    );

    expect(total).toMatchObject({ kinds: ["formula"], empty: 0, formulas: 1 });
  });

  it("names the other date formats and describes other text by its shape", () => {
    const sheets = spreadsheets({
      pedidos: [{ ...validOrder, Data: "03.02.2025", Qtd: "10 cx" }],
      titulos: [
        { ...validReceivable, data_emissao: "03/02/25" },
        { ...validReceivable, data_emissao: "03-02-2025" },
      ],
    });

    const { pedidos, titulos } = diagnose(sheets).profiles;
    const formats = (
      columns: typeof pedidos.columns,
      name: string,
    ): string[] | undefined =>
      columns.find((column) => column.name === name)?.formats;

    expect(formats(pedidos.columns, "Data")).toEqual(["dd.mm.yyyy"]);
    expect(formats(titulos.columns, "data_emissao")).toEqual([
      "dd-mm-yyyy",
      "dd/mm/yy",
    ]);
    expect(formats(pedidos.columns, "Qtd")).toEqual(["shape 99 aa"]);
    expect(JSON.stringify(pedidos)).not.toContain("cx");
  });

  it("counts distinct orders, because the orders file has one row per item", () => {
    const sheets = spreadsheets({
      pedidos: [
        validOrder,
        validOrder,
        { ...validOrder, "Nº Pedido": 1002 },
        { ...validOrder, "Nº Pedido": 1002 },
      ],
    });

    const profile = diagnose(sheets).profiles.pedidos;

    expect(profile.contentRows).toBe(4);
    expect(profile.distinctOrders).toBe(2);
  });
});

describe("detection of data problems", () => {
  it("checks every problem of the spec, in a fixed order", () => {
    expect(
      diagnose(spreadsheets({})).problems.map((entry) => entry.id),
    ).toEqual(PROBLEM_IDS);
    expect(PROBLEM_IDS).toHaveLength(15);
  });

  it("reports nothing found for clean sample files", () => {
    const problems = diagnose(spreadsheets({})).problems;

    for (const entry of problems) {
      expect(entry).toMatchObject({ found: false, rows: 0, byFile: [] });
    }
  });

  it("finds clients written in different ways", () => {
    const result = problem(
      spreadsheets({
        clientes: [
          validClient,
          {
            ...validClient,
            "Cód.": "C002",
            "Razão Social": "CONSTRUTORA  EXEMPLO LTDA.",
          },
        ],
      }),
      "clients-written-differently",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 2,
      byFile: [
        { file: SPREADSHEETS.clientes.file, rows: 2, exampleRows: [4, 5] },
      ],
    });
  });

  it("finds an invalid CNPJ", () => {
    const result = problem(
      spreadsheets({
        clientes: [
          validClient,
          { ...validClient, "Cód.": "C002", CNPJ: "11.222.333/0001-82" },
          { ...validClient, "Cód.": "C003", CNPJ: "1122233300018" },
        ],
      }),
      "invalid-cnpj",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 2,
      byFile: [
        { file: SPREADSHEETS.clientes.file, rows: 2, exampleRows: [5, 6] },
      ],
    });
  });

  it("finds a date column with more than one format", () => {
    const result = problem(
      spreadsheets({
        pedidos: [
          validOrder,
          validOrder,
          { ...validOrder, Data: "03/02/2025" },
        ],
      }),
      "mixed-date-formats",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 1,
      byFile: [{ file: SPREADSHEETS.pedidos.file, rows: 1, exampleRows: [7] }],
    });
  });

  it("finds money values written as text with a decimal comma", () => {
    const result = problem(
      spreadsheets({
        titulos: [validReceivable, { ...validReceivable, valor: "1.234,56" }],
      }),
      "decimal-comma-values",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 1,
      byFile: [{ file: SPREADSHEETS.titulos.file, rows: 1, exampleRows: [3] }],
    });
  });

  it("finds identical rows and receivables repeating id_titulo and parcela", () => {
    const result = problem(
      spreadsheets({
        clientes: [validClient, validClient],
        titulos: [
          validReceivable,
          { ...validReceivable, valor: "90.00" },
          { ...validReceivable, parcela: "2" },
        ],
      }),
      "duplicates",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 2,
      byFile: [
        { file: SPREADSHEETS.clientes.file, rows: 1, exampleRows: [5] },
        { file: SPREADSHEETS.titulos.file, rows: 1, exampleRows: [3] },
      ],
    });
  });

  it("finds orders without a client", () => {
    const result = problem(
      spreadsheets({ pedidos: [validOrder, { ...validOrder, Cliente: null }] }),
      "orders-without-client",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 1,
      byFile: [{ file: SPREADSHEETS.pedidos.file, rows: 1, exampleRows: [6] }],
    });
  });

  it("finds orders whose client is not a code from the clients file", () => {
    const result = problem(
      spreadsheets({
        pedidos: [
          validOrder,
          { ...validOrder, Cliente: "Construtora Exemplo" },
        ],
      }),
      "clients-identified-by-name",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 1,
      byFile: [{ file: SPREADSHEETS.pedidos.file, rows: 1, exampleRows: [6] }],
    });
  });

  it("finds quantities typed wrong", () => {
    const result = problem(
      spreadsheets({
        pedidos: [
          validOrder,
          { ...validOrder, Qtd: 2.5, Total: 6.25 },
          { ...validOrder, Qtd: 0, Total: 0 },
          { ...validOrder, Qtd: 100, Total: 25 },
        ],
      }),
      "wrong-quantities",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 3,
      byFile: [
        { file: SPREADSHEETS.pedidos.file, rows: 3, exampleRows: [6, 7, 8] },
      ],
    });
  });

  it("finds total lines", () => {
    const result = problem(
      spreadsheets({
        pedidos: [validOrder, { "Nº Pedido": "Total do mês" }],
      }),
      "total-lines",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 1,
      byFile: [{ file: SPREADSHEETS.pedidos.file, rows: 1, exampleRows: [6] }],
    });
  });

  it("finds receivables whose status disagrees with the payment date", () => {
    const result = problem(
      spreadsheets({
        titulos: [
          validReceivable,
          { ...validReceivable, id_titulo: "T2", status: "EM ABERTO" },
          { ...validReceivable, id_titulo: "T3", data_pagamento: null },
        ],
      }),
      "outdated-status",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 2,
      byFile: [
        { file: SPREADSHEETS.titulos.file, rows: 2, exampleRows: [3, 4] },
      ],
    });
  });

  it("keeps at most 5 example rows", () => {
    const result = problem(
      spreadsheets({
        pedidos: Array.from({ length: 7 }, () => ({
          ...validOrder,
          Cliente: null,
        })),
      }),
      "orders-without-client",
    );

    expect(result.rows).toBe(7);
    expect(result.byFile[0]?.exampleRows).toEqual([5, 6, 7, 8, 9]);
  });
});

describe("problems found after the first review", () => {
  it("finds status written in different ways", () => {
    const result = problem(
      spreadsheets({
        titulos: [
          validReceivable,
          { ...validReceivable, id_titulo: "T2" },
          { ...validReceivable, id_titulo: "T3", status: "pago " },
        ],
      }),
      "status-written-differently",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 1,
      byFile: [{ file: SPREADSHEETS.titulos.file, rows: 1, exampleRows: [4] }],
    });
  });

  it("finds salespeople identified by name and counts the spellings without the names", () => {
    const result = problem(
      spreadsheets({
        pedidos: [
          { ...validOrder, Vendedor: "Vendedora Exemplo" },
          { ...validOrder, Vendedor: "Vendedora Exemplo" },
          { ...validOrder, Vendedor: "Vend. Exemplo" },
        ],
      }),
      "salespeople-identified-by-name",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 3,
      byFile: [
        {
          file: SPREADSHEETS.pedidos.file,
          rows: 3,
          exampleRows: [5, 6, 7],
          distinctValues: 2,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("Exemplo");
  });

  it("finds missing required values in each file", () => {
    const result = problem(
      spreadsheets({
        clientes: [validClient, { ...validClient, "Cód.": null }],
        pedidos: [validOrder, { ...validOrder, Produto: null }],
        titulos: [
          validReceivable,
          { ...validReceivable, id_titulo: "T2", id_cliente: null },
        ],
      }),
      "missing-required-values",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 3,
      byFile: [
        { file: SPREADSHEETS.clientes.file, rows: 1, exampleRows: [5] },
        { file: SPREADSHEETS.pedidos.file, rows: 1, exampleRows: [6] },
        { file: SPREADSHEETS.titulos.file, rows: 1, exampleRows: [3] },
      ],
    });
  });

  it("includes the clients' Situação in the status spellings", () => {
    const result = problem(
      spreadsheets({
        clientes: [
          { ...validClient, Situação: "Ativo" },
          { ...validClient, "Cód.": "C002", Situação: "Ativo" },
          { ...validClient, "Cód.": "C003", Situação: "ativo" },
        ],
      }),
      "status-written-differently",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 1,
      byFile: [{ file: SPREADSHEETS.clientes.file, rows: 1, exampleRows: [6] }],
    });
  });

  it("finds status values outside the portal values", () => {
    const result = problem(
      spreadsheets({
        clientes: [
          { ...validClient, Situação: "Bloqueado" },
          { ...validClient, "Cód.": "C002", Situação: "ok" },
        ],
        titulos: [
          validReceivable,
          { ...validReceivable, id_titulo: "T2", status: "Em aberto " },
          { ...validReceivable, id_titulo: "T3", status: "QUITADO" },
        ],
      }),
      "unknown-status-values",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 2,
      byFile: [
        { file: SPREADSHEETS.clientes.file, rows: 1, exampleRows: [5] },
        { file: SPREADSHEETS.titulos.file, rows: 1, exampleRows: [4] },
      ],
    });
  });

  it("finds CNPJs written in different formats", () => {
    const result = problem(
      spreadsheets({
        clientes: [
          validClient,
          { ...validClient, "Cód.": "C002", CNPJ: "45.723.174/0001-10" },
          { ...validClient, "Cód.": "C003", CNPJ: "11222333000181" },
          { ...validClient, "Cód.": "C004", CNPJ: 45723174000110 },
        ],
      }),
      "cnpj-different-formats",
    );

    expect(result).toMatchObject({
      found: true,
      rows: 2,
      byFile: [
        { file: SPREADSHEETS.clientes.file, rows: 2, exampleRows: [6, 7] },
      ],
    });
  });
});

describe("receivables that will come from the ERP", () => {
  it("names Excel serial numbers and reads them as dates", () => {
    const sheets = spreadsheets({
      titulos: [
        validReceivable,
        { ...validReceivable, id_titulo: "T2", data_emissao: "46295" },
        { ...validReceivable, id_titulo: "T3", data_emissao: "46296" },
      ],
    });

    const result = diagnose(sheets);

    expect(
      result.profiles.titulos.columns.find(
        (column) => column.name === "data_emissao",
      )?.formats,
    ).toEqual(["Excel serial number", "yyyy-mm-dd"]);
    expect(result.receivablesFromErp).toBe(1);
  });

  it("counts receivables issued on or after 2026-10-01", () => {
    const sheets = spreadsheets({
      titulos: [
        validReceivable,
        { ...validReceivable, id_titulo: "T2", data_emissao: "30/09/2026" },
        { ...validReceivable, id_titulo: "T3", data_emissao: "2026-10-01" },
      ],
    });

    expect(diagnose(sheets).receivablesFromErp).toBe(1);
  });
});

describe("column match with the ERP", () => {
  it("lists every expected column of the three files", () => {
    for (const name of Object.keys(SPREADSHEETS) as SpreadsheetName[]) {
      expect(COLUMN_MATCHES[name].map((match) => match.column)).toEqual(
        SPREADSHEETS[name].columns,
      );
    }
  });

  it("matches CNPJ in both references and reports Telefone as no match", () => {
    const cnpj = COLUMN_MATCHES.clientes.find(
      (match) => match.column === "CNPJ",
    );
    const phone = COLUMN_MATCHES.clientes.find(
      (match) => match.column === "Telefone",
    );

    expect(cnpj).toEqual({
      column: "CNPJ",
      portalField: "Cliente.cnpj",
      erpField: "cliente.cnpj",
      conversion: "normalize to 14 digits",
    });
    expect(phone).toEqual({
      column: "Telefone",
      portalField: null,
      erpField: null,
      conversion: null,
    });
    expect(
      COLUMN_MATCHES.clientes.find((match) => match.column === "Vendedor")
        ?.conversion,
    ).toMatch(/name.*ERP salesperson code/);
    expect(
      COLUMN_MATCHES.titulos.find((match) => match.column === "parcela")
        ?.conversion,
    ).toMatch(/before .\/. or .de./);
  });
});
