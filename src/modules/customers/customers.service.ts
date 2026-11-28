import type { CreditReceivable } from "../../shared/credit/available-credit.js";
import {
  calcularLimiteDisponivel,
  listOverdueReceivables,
} from "../../shared/credit/available-credit.js";
import { businessDate } from "../../shared/credit/business-date.js";
import type { StatusCliente } from "../../shared/database/generated/enums.js";
import type { ClientPortfolioFilter } from "../../shared/http/require-role.js";
import { CUSTOMER_PAGE_SIZE } from "./customers.schemas.js";
import type {
  CustomerPage,
  CustomerProfile,
  CustomerSearchQuery,
} from "./customers.schemas.js";

/** Portfolio of a user who may see clients: `{}` means every portfolio. */
export type PortfolioFilter = NonNullable<ClientPortfolioFilter>;

export interface CustomerRecord {
  id: string;
  codigoErp: string;
  razaoSocial: string;
  cnpj: string;
  cidade: string;
  uf: string;
  segmento: string;
  status: StatusCliente;
  codigoVendedor: string;
  limiteCreditoCentavos: number;
}

export interface ReceivableRecord extends CreditReceivable {
  clienteId: string;
}

export interface CustomerSearchCriteria {
  filter: PortfolioFilter;
  skip: number;
  take: number;
  /** Matched against part of the company name and of the ERP code. */
  texto?: string | undefined;
  /** Matched against part of the CNPJ, which is stored as digits only. */
  digitosCnpj?: string | undefined;
}

export interface LastSuccessfulSyncs {
  clientesEm: Date | null;
  titulosEm: Date | null;
}

export interface CustomersRepository {
  search(
    criteria: CustomerSearchCriteria,
  ): Promise<{ customers: CustomerRecord[]; total: number }>;
  findById(id: string, filter: PortfolioFilter): Promise<CustomerRecord | null>;
  /** Receivables that are not paid, of the given clients. */
  findUnpaidReceivables(customerIds: string[]): Promise<ReceivableRecord[]>;
  findSalespersonNames(codes: string[]): Promise<Map<string, string>>;
  findLastSuccessfulSyncs(): Promise<LastSuccessfulSyncs>;
}

// A term made only of digits and CNPJ punctuation is also a CNPJ search.
// Terms with letters, such as the code C0001, are not: their digits would
// match almost every CNPJ branch number (0001).
const CNPJ_TERM = /^[\d./\-\s]+$/;
const MINIMUM_CNPJ_DIGITS = 3;

function cnpjDigits(term: string): string | undefined {
  if (!CNPJ_TERM.test(term)) {
    return undefined;
  }
  const digits = term.replace(/\D/g, "");
  return digits.length >= MINIMUM_CNPJ_DIGITS ? digits : undefined;
}

function groupByCustomer(
  receivables: ReceivableRecord[],
): Map<string, ReceivableRecord[]> {
  const byCustomer = new Map<string, ReceivableRecord[]>();
  for (const receivable of receivables) {
    const group = byCustomer.get(receivable.clienteId) ?? [];
    group.push(receivable);
    byCustomer.set(receivable.clienteId, group);
  }
  return byCustomer;
}

export class CustomersService {
  constructor(
    private readonly repository: CustomersRepository,
    private readonly now: () => Date,
  ) {}

  async search(
    filter: PortfolioFilter,
    query: CustomerSearchQuery,
  ): Promise<CustomerPage> {
    const criteria: CustomerSearchCriteria = {
      filter,
      skip: (query.pagina - 1) * CUSTOMER_PAGE_SIZE,
      take: CUSTOMER_PAGE_SIZE,
    };
    const term = query.busca?.trim() ?? "";
    if (term !== "") {
      criteria.texto = term;
      criteria.digitosCnpj = cnpjDigits(term);
    }

    const { customers, total } = await this.repository.search(criteria);
    const page = {
      total,
      pagina: query.pagina,
      tamanhoPagina: CUSTOMER_PAGE_SIZE,
    };
    if (customers.length === 0) {
      return { itens: [], ...page };
    }

    const [receivables, salespersonNames] = await Promise.all([
      this.repository.findUnpaidReceivables(customers.map(({ id }) => id)),
      this.repository.findSalespersonNames([
        ...new Set(customers.map(({ codigoVendedor }) => codigoVendedor)),
      ]),
    ]);
    const receivablesByCustomer = groupByCustomer(receivables);
    const hoje = businessDate(this.now());

    return {
      itens: customers.map(
        ({ segmento: _segmento, limiteCreditoCentavos, ...listed }) => ({
          ...listed,
          vendedorNome: salespersonNames.get(listed.codigoVendedor) ?? null,
          limiteDisponivelCentavos: calcularLimiteDisponivel({
            limiteCreditoCentavos,
            titulos: receivablesByCustomer.get(listed.id) ?? [],
            hoje,
          }).limiteDisponivelCentavos,
        }),
      ),
      ...page,
    };
  }

  /** Returns null for a missing client and for a client outside the portfolio. */
  async getProfile(
    filter: PortfolioFilter,
    id: string,
  ): Promise<CustomerProfile | null> {
    const customer = await this.repository.findById(id, filter);
    if (customer === null) {
      return null;
    }

    const [receivables, salespersonNames, syncs] = await Promise.all([
      this.repository.findUnpaidReceivables([customer.id]),
      this.repository.findSalespersonNames([customer.codigoVendedor]),
      this.repository.findLastSuccessfulSyncs(),
    ]);
    const hoje = businessDate(this.now());
    const { limiteCreditoCentavos, ...registration } = customer;

    return {
      ...registration,
      vendedorNome: salespersonNames.get(customer.codigoVendedor) ?? null,
      credito: calcularLimiteDisponivel({
        limiteCreditoCentavos,
        titulos: receivables,
        hoje,
      }),
      titulosVencidos: listOverdueReceivables(receivables, hoje),
      // Orders exist only after BACK-06 and the history load after DATA-03/04.
      ultimoPedidoEm: null,
      ultimaSincronizacao: {
        clientesEm: syncs.clientesEm?.toISOString() ?? null,
        titulosEm: syncs.titulosEm?.toISOString() ?? null,
      },
    };
  }
}
