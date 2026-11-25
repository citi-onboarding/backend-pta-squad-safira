import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  categoriasDeAlertaDoCadastro,
  categoriasDeAlertaDoModelo,
} from "../../src/modules/triage/triage.schemas.js";
import type {
  CategoriaDeAlertaDoCadastro,
  CategoriaDeAlertaDoModelo,
} from "../../src/modules/triage/triage.schemas.js";
import type { ExpectedTerm } from "./extraction-quality.js";

const gabaritoSchema = z.object({
  pedidos: z.array(
    z.object({
      arquivo: z.string(),
      numero_documento: z.string().nullable(),
      cliente: z.string(),
      itens: z.array(
        z.object({
          produto: z.string().nullable(),
          descricao_no_documento: z.string(),
          quantidade: z.number().positive(),
        }),
      ),
      alertas_esperados: z.array(z.string()),
    }),
  ),
  contratos: z.array(
    z.object({
      arquivo: z.string(),
      numero: z.string(),
      cliente: z.string(),
      inicio: z.iso.date(),
      fim: z.iso.date(),
      aviso_previo_dias: z.number().int().nonnegative(),
      renovacao_automatica: z.boolean(),
      prazo_pagamento: z.string(),
      volume_minimo_mensal_centavos: z.number().int().nonnegative(),
      tem_aditivo: z.boolean(),
      data_limite_aviso: z.iso.date(),
    }),
  ),
});

const categoria = z.enum([
  ...categoriasDeAlertaDoModelo,
  ...categoriasDeAlertaDoCadastro,
]);

const mappingSchema = z.object({
  revisado: z.boolean(),
  pedidos: z.array(
    z.object({
      arquivo: z.string(),
      alertas: z.array(
        z.object({
          posicao: z.number().int().nonnegative(),
          categorias: z.array(z.string()).min(1),
        }),
      ),
    }),
  ),
});

type Gabarito = z.infer<typeof gabaritoSchema>;

export interface ExpectedOrder {
  arquivo: string;
  numero_documento: string | null;
  cliente: string;
  itens: {
    produto: string | null;
    descricao_no_documento: string;
    quantidade: number;
  }[];
  alertasModelo: CategoriaDeAlertaDoModelo[];
  alertasCadastro: CategoriaDeAlertaDoCadastro[];
}

export type ExpectedContract = Gabarito["contratos"][number];

export interface AnswerKey {
  pedidos: ExpectedOrder[];
  contratos: ExpectedContract[];
}

const registry = new Set<string>(categoriasDeAlertaDoCadastro);

function isRegistry(value: string): value is CategoriaDeAlertaDoCadastro {
  return registry.has(value);
}

export function parseAnswerKey(gabarito: unknown, mapping: unknown): AnswerKey {
  const key = gabaritoSchema.parse(gabarito);
  const map = mappingSchema.parse(mapping);
  if (!map.revisado) {
    throw new Error("The alert-category mapping has not been reviewed.");
  }

  const pedidos = key.pedidos.map((pedido): ExpectedOrder => {
    const entry = map.pedidos.find((item) => item.arquivo === pedido.arquivo);
    if (!entry) {
      throw new Error(`No alert-category mapping for ${pedido.arquivo}.`);
    }
    const alertasModelo: CategoriaDeAlertaDoModelo[] = [];
    const alertasCadastro: CategoriaDeAlertaDoCadastro[] = [];
    pedido.alertas_esperados.forEach((_texto, posicao) => {
      const mapped = entry.alertas.find((alerta) => alerta.posicao === posicao);
      if (!mapped) {
        throw new Error(
          `${pedido.arquivo}: no category for alert ${String(posicao)}.`,
        );
      }
      for (const raw of mapped.categorias) {
        const parsed = categoria.safeParse(raw);
        if (!parsed.success) {
          throw new Error(
            `${pedido.arquivo}: unknown category in alert ${String(posicao)}.`,
          );
        }
        if (isRegistry(parsed.data)) alertasCadastro.push(parsed.data);
        else alertasModelo.push(parsed.data);
      }
    });
    return {
      arquivo: pedido.arquivo,
      numero_documento: pedido.numero_documento,
      cliente: pedido.cliente,
      itens: pedido.itens.map(
        ({ produto, descricao_no_documento, quantidade }) => ({
          produto,
          descricao_no_documento,
          quantidade,
        }),
      ),
      alertasModelo: [...new Set(alertasModelo)],
      alertasCadastro,
    };
  });

  return { pedidos, contratos: key.contratos };
}

function brazilianDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day ?? ""}/${month ?? ""}/${year ?? ""}`;
}

/** Terms that a good text extraction must contain, in document order. */
export function expectedTermsFor(
  document: ExpectedOrder | ExpectedContract,
): ExpectedTerm[] {
  if ("itens" in document) {
    return document.itens.map((item) => item.descricao_no_documento);
  }
  return [
    document.numero,
    [document.inicio, brazilianDate(document.inicio)],
    [document.fim, brazilianDate(document.fim)],
    document.prazo_pagamento,
  ];
}

export async function loadAnswerKey(directory: string): Promise<AnswerKey> {
  const read = async (path: string): Promise<unknown> =>
    JSON.parse(await readFile(join(directory, path), "utf8"));
  return parseAnswerKey(
    await read("gabarito-ia-01.json"),
    await read(join("spike", "alertas-categorias.json")),
  );
}
