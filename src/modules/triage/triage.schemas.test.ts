import { describe, expect, it } from "vitest";

import {
  categoriasDeAlertaDoModelo,
  categoriasDeAlertaDoCadastro,
  propostaContratoSchema,
  propostaPedidoSchema,
} from "./triage.schemas.js";

const pedidoValido = {
  numero_documento: "OC-1",
  cliente: "C0103",
  nome_cliente_no_documento: "Comercial Exemplo",
  cnpj_no_documento: "60.941.423/0001-38",
  itens: [
    {
      produto: "P00004",
      descricao_no_documento: "Cabo flexível 6mm² 750V",
      quantidade: 30,
      unidade_no_documento: "RL",
    },
  ],
  alertas: [],
};

const contratoValido = {
  numero: "CF-2025-014",
  cliente: "C0032",
  nome_cliente_no_documento: "Construtora Exemplo",
  cnpj_no_documento: null,
  inicio: "2025-12-01",
  fim: "2026-11-30",
  vigencia_meses: null,
  data_base_vigencia: null,
  aviso_previo_dias: 30,
  renovacao_automatica: false,
  prazo_pagamento: "30/60/90 dias",
  volume_minimo_mensal_centavos: 4_000_000,
  tem_aditivo: false,
  alertas: [],
};

function withItem(item: Record<string, unknown>) {
  return {
    ...pedidoValido,
    itens: [{ ...pedidoValido.itens[0], ...item }],
  };
}

describe("order proposal contract", () => {
  it("accepts a valid order proposal", () => {
    expect(propostaPedidoSchema.parse(pedidoValido)).toEqual(pedidoValido);
  });

  it("accepts a product that is not in the catalog", () => {
    const proposta = withItem({ produto: null, quantidade: 200 });

    expect(propostaPedidoSchema.parse(proposta).itens[0]?.produto).toBeNull();
  });

  it("accepts nulls for fields the document does not show", () => {
    const proposta = {
      ...withItem({ unidade_no_documento: null }),
      numero_documento: null,
      cliente: null,
      nome_cliente_no_documento: null,
      cnpj_no_documento: null,
    };

    expect(propostaPedidoSchema.safeParse(proposta).success).toBe(true);
  });

  it.each([0, -3, Number.NaN])("rejects quantity %s", (quantidade) => {
    expect(
      propostaPedidoSchema.safeParse(withItem({ quantidade })).success,
    ).toBe(false);
  });

  it("rejects a quantity that is not a number", () => {
    expect(
      propostaPedidoSchema.safeParse(withItem({ quantidade: "30" })).success,
    ).toBe(false);
  });

  it.each(["C103", "c0103", "C01030", "X0103"])(
    "rejects customer code %s",
    (cliente) => {
      expect(
        propostaPedidoSchema.safeParse({ ...pedidoValido, cliente }).success,
      ).toBe(false);
    },
  );

  it.each(["P0004", "P000040", "Q00004"])(
    "rejects product code %s",
    (produto) => {
      expect(
        propostaPedidoSchema.safeParse(withItem({ produto })).success,
      ).toBe(false);
    },
  );

  it("rejects an order without items", () => {
    expect(
      propostaPedidoSchema.safeParse({ ...pedidoValido, itens: [] }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      propostaPedidoSchema.safeParse({ ...pedidoValido, aprovado: true })
        .success,
    ).toBe(false);
  });
});

describe("contract proposal contract", () => {
  it("accepts a valid contract proposal", () => {
    expect(propostaContratoSchema.parse(contratoValido)).toEqual(
      contratoValido,
    );
  });

  it("rejects non-integer cents", () => {
    expect(
      propostaContratoSchema.safeParse({
        ...contratoValido,
        volume_minimo_mensal_centavos: 40_000.5,
      }).success,
    ).toBe(false);
  });

  it.each(["30/11/2026", "2026-02-30", "2026-13-01"])(
    "rejects date %s",
    (fim) => {
      expect(
        propostaContratoSchema.safeParse({ ...contratoValido, fim }).success,
      ).toBe(false);
    },
  );

  it("accepts a term stated only as a duration", () => {
    const proposta = {
      ...contratoValido,
      fim: null,
      vigencia_meses: 12,
      data_base_vigencia: "2025-12-10",
    };

    expect(propostaContratoSchema.safeParse(proposta).success).toBe(true);
  });

  it.each([
    ["no duration", { vigencia_meses: null, data_base_vigencia: "2025-12-10" }],
    ["no base date", { vigencia_meses: 12, data_base_vigencia: null }],
  ])("rejects a contract without an end date and with %s", (_label, fields) => {
    expect(
      propostaContratoSchema.safeParse({
        ...contratoValido,
        fim: null,
        ...fields,
      }).success,
    ).toBe(false);
  });

  it.each([0, 1.5])("rejects a duration of %s months", (vigencia_meses) => {
    expect(
      propostaContratoSchema.safeParse({
        ...contratoValido,
        fim: null,
        vigencia_meses,
        data_base_vigencia: "2025-12-10",
      }).success,
    ).toBe(false);
  });

  it("rejects a notice deadline sent by the model", () => {
    expect(
      propostaContratoSchema.safeParse({
        ...contratoValido,
        data_limite_aviso: "2026-10-31",
      }).success,
    ).toBe(false);
  });
});

describe("alert categories", () => {
  it("accepts a document-derived alert with a detail", () => {
    const proposta = {
      ...pedidoValido,
      alertas: [{ categoria: "SEM_CNPJ", detalhe: "No CNPJ in the header." }],
    };

    expect(propostaPedidoSchema.safeParse(proposta).success).toBe(true);
  });

  it.each(categoriasDeAlertaDoCadastro)(
    "rejects the registry-derived alert %s from the model",
    (categoria) => {
      const proposta = {
        ...contratoValido,
        alertas: [{ categoria, detalhe: "From the registry." }],
      };

      expect(propostaContratoSchema.safeParse(proposta).success).toBe(false);
    },
  );

  it("keeps model and registry categories disjoint", () => {
    const modelo = new Set<string>(categoriasDeAlertaDoModelo);

    expect(categoriasDeAlertaDoModelo).toContain("INSTRUCAO_NO_DOCUMENTO");
    expect(categoriasDeAlertaDoCadastro.filter((c) => modelo.has(c))).toEqual(
      [],
    );
  });
});
