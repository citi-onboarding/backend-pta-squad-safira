import { describe, expect, it } from "vitest";

import { diagnose, PROBLEM_IDS } from "../diagnose-spreadsheets.js";
import { readSpreadsheets } from "../read-spreadsheets.js";
import { CLEANING_RULES, renderDiagnosis } from "../render-diagnosis.js";
import {
  defaultClientRows,
  defaultOrderRows,
  writeFixtures,
} from "./spreadsheet-fixtures.js";

const [firstClient = [], secondClient = []] = defaultClientRows;
const [firstOrder = []] = defaultOrderRows;

// Sample files with two problems: a client written in two ways and an order
// whose total is a formula without a saved result.
async function sampleDocument(): Promise<string> {
  const folder = await writeFixtures({
    clientRows: [
      firstClient,
      secondClient,
      secondClient.map((value, index) =>
        index === 0
          ? "C003"
          : index === 1
            ? "ELETRICA  MODELO SA."
            : index === 5
              ? "Vendedora Ficticia"
              : value,
      ),
    ],
    orderRows: [
      firstOrder.map((value, index) =>
        index === 9
          ? { formula: "G5*I5" }
          : index === 3
            ? "Vendedor Inventado"
            : value,
      ),
    ],
  });
  return renderDiagnosis(diagnose(await readSpreadsheets(folder)));
}

function problemSections(document: string): string[] {
  return document
    .split("\n## ")
    .filter((section) => section.startsWith("Problem: "));
}

describe("renderDiagnosis", () => {
  it("covers the three files", async () => {
    const document = await sampleDocument();

    expect(document).toContain("Clientes - Comercial.xlsx");
    expect(document).toContain("Pedidos 2025-2026 - Comercial.xlsx");
    expect(document).toContain("titulos.csv");
  });

  it("has one section per problem, each found problem with exactly one rule", async () => {
    const sections = problemSections(await sampleDocument());

    expect(sections).toHaveLength(PROBLEM_IDS.length);
    for (const section of sections) {
      const rules = section.split("**Proposed cleaning rule:**").length - 1;
      if (section.includes("**Status:** found")) {
        expect(rules).toBe(1);
      } else {
        expect(section).toContain("**Status:** not found");
        expect(rules).toBe(0);
      }
    }
  });

  it("writes the agreed rule for a problem found", async () => {
    const document = await sampleDocument();
    const section = problemSections(document).find((entry) =>
      entry.includes(CLEANING_RULES["clients-written-differently"]),
    );

    expect(section).toContain("**Status:** found");
    expect(CLEANING_RULES["clients-written-differently"]).toMatch(/ERP/);
  });

  it("notes the totals that are formulas without a saved value", async () => {
    const document = await sampleDocument();

    expect(document).toMatch(/formula without a saved value/i);
  });

  it("states how many receivables come from the ERP from 2026-10-01", async () => {
    const document = await sampleDocument();

    expect(document).toMatch(/from 2026-10-01.*ERP/s);
  });

  it("lists the column match with the ERP", async () => {
    const document = await sampleDocument();

    expect(document).toContain(
      "| CNPJ | Cliente.cnpj | cliente.cnpj | normalize to 14 digits |",
    );
    expect(document).toContain("| Telefone | no match | no match | — |");
  });

  it("contains no client names, contacts, phones, or full CNPJs", async () => {
    const document = await sampleDocument();

    for (const secret of [
      "Construtora Exemplo",
      "Eletrica Modelo",
      "ELETRICA",
      "Ana Exemplo",
      "Bruno Modelo",
      "90000-0001",
      "90000-0002",
      "11.222.333/0001-81",
      "11222333000181",
      "45.723.174/0001-10",
      "Vendedora Ficticia",
      "Vendedor Inventado",
    ]) {
      expect(document).not.toContain(secret);
    }
  });

  it("produces the same text when rendered twice", async () => {
    expect(await sampleDocument()).toBe(await sampleDocument());
  });

  it("compares the row counts with the volumes the task expects", async () => {
    const document = await sampleDocument();

    for (const expected of ["135", "9,700", "6,500"]) {
      expect(document).toContain(expected);
    }
    expect(document).toMatch(/one row per item/i);
    expect(document).toMatch(/do not explain the difference/i);
    expect(document).toMatch(/confirm.*squad manager/i);
  });

  it("sends a client with neither a code nor a CNPJ to the pending list", () => {
    expect(CLEANING_RULES["missing-required-values"]).toMatch(
      /neither a code nor a CNPJ.*pending list/,
    );
  });
});
