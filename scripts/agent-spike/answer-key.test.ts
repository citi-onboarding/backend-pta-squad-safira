import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  expectedTermsFor,
  loadAnswerKey,
  parseAnswerKey,
} from "./answer-key.js";

function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error("Expected at least one item");
  return item;
}

const gabarito = {
  descricao: "Synthetic answer key",
  gerado_em: "2026-11-25",
  pedidos: [
    {
      arquivo: "pedido-a.pdf",
      numero_documento: "A-1",
      formato: "PDF com texto",
      cliente: "C0001",
      cnpj_no_documento: null,
      itens: [
        {
          produto: "P00001",
          descricao_no_documento: "Cabo flexível 1,5mm²",
          quantidade: 10,
          unidade_no_documento: "RL",
        },
        {
          produto: null,
          descricao_no_documento: "Cabo inexistente",
          quantidade: 5,
          unidade_no_documento: "m",
          observacao: "not in catalog",
        },
      ],
      alertas_esperados: [
        "Document without CNPJ and other customers with the same name",
        "Customer blocked",
      ],
    },
  ],
  contratos: [
    {
      arquivo: "contrato-a.pdf",
      numero: "CF-2025-001",
      cliente: "C0002",
      inicio: "2025-12-01",
      fim: "2026-11-30",
      aviso_previo_dias: 30,
      renovacao_automatica: false,
      prazo_pagamento: "30/60 dias",
      volume_minimo_mensal_centavos: 4_000_000,
      tem_aditivo: false,
      data_limite_aviso: "2026-10-31",
    },
  ],
};

const mapping = {
  descricao: "Synthetic mapping",
  gerado_em: "2026-11-25",
  revisado: true,
  pedidos: [
    {
      arquivo: "pedido-a.pdf",
      alertas: [
        { posicao: 0, texto: "x", categorias: ["SEM_CNPJ", "NOME_PARECIDO"] },
        { posicao: 1, texto: "y", categorias: ["CLIENTE_BLOQUEADO"] },
      ],
    },
  ],
};

describe("parseAnswerKey", () => {
  it("separates model-scored and registry-derived alerts", () => {
    const key = parseAnswerKey(gabarito, mapping);
    const [pedido] = key.pedidos;

    expect(pedido?.alertasModelo).toEqual(["SEM_CNPJ"]);
    expect(pedido?.alertasCadastro).toEqual([
      "NOME_PARECIDO",
      "CLIENTE_BLOQUEADO",
    ]);
    expect(pedido?.itens).toHaveLength(2);
    expect(key.contratos[0]?.data_limite_aviso).toBe("2026-10-31");
  });

  it("fails when an order has no mapping entry", () => {
    expect(() => parseAnswerKey(gabarito, { ...mapping, pedidos: [] })).toThrow(
      "pedido-a.pdf",
    );
  });

  it("fails when an expected alert has no category, naming its position", () => {
    const [entry] = mapping.pedidos;
    const incomplete = {
      ...mapping,
      pedidos: [{ ...entry, alertas: entry?.alertas.slice(0, 1) }],
    };

    expect(() => parseAnswerKey(gabarito, incomplete)).toThrow(
      /pedido-a\.pdf.*1/,
    );
  });

  it("fails on an unknown category", () => {
    const [entry] = mapping.pedidos;
    const unknown = {
      ...mapping,
      pedidos: [
        {
          ...entry,
          alertas: [
            { posicao: 0, texto: "x", categorias: ["INVENTADA"] },
            { posicao: 1, texto: "y", categorias: ["CLIENTE_BLOQUEADO"] },
          ],
        },
      ],
    };

    expect(() => parseAnswerKey(gabarito, unknown)).toThrow(/pedido-a.pdf/);
  });

  it("fails when the mapping was not reviewed", () => {
    expect(() =>
      parseAnswerKey(gabarito, { ...mapping, revisado: false }),
    ).toThrow(/review/i);
  });
});

describe("expectedTermsFor", () => {
  it("uses item descriptions in order for orders", () => {
    const key = parseAnswerKey(gabarito, mapping);

    expect(expectedTermsFor(first(key.pedidos))).toEqual([
      "Cabo flexível 1,5mm²",
      "Cabo inexistente",
    ]);
  });

  it("uses the number, dates in two formats, and payment term for contracts", () => {
    const key = parseAnswerKey(gabarito, mapping);

    expect(expectedTermsFor(first(key.contratos))).toEqual([
      "CF-2025-001",
      ["2025-12-01", "01/12/2025"],
      ["2026-11-30", "30/11/2026"],
      "30/60 dias",
    ]);
  });
});

describe("loadAnswerKey", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("reads the answer key and the mapping from the materials directory", async () => {
    directory = await mkdtemp(join(tmpdir(), "answer-key-"));
    await mkdir(join(directory, "spike"));
    await writeFile(
      join(directory, "gabarito-ia-01.json"),
      JSON.stringify(gabarito),
    );
    await writeFile(
      join(directory, "spike", "alertas-categorias.json"),
      JSON.stringify(mapping),
    );

    const key = await loadAnswerKey(directory);

    expect(key.pedidos).toHaveLength(1);
    expect(key.contratos).toHaveLength(1);
  });
});
