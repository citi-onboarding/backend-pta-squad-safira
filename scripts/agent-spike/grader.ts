import { calcularDataLimiteAviso } from "../../src/modules/triage/notice-deadline.js";
import { calcularFimDaVigencia } from "../../src/modules/triage/term-end.js";
import type {
  CategoriaDeAlertaDoCadastro,
  PropostaContrato,
  PropostaPedido,
} from "../../src/modules/triage/triage.schemas.js";
import type { ExpectedContract, ExpectedOrder } from "./answer-key.js";

export interface OrderScore {
  cliente: number;
  itens: number;
  quantidades: number;
  alertas: number;
  alertasDeCadastro: CategoriaDeAlertaDoCadastro[];
}

export interface ContractScore {
  cliente: number;
  datas: number;
  termos: number;
}

function f1(
  truePositives: number,
  falsePositives: number,
  falseNegatives: number,
) {
  const denominator = 2 * truePositives + falsePositives + falseNegatives;
  return denominator === 0 ? 1 : (2 * truePositives) / denominator;
}

function share(flags: readonly boolean[]): number {
  return flags.length === 0 ? 0 : flags.filter(Boolean).length / flags.length;
}

/** Quantity per product code, summing repeated lines (RN-06). */
function quantitiesByCode(
  itens: readonly { produto: string | null; quantidade: number }[],
) {
  const totals = new Map<string, number>();
  for (const item of itens) {
    if (item.produto !== null) {
      totals.set(
        item.produto,
        (totals.get(item.produto) ?? 0) + item.quantidade,
      );
    }
  }
  return totals;
}

function gradeItems(expected: ExpectedOrder, proposta: PropostaPedido) {
  const expectedByCode = quantitiesByCode(expected.itens);
  const proposedByCode = quantitiesByCode(proposta.itens);
  const expectedUncoded = expected.itens.filter(
    (item) => item.produto === null,
  );
  const proposedUncoded = proposta.itens.filter(
    (item) => item.produto === null,
  );

  const matchedCodes = [...expectedByCode.keys()].filter((code) =>
    proposedByCode.has(code),
  );
  const matchedUncoded = Math.min(
    expectedUncoded.length,
    proposedUncoded.length,
  );
  const truePositives = matchedCodes.length + matchedUncoded;
  // Every proposed line beyond a match is wrong, so duplicates are penalized.
  const falsePositives = proposta.itens.length - truePositives;
  const falseNegatives = expected.itens.length - truePositives;

  const quantityFlags = [
    ...matchedCodes.map(
      (code) => expectedByCode.get(code) === proposedByCode.get(code),
    ),
    ...expectedUncoded
      .slice(0, matchedUncoded)
      .map(
        (item, index) => item.quantidade === proposedUncoded[index]?.quantidade,
      ),
  ];

  return {
    itens: f1(truePositives, falsePositives, falseNegatives),
    quantidades: share(quantityFlags),
  };
}

function gradeAlerts(
  expected: ExpectedOrder,
  proposta: PropostaPedido,
): number {
  const expectedSet = new Set<string>(expected.alertasModelo);
  const proposedSet = new Set<string>(
    proposta.alertas.map((alerta) => alerta.categoria),
  );
  const truePositives = [...proposedSet].filter((c) =>
    expectedSet.has(c),
  ).length;
  return f1(
    truePositives,
    proposedSet.size - truePositives,
    expectedSet.size - truePositives,
  );
}

export function gradeOrder(
  expected: ExpectedOrder,
  proposta: PropostaPedido,
): OrderScore {
  return {
    cliente: proposta.cliente === expected.cliente ? 1 : 0,
    ...gradeItems(expected, proposta),
    alertas: gradeAlerts(expected, proposta),
    alertasDeCadastro: [...expected.alertasCadastro],
  };
}

function sameText(a: string, b: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  return normalize(a) === normalize(b);
}

/** The stated end, or the end computed from the stated duration. */
function endOf(proposta: PropostaContrato): string | null {
  if (proposta.fim !== null) return proposta.fim;
  if (
    proposta.vigencia_meses === null ||
    proposta.data_base_vigencia === null
  ) {
    return null;
  }
  return calcularFimDaVigencia(
    proposta.data_base_vigencia,
    proposta.vigencia_meses,
  );
}

function deadlineOf(
  end: string | null,
  proposta: PropostaContrato,
): string | null {
  return end === null
    ? null
    : calcularDataLimiteAviso(end, proposta.aviso_previo_dias);
}

export function gradeContract(
  expected: ExpectedContract,
  proposta: PropostaContrato,
): ContractScore {
  return {
    cliente: proposta.cliente === expected.cliente ? 1 : 0,
    datas: share([
      proposta.inicio === expected.inicio,
      endOf(proposta) === expected.fim,
      deadlineOf(endOf(proposta), proposta) === expected.data_limite_aviso,
    ]),
    termos: share([
      proposta.numero === expected.numero,
      proposta.aviso_previo_dias === expected.aviso_previo_dias,
      proposta.renovacao_automatica === expected.renovacao_automatica,
      sameText(proposta.prazo_pagamento, expected.prazo_pagamento),
      proposta.volume_minimo_mensal_centavos ===
        expected.volume_minimo_mensal_centavos,
      proposta.tem_aditivo === expected.tem_aditivo,
    ]),
  };
}

export function zeroOrderScore(expected: ExpectedOrder): OrderScore {
  return {
    cliente: 0,
    itens: 0,
    quantidades: 0,
    alertas: 0,
    alertasDeCadastro: [...expected.alertasCadastro],
  };
}

export function zeroContractScore(): ContractScore {
  return { cliente: 0, datas: 0, termos: 0 };
}

/** Mean of every numeric field across scores. */
export function meanScores(
  scores: readonly Record<string, unknown>[],
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const score of scores) {
    for (const [field, value] of Object.entries(score)) {
      if (typeof value === "number") sums[field] = (sums[field] ?? 0) + value;
    }
  }
  return Object.fromEntries(
    Object.entries(sums).map(([field, sum]) => [field, sum / scores.length]),
  );
}
