import { z } from "zod";

// Mirrors DistriLux ERP API v3.3.0. Monetary values are integer cents (RN-13).

const centavos = z.number().int();

export const erpClienteSchema = z.object({
  codigo: z.string(),
  razaoSocial: z.string(),
  cnpj: z.string(),
  cidade: z.string(),
  uf: z.string(),
  segmento: z.string(),
  limiteCreditoCentavos: centavos,
  vendedor: z.string(),
  dataCadastro: z.string(),
  status: z.enum(["ATIVO", "BLOQUEADO", "INATIVO"]),
  atualizadoEm: z.string(),
});

export const erpProdutoSchema = z.object({
  codigo: z.string(),
  descricao: z.string(),
  categoria: z.string(),
  unidade: z.string(),
  precoTabelaCentavos: centavos,
  ativo: z.boolean(),
  atualizadoEm: z.string(),
});

export const erpTituloSchema = z.object({
  numero: z.number().int(),
  cliente: z.string(),
  pedidoErp: z.number().int(),
  parcela: z.string(),
  valorCentavos: centavos,
  emissao: z.string(),
  vencimento: z.string(),
  pagamento: z.string().nullable(),
  status: z.enum(["PAGO", "EM_ABERTO", "VENCIDO"]),
  atualizadoEm: z.string(),
});

export const erpPedidoSchema = z.object({
  numero: z.number().int(),
  status: z.enum(["RECEBIDO"]),
  cliente: z.string(),
  itens: z.array(
    z.object({
      produto: z.string(),
      descricao: z.string(),
      quantidade: z.number().int(),
      precoUnitarioCentavos: centavos,
      subtotalCentavos: centavos,
    }),
  ),
  valorTotalCentavos: centavos,
  referenciaPortal: z.string().nullable(),
  criadoEm: z.string(),
});

export function erpPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    dados: z.array(item),
    pagina: z.number().int(),
    tamanho: z.number().int(),
    total: z.number().int(),
    totalPaginas: z.number().int(),
  });
}

export const erpPageQuerySchema = z.object({
  pagina: z.number().int().min(1).optional(),
  tamanho: z.number().int().min(1).max(50).optional(),
  atualizadoDesde: z
    .union([z.iso.datetime({ offset: true }), z.iso.date()])
    .optional(),
});

export const erpNovoPedidoSchema = z.strictObject({
  cliente: z.string().min(1),
  itens: z
    .array(
      z.strictObject({
        produto: z.string().min(1),
        quantidade: z.number().int().min(1).max(9999),
      }),
    )
    .min(1)
    .max(50),
  referenciaPortal: z.string().min(1).max(64).optional(),
});

export const erpProblemSchema = z.object({
  detail: z.string().optional(),
  erros: z
    .array(z.object({ campo: z.string(), mensagem: z.string() }))
    .optional(),
});

export type ErpCliente = z.infer<typeof erpClienteSchema>;
export type ErpProduto = z.infer<typeof erpProdutoSchema>;
export type ErpTitulo = z.infer<typeof erpTituloSchema>;
export type ErpPedido = z.infer<typeof erpPedidoSchema>;
export type ErpNovoPedido = z.infer<typeof erpNovoPedidoSchema>;
export type ErpPageQuery = z.input<typeof erpPageQuerySchema>;
export interface ErpFieldError {
  campo: string;
  mensagem: string;
}
export interface ErpPage<T> {
  dados: T[];
  pagina: number;
  tamanho: number;
  total: number;
  totalPaginas: number;
}
