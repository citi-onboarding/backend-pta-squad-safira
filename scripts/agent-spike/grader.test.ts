import { describe, expect, it } from "vitest";

import type {
  PropostaContrato,
  PropostaPedido,
} from "../../src/modules/triage/triage.schemas.js";
import type { ExpectedContract, ExpectedOrder } from "./answer-key.js";
import {
  gradeContract,
  gradeOrder,
  meanScores,
  zeroContractScore,
  zeroOrderScore,
} from "./grader.js";

const expectedOrder: ExpectedOrder = {
  arquivo: "pedido.pdf",
  numero_documento: "OC-1",
  cliente: "C0103",
  itens: [
    { produto: "P00004", descricao_no_documento: "a", quantidade: 30 },
    { produto: "P00005", descricao_no_documento: "b", quantidade: 20 },
    { produto: "P00007", descricao_no_documento: "c", quantidade: 500 },
    { produto: "P00060", descricao_no_documento: "d", quantidade: 15 },
    { produto: "P00056", descricao_no_documento: "e", quantidade: 4 },
  ],
  alertasModelo: ["PEDIDO_DE_DESCONTO"],
  alertasCadastro: ["NOME_PARECIDO"],
};

function proposalFrom(
  expected: ExpectedOrder,
  overrides: Partial<PropostaPedido> = {},
): PropostaPedido {
  return {
    numero_documento: expected.numero_documento,
    cliente: expected.cliente,
    nome_cliente_no_documento: "Cliente",
    cnpj_no_documento: null,
    itens: expected.itens.map((item) => ({
      produto: item.produto,
      descricao_no_documento: item.descricao_no_documento,
      quantidade: item.quantidade,
      unidade_no_documento: null,
    })),
    alertas: expected.alertasModelo.map((categoria) => ({
      categoria,
      detalhe: "detail",
    })),
    ...overrides,
  };
}

function itemAt(proposal: PropostaPedido, index: number) {
  const item = proposal.itens[index];
  if (!item) throw new Error(`No item at ${String(index)}`);
  return item;
}

const expectedContract: ExpectedContract = {
  arquivo: "contrato.pdf",
  numero: "CF-2025-016",
  cliente: "C0014",
  inicio: "2025-11-16",
  fim: "2027-05-15",
  aviso_previo_dias: 30,
  renovacao_automatica: false,
  prazo_pagamento: "30/60 dias",
  volume_minimo_mensal_centavos: 5_500_000,
  tem_aditivo: true,
  data_limite_aviso: "2027-04-15",
};

function contractProposal(
  overrides: Partial<PropostaContrato> = {},
): PropostaContrato {
  const {
    numero,
    cliente,
    inicio,
    fim,
    aviso_previo_dias,
    renovacao_automatica,
    prazo_pagamento,
    volume_minimo_mensal_centavos,
    tem_aditivo,
  } = expectedContract;
  return {
    numero,
    cliente,
    inicio,
    fim,
    aviso_previo_dias,
    renovacao_automatica,
    prazo_pagamento,
    volume_minimo_mensal_centavos,
    tem_aditivo,
    vigencia_meses: null,
    data_base_vigencia: null,
    nome_cliente_no_documento: "Cliente",
    cnpj_no_documento: null,
    alertas: [],
    ...overrides,
  };
}

