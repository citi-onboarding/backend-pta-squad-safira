import type { Database } from "../../shared/database/create-database.js";
import type { TipoRegistro } from "../../shared/database/generated/enums.js";
import type {
  CustomerRecord,
  CustomerSearchCriteria,
  CustomersRepository,
  LastSuccessfulSyncs,
  PortfolioFilter,
  ReceivableRecord,
} from "./customers.service.js";

const customerFields = {
  id: true,
  codigoErp: true,
  razaoSocial: true,
  cnpj: true,
  cidade: true,
  uf: true,
  segmento: true,
  status: true,
  codigoVendedor: true,
  limiteCreditoCentavos: true,
} as const;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function searchWhere({ filter, texto, digitosCnpj }: CustomerSearchCriteria) {
  if (texto === undefined) {
    return { ...filter };
  }
  return {
    ...filter,
    OR: [
      { razaoSocial: { contains: texto, mode: "insensitive" as const } },
      { codigoErp: { contains: texto, mode: "insensitive" as const } },
      ...(digitosCnpj === undefined
        ? []
        : [{ cnpj: { contains: digitosCnpj } }]),
    ],
  };
}

export class PrismaCustomersRepository implements CustomersRepository {
  constructor(private readonly database: Database) {}

  async search(
    criteria: CustomerSearchCriteria,
  ): Promise<{ customers: CustomerRecord[]; total: number }> {
    const where = searchWhere(criteria);
    const [customers, total] = await this.database.$transaction([
      this.database.cliente.findMany({
        where,
        select: customerFields,
        orderBy: [{ razaoSocial: "asc" }, { codigoErp: "asc" }],
        skip: criteria.skip,
        take: criteria.take,
      }),
      this.database.cliente.count({ where }),
    ]);
    return { customers, total };
  }

  findById(
    id: string,
    filter: PortfolioFilter,
  ): Promise<CustomerRecord | null> {
    // The portfolio filter is part of the lookup, so a client of another
    // portfolio is never loaded and answers like a missing one.
    return this.database.cliente.findFirst({
      where: { id, ...filter },
      select: customerFields,
    });
  }

  async findUnpaidReceivables(
    customerIds: string[],
  ): Promise<ReceivableRecord[]> {
    const receivables = await this.database.titulo.findMany({
      where: { clienteId: { in: customerIds }, status: { not: "PAGO" } },
      select: {
        clienteId: true,
        numero: true,
        parcela: true,
        valorCentavos: true,
        vencimento: true,
        status: true,
        origem: true,
      },
    });
    return receivables.map((receivable) => ({
      ...receivable,
      vencimento: toDateOnly(receivable.vencimento),
    }));
  }

  async findSalespersonNames(codes: string[]): Promise<Map<string, string>> {
    const users = await this.database.usuario.findMany({
      where: { codigoVendedor: { in: codes } },
      select: { codigoVendedor: true, nome: true },
    });
    return new Map(
      users.flatMap(({ codigoVendedor, nome }) =>
        codigoVendedor === null ? [] : [[codigoVendedor, nome] as const],
      ),
    );
  }

  async findLastSuccessfulSyncs(): Promise<LastSuccessfulSyncs> {
    const [clientesEm, titulosEm] = await Promise.all([
      this.lastSuccessfulSync("SINCRONIZACAO_CLIENTES"),
      this.lastSuccessfulSync("SINCRONIZACAO_TITULOS"),
    ]);
    return { clientesEm, titulosEm };
  }

  private async lastSuccessfulSync(tipo: TipoRegistro): Promise<Date | null> {
    const run = await this.database.registroSincronizacao.findFirst({
      where: { tipo, resultado: "SUCESSO", terminouEm: { not: null } },
      orderBy: { terminouEm: "desc" },
      select: { terminouEm: true },
    });
    return run?.terminouEm ?? null;
  }
}
