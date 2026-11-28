import { StatusCliente } from "../../shared/database/generated/enums.js";
import { z } from "../../shared/http/openapi-zod.js";

// Each search page has at most this many clients; the screen asks the user
// to refine the search when the total is larger (prototype 3.2).
export const CUSTOMER_PAGE_SIZE = 60 as const;

export const customerSearchQuerySchema = z.strictObject({
  busca: z.string().trim().max(100).optional().openapi({
    description:
      "Part of the company name, the ERP code, or the CNPJ (with or without punctuation). Empty returns the whole portfolio.",
    example: "11.222.333/0001-81",
  }),
  pagina: z.coerce.number().int().min(1).default(1).openapi({
    description: "Page number, starting at 1.",
    example: 1,
  }),
});

export const customerIdSchema = z.strictObject({ id: z.uuid() });

const salespersonFields = {
  codigoVendedor: z.string().openapi({ example: "V01" }),
  // Name of the portal user linked to the salesperson code, if there is one.
  vendedorNome: z.string().nullable().openapi({ example: "Patrícia Lima" }),
};

export const customerListItemSchema = z
  .strictObject({
    id: z.uuid(),
    codigoErp: z.string().openapi({ example: "C0044" }),
    razaoSocial: z.string(),
    cnpj: z.string().openapi({
      description: "Digits only.",
      example: "11222333000181",
    }),
    cidade: z.string(),
    uf: z.string().length(2),
    status: z.enum(StatusCliente),
    ...salespersonFields,
    limiteDisponivelCentavos: z.int().openapi({
      description:
        "Credit limit minus unpaid ERP receivables (RN-01). May be negative.",
    }),
  })
  .openapi("CustomerListItem");

export const customerPageSchema = z
  .strictObject({
    itens: z.array(customerListItemSchema),
    total: z.int().min(0).openapi({
      description: "Number of clients that match the search in the portfolio.",
    }),
    pagina: z.int().min(1),
    tamanhoPagina: z.literal(CUSTOMER_PAGE_SIZE),
  })
  .openapi("CustomerPage");

export const creditPositionSchema = z
  .strictObject({
    limiteCreditoCentavos: z.int(),
    emAbertoCentavos: z.int().min(0).openapi({
      description: "Unpaid ERP receivables due today or later.",
    }),
    vencidoCentavos: z.int().min(0).openapi({
      description: "Unpaid ERP receivables due before today.",
    }),
    limiteDisponivelCentavos: z.int().openapi({
      description:
        "limiteCreditoCentavos − emAbertoCentavos − vencidoCentavos (RN-01). May be negative.",
    }),
  })
  .openapi("CreditPosition");

export const overdueReceivableSchema = z
  .strictObject({
    numero: z.string(),
    parcela: z.int().min(1),
    valorCentavos: z.int(),
    vencimento: z.iso.date().openapi({ example: "2026-11-17" }),
    diasEmAtraso: z.int().min(1),
  })
  .openapi("OverdueReceivable");

export const customerProfileSchema = z
  .strictObject({
    id: z.uuid(),
    codigoErp: z.string(),
    razaoSocial: z.string(),
    cnpj: z.string(),
    cidade: z.string(),
    uf: z.string().length(2),
    segmento: z.string(),
    status: z.enum(StatusCliente),
    ...salespersonFields,
    credito: creditPositionSchema,
    titulosVencidos: z.array(overdueReceivableSchema).openapi({
      description: "Oldest due date first.",
    }),
    ultimoPedidoEm: z.iso.datetime().nullable().openapi({
      description:
        "Always null until orders (BACK-06) or the history load (DATA-03 and DATA-04) exist.",
    }),
    ultimaSincronizacao: z.strictObject({
      clientesEm: z.iso.datetime().nullable().openapi({
        description: "End time of the last successful client sync.",
      }),
      titulosEm: z.iso.datetime().nullable().openapi({
        description: "End time of the last successful receivables sync.",
      }),
    }),
  })
  .openapi("CustomerProfile");

export type CustomerSearchQuery = z.infer<typeof customerSearchQuerySchema>;
export type CustomerListItem = z.infer<typeof customerListItemSchema>;
export type CustomerPage = z.infer<typeof customerPageSchema>;
export type CreditPosition = z.infer<typeof creditPositionSchema>;
export type OverdueReceivable = z.infer<typeof overdueReceivableSchema>;
export type CustomerProfile = z.infer<typeof customerProfileSchema>;