describe("gradeOrder", () => {
  it("scores 1 in every field for a perfect order", () => {
    expect(gradeOrder(expectedOrder, proposalFrom(expectedOrder))).toEqual({
      cliente: 1,
      itens: 1,
      quantidades: 1,
      alertas: 1,
      alertasDeCadastro: ["NOME_PARECIDO"],
    });
  });

  it("scores a wrong customer 0 and the other fields normally", () => {
    const score = gradeOrder(
      expectedOrder,
      proposalFrom(expectedOrder, { cliente: "C0001" }),
    );

    expect(score).toMatchObject({ cliente: 0, itens: 1, quantidades: 1 });
  });

  it("scores items by F1 when one is missing and one is extra", () => {
    const proposal = proposalFrom(expectedOrder);
    proposal.itens = [
      ...proposal.itens.slice(0, 4),
      {
        produto: "P00099",
        descricao_no_documento: "z",
        quantidade: 1,
        unidade_no_documento: null,
      },
    ];

    expect(gradeOrder(expectedOrder, proposal).itens).toBeCloseTo(0.8);
  });

  it("scores quantities over the matched items", () => {
    const proposal = proposalFrom(expectedOrder);
    proposal.itens[2] = { ...itemAt(proposal, 2), quantidade: 50 };

    expect(gradeOrder(expectedOrder, proposal).quantidades).toBeCloseTo(0.8);
  });

  it("penalizes a duplicated product line and compares its summed quantity", () => {
    const expected: ExpectedOrder = {
      ...expectedOrder,
      itens: [
        { produto: "P00025", descricao_no_documento: "x", quantidade: 120 },
      ],
    };
    const proposal = proposalFrom(expected, {
      itens: [
        {
          produto: "P00025",
          descricao_no_documento: "x",
          quantidade: 80,
          unidade_no_documento: null,
        },
        {
          produto: "P00025",
          descricao_no_documento: "x",
          quantidade: 40,
          unidade_no_documento: null,
        },
      ],
    });

    const score = gradeOrder(expected, proposal);

    expect(score.itens).toBeCloseTo(2 / 3);
    expect(score.quantidades).toBe(1);
  });

  it("matches an item without a code to a proposed item without a code", () => {
    const expected: ExpectedOrder = {
      ...expectedOrder,
      itens: [
        { produto: "P00010", descricao_no_documento: "a", quantidade: 500 },
        { produto: null, descricao_no_documento: "b", quantidade: 200 },
      ],
    };

    expect(gradeOrder(expected, proposalFrom(expected))).toMatchObject({
      itens: 1,
      quantidades: 1,
    });
  });

  it("counts a substituted product as missing plus a wrong item", () => {
    const expected: ExpectedOrder = {
      ...expectedOrder,
      itens: [
        { produto: "P00010", descricao_no_documento: "a", quantidade: 500 },
        { produto: null, descricao_no_documento: "b", quantidade: 200 },
      ],
    };
    const proposal = proposalFrom(expected);
    proposal.itens[1] = { ...itemAt(proposal, 1), produto: "P00012" };

    const score = gradeOrder(expected, proposal);

    expect(score.itens).toBeCloseTo(0.5);
    expect(score.quantidades).toBe(1);
  });

  it("scores alerts 1 when none are expected and none are proposed", () => {
    const expected: ExpectedOrder = { ...expectedOrder, alertasModelo: [] };

    expect(gradeOrder(expected, proposalFrom(expected)).alertas).toBe(1);
  });

  it("scores alerts by F1 of categories", () => {
    const expected: ExpectedOrder = {
      ...expectedOrder,
      alertasModelo: ["SEM_CNPJ", "ITEM_CONSOLIDADO"],
    };
    const proposal = proposalFrom(expected, {
      alertas: [
        { categoria: "SEM_CNPJ", detalhe: "d" },
        { categoria: "DOCUMENTO_ESCANEADO", detalhe: "d" },
      ],
    });

    expect(gradeOrder(expected, proposal).alertas).toBeCloseTo(0.5);
  });

  it("scores 0 when no expected item is matched", () => {
    const proposal = proposalFrom(expectedOrder, {
      itens: [
        {
          produto: "P00099",
          descricao_no_documento: "z",
          quantidade: 1,
          unidade_no_documento: null,
        },
      ],
    });

    expect(gradeOrder(expectedOrder, proposal)).toMatchObject({
      itens: 0,
      quantidades: 0,
    });
  });

  it("reports registry-derived alerts without scoring them", () => {
    const proposal = proposalFrom(expectedOrder);

    expect(gradeOrder(expectedOrder, proposal).alertasDeCadastro).toEqual([
      "NOME_PARECIDO",
    ]);
  });
});

describe("gradeContract", () => {
  it("scores 1 in every field for a perfect contract", () => {
    expect(gradeContract(expectedContract, contractProposal())).toEqual({
      cliente: 1,
      datas: 1,
      termos: 1,
    });
  });

  it("counts a wrong end date in both end and notice deadline", () => {
    const score = gradeContract(
      expectedContract,
      contractProposal({ fim: "2026-11-15" }),
    );

    expect(score.datas).toBeCloseTo(1 / 3);
  });

  it("computes the end of a term stated as a duration", () => {
    const expected: ExpectedContract = {
      ...expectedContract,
      inicio: "2025-12-10",
      fim: "2026-12-09",
      aviso_previo_dias: 15,
      data_limite_aviso: "2026-11-24",
    };
    const score = gradeContract(
      expected,
      contractProposal({
        inicio: "2025-12-10",
        fim: null,
        vigencia_meses: 12,
        data_base_vigencia: "2025-12-10",
        aviso_previo_dias: 15,
      }),
    );

    expect(score.datas).toBe(1);
  });

  it("counts an ignored amendment as a wrong term", () => {
    const score = gradeContract(
      expectedContract,
      contractProposal({ volume_minimo_mensal_centavos: 4_500_000 }),
    );

    expect(score.termos).toBeCloseTo(5 / 6);
  });

  it("compares the payment term ignoring case and spaces", () => {
    const score = gradeContract(
      expectedContract,
      contractProposal({ prazo_pagamento: "30 / 60 DIAS" }),
    );

    expect(score.termos).toBe(1);
  });
});

describe("score aggregation", () => {
  it("scores invalid documents 0 in every field", () => {
    expect(zeroOrderScore(expectedOrder)).toEqual({
      cliente: 0,
      itens: 0,
      quantidades: 0,
      alertas: 0,
      alertasDeCadastro: ["NOME_PARECIDO"],
    });
    expect(zeroContractScore()).toEqual({ cliente: 0, datas: 0, termos: 0 });
  });

  it("averages each numeric field", () => {
    expect(
      meanScores([
        { cliente: 1, datas: 0.5, termos: 1 },
        { cliente: 0, datas: 1, termos: 0.5 },
      ]),
    ).toEqual({ cliente: 0.5, datas: 0.75, termos: 0.75 });
  });

  it("returns an empty mean for no scores", () => {
    expect(meanScores([])).toEqual({});
  });
});
