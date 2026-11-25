import { z } from "zod";

// Groundwork for IA-02: not wired to any route yet. Field names mirror the
// IA-01 answer key and the ERP domain terms (Portuguese), as in src/shared/erp.

/** Alerts the model may raise: facts visible in the document itself. */
export const categoriasDeAlertaDoModelo = [
  "SEM_CNPJ",
  "ITENS_SEM_CODIGO",
  "ITEM_CONSOLIDADO",
  "PRODUTO_FORA_DO_CATALOGO",
  "UNIDADE_DIVERGENTE",
  "PEDIDO_DE_DESCONTO",
  "CONDICAO_DE_PAGAMENTO_SOLICITADA",
  "DOCUMENTO_ESCANEADO",
  "DOCUMENTO_MANUSCRITO",
  "INSTRUCAO_NO_DOCUMENTO",
] as const;

/** Alerts that depend on registry data; produced by code, never by the model. */
export const categoriasDeAlertaDoCadastro = [
  "CLIENTE_BLOQUEADO",
  "CONTRATO_VENCIDO",
  "NOME_PARECIDO",
  "NOME_DIFERENTE_DO_CADASTRO",
] as const;

export type CategoriaDeAlertaDoModelo =
  (typeof categoriasDeAlertaDoModelo)[number];
export type CategoriaDeAlertaDoCadastro =
  (typeof categoriasDeAlertaDoCadastro)[number];

const codigoCliente = z.string().regex(/^C\d{4}$/);
const codigoProduto = z.string().regex(/^P\d{5}$/);
const textoDoDocumento = z.string().nullable();

const alertaSchema = z.strictObject({
  categoria: z.enum(categoriasDeAlertaDoModelo),
  detalhe: z.string(),
});

export const propostaPedidoSchema = z.strictObject({
  numero_documento: textoDoDocumento,
  cliente: codigoCliente.nullable(),
  nome_cliente_no_documento: textoDoDocumento,
  cnpj_no_documento: textoDoDocumento,
  itens: z
    .array(
      z.strictObject({
        produto: codigoProduto.nullable(),
        descricao_no_documento: textoDoDocumento,
        quantidade: z.number().positive(),
        unidade_no_documento: textoDoDocumento,
      }),
    )
    .min(1),
  alertas: z.array(alertaSchema),
});

export const propostaContratoSchema = z
  .strictObject({
    numero: z.string(),
    cliente: codigoCliente.nullable(),
    nome_cliente_no_documento: textoDoDocumento,
    cnpj_no_documento: textoDoDocumento,
    inicio: z.iso.date(),
    fim: z.iso.date().nullable(),
    // When the document states only a duration, code computes the end (RN-19).
    vigencia_meses: z.number().int().positive().nullable(),
    data_base_vigencia: z.iso.date().nullable(),
    aviso_previo_dias: z.number().int().nonnegative(),
    renovacao_automatica: z.boolean(),
    prazo_pagamento: z.string(),
    volume_minimo_mensal_centavos: z.number().int().nonnegative(),
    tem_aditivo: z.boolean(),
    alertas: z.array(alertaSchema),
  })
  .refine(
    (proposta) =>
      proposta.fim !== null ||
      (proposta.vigencia_meses !== null &&
        proposta.data_base_vigencia !== null),
    {
      message:
        "A contract without an end date needs its duration and base date.",
    },
  );

export type PropostaPedido = z.infer<typeof propostaPedidoSchema>;
export type PropostaContrato = z.infer<typeof propostaContratoSchema>;
