import { describe, expect, it } from "vitest";

import type { CreditReceivable } from "./available-credit.js";
import {
  calcularLimiteDisponivel,
  listOverdueReceivables,
} from "./available-credit.js";

const today = "2026-11-27";

function receivable(overrides: Partial<CreditReceivable>): CreditReceivable {
  return {
    numero: "NF-1001",
    parcela: 1,
    valorCentavos: 100_000,
    vencimento: "2026-12-10",
    status: "EM_ABERTO",
    origem: "ERP",
    ...overrides,
  };
}

describe("calcularLimiteDisponivel (RN-01)", () => {
  it("keeps the whole limit for a client without receivables", () => {
    expect(
      calcularLimiteDisponivel({
        limiteCreditoCentavos: 2_000_000,
        titulos: [],
        hoje: today,
      }),
    ).toEqual({
      limiteCreditoCentavos: 2_000_000,
      emAbertoCentavos: 0,
      vencidoCentavos: 0,
      limiteDisponivelCentavos: 2_000_000,
    });
  });

  it("subtracts open and overdue receivables", () => {
    expect(
      calcularLimiteDisponivel({
        limiteCreditoCentavos: 2_000_000,
        titulos: [
          receivable({ valorCentavos: 500_000, vencimento: "2026-11-28" }),
          receivable({
            valorCentavos: 300_000,
            vencimento: "2026-11-26",
            status: "VENCIDO",
          }),
        ],
        hoje: today,
      }),
    ).toEqual({
      limiteCreditoCentavos: 2_000_000,
      emAbertoCentavos: 500_000,
      vencidoCentavos: 300_000,
      limiteDisponivelCentavos: 1_200_000,
    });
  });

  it("ignores paid receivables", () => {
    const position = calcularLimiteDisponivel({
      limiteCreditoCentavos: 2_000_000,
      titulos: [receivable({ valorCentavos: 500_000, status: "PAGO" })],
      hoje: today,
    });

    expect(position.limiteDisponivelCentavos).toBe(2_000_000);
  });

  it("ignores receivables loaded from the old spreadsheet", () => {
    const position = calcularLimiteDisponivel({
      limiteCreditoCentavos: 2_000_000,
      titulos: [
        receivable({ valorCentavos: 400_000, origem: "PLANILHA" }),
        receivable({
          valorCentavos: 400_000,
          origem: "PLANILHA",
          vencimento: "2026-01-10",
        }),
      ],
      hoje: today,
    });

    expect(position).toMatchObject({
      emAbertoCentavos: 0,
      vencidoCentavos: 0,
      limiteDisponivelCentavos: 2_000_000,
    });
  });

  it("returns a negative available credit when unpaid receivables pass the limit", () => {
    const position = calcularLimiteDisponivel({
      limiteCreditoCentavos: 1_000_000,
      titulos: [
        receivable({ valorCentavos: 950_000 }),
        receivable({ valorCentavos: 300_000, vencimento: "2026-11-17" }),
      ],
      hoje: today,
    });

    expect(position.limiteDisponivelCentavos).toBe(-250_000);
  });

  it("counts a receivable due today as open, not overdue", () => {
    const position = calcularLimiteDisponivel({
      limiteCreditoCentavos: 1_000_000,
      titulos: [receivable({ valorCentavos: 200_000, vencimento: today })],
      hoje: today,
    });

    expect(position).toMatchObject({
      emAbertoCentavos: 200_000,
      vencidoCentavos: 0,
    });
  });

  it("uses the due date, not the ERP status, to tell open from overdue", () => {
    const position = calcularLimiteDisponivel({
      limiteCreditoCentavos: 1_000_000,
      titulos: [
        receivable({
          valorCentavos: 100_000,
          vencimento: "2026-11-26",
          status: "EM_ABERTO",
        }),
      ],
      hoje: today,
    });

    expect(position).toMatchObject({
      emAbertoCentavos: 0,
      vencidoCentavos: 100_000,
    });
  });
});

describe("listOverdueReceivables", () => {
  it("lists unpaid ERP receivables due before today, oldest first, with days overdue", () => {
    expect(
      listOverdueReceivables(
        [
          receivable({
            numero: "NF-3",
            valorCentavos: 300_000,
            vencimento: "2026-11-17",
          }),
          receivable({
            numero: "NF-1",
            parcela: 2,
            valorCentavos: 120_000,
            vencimento: "2026-10-28",
          }),
          receivable({ numero: "NF-4", vencimento: today }),
          receivable({
            numero: "NF-5",
            vencimento: "2026-11-01",
            status: "PAGO",
          }),
          receivable({
            numero: "NF-6",
            vencimento: "2026-11-01",
            origem: "PLANILHA",
          }),
        ],
        today,
      ),
    ).toEqual([
      {
        numero: "NF-1",
        parcela: 2,
        valorCentavos: 120_000,
        vencimento: "2026-10-28",
        diasEmAtraso: 30,
      },
      {
        numero: "NF-3",
        parcela: 1,
        valorCentavos: 300_000,
        vencimento: "2026-11-17",
        diasEmAtraso: 10,
      },
    ]);
  });

  it("returns an empty list when nothing is overdue", () => {
    expect(
      listOverdueReceivables([receivable({ vencimento: "2026-12-01" })], today),
    ).toEqual([]);
  });
});
