import { describe, expect, it, vi } from "vitest";

import {
  customerPageSchema,
  customerProfileSchema,
} from "./customers.schemas.js";
import type {
  CustomerRecord,
  CustomerSearchCriteria,
  ReceivableRecord,
} from "./customers.service.js";
import { CustomersService } from "./customers.service.js";

// 27/11/2026, noon in Recife.
const now = new Date("2026-11-27T15:00:00Z");

const exemplo: CustomerRecord = {
  id: "0f8b3c2a-1d4e-4f5a-8b9c-0d1e2f3a4b5c",
  codigoErp: "C9001",
  razaoSocial: "Construtora Exemplo Ltda",
  cnpj: "11222333000181",
  cidade: "Recife",
  uf: "PE",
  segmento: "Construtora",
  status: "ATIVO",
  codigoVendedor: "V01",
  limiteCreditoCentavos: 2_000_000,
};

const semNome: CustomerRecord = {
  ...exemplo,
  id: "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f",
  codigoErp: "C9002",
  razaoSocial: "Elétrica Sem Vendedor ME",
  cnpj: "44555666000199",
  codigoVendedor: "V09",
  limiteCreditoCentavos: 1_000_000,
};

const receivables: ReceivableRecord[] = [
  {
    clienteId: exemplo.id,
    numero: "NF-2001",
    parcela: 1,
    valorCentavos: 500_000,
    vencimento: "2026-12-05",
    status: "EM_ABERTO",
    origem: "ERP",
  },
  {
    clienteId: exemplo.id,
    numero: "NF-1201",
    parcela: 2,
    valorCentavos: 300_000,
    vencimento: "2026-11-17",
    status: "VENCIDO",
    origem: "ERP",
  },
  {
    clienteId: semNome.id,
    numero: "NF-3001",
    parcela: 1,
    valorCentavos: 1_250_000,
    vencimento: "2026-12-20",
    status: "EM_ABERTO",
    origem: "ERP",
  },
];

function createService({
  customers = [exemplo, semNome],
  total = customers.length,
}: { customers?: CustomerRecord[]; total?: number } = {}) {
  const repository = {
    search: vi.fn((_criteria: CustomerSearchCriteria) =>
      Promise.resolve({ customers, total }),
    ),
    findById: vi.fn((id: string, filter: { codigoVendedor?: string }) =>
      Promise.resolve(
        customers.find(
          (customer) =>
            customer.id === id &&
            (filter.codigoVendedor === undefined ||
              customer.codigoVendedor === filter.codigoVendedor),
        ) ?? null,
      ),
    ),
    findUnpaidReceivables: vi.fn((customerIds: string[]) =>
      Promise.resolve(
        receivables.filter((receivable) =>
          customerIds.includes(receivable.clienteId),
        ),
      ),
    ),
    findSalespersonNames: vi.fn((codes: string[]) =>
      Promise.resolve(
        new Map(codes.includes("V01") ? [["V01", "Patrícia Lima"]] : []),
      ),
    ),
    findLastSuccessfulSyncs: vi.fn(() =>
      Promise.resolve({
        clientesEm: new Date("2026-11-27T14:00:00Z"),
        titulosEm: null,
      }),
    ),
  };

  return {
    service: new CustomersService(repository, () => now),
    repository,
  };
}

describe("CustomersService.search", () => {
  it("passes the portfolio filter and the first page to the repository", async () => {
    const { service, repository } = createService();

    await service.search({ codigoVendedor: "V01" }, { pagina: 1 });

    expect(repository.search).toHaveBeenCalledWith({
      filter: { codigoVendedor: "V01" },
      skip: 0,
      take: 60,
    });
  });

  it("skips the clients of the previous pages", async () => {
    const { service, repository } = createService();

    await service.search({}, { pagina: 3 });

    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 120, take: 60 }),
    );
  });

  it("treats a blank term as no search", async () => {
    const { service, repository } = createService();

    await service.search({}, { busca: "   ", pagina: 1 });

    expect(repository.search).toHaveBeenCalledWith({
      filter: {},
      skip: 0,
      take: 60,
    });
  });

  it("searches a trimmed term by name or code only when it has letters", async () => {
    const { service, repository } = createService();

    await service.search({}, { busca: " C0001 ", pagina: 1 });

    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({ texto: "C0001", digitosCnpj: undefined }),
    );
  });

  it.each([
    ["11.222.333/0001-81", "11222333000181"],
    ["11222333000181", "11222333000181"],
    ["112", "112"],
    ["11 222 333", "11222333"],
  ])("also searches the CNPJ digits of %s", async (term, digits) => {
    const { service, repository } = createService();

    await service.search({}, { busca: term, pagina: 1 });

    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({ texto: term, digitosCnpj: digits }),
    );
  });

  it("does not search the CNPJ with fewer than 3 digits", async () => {
    const { service, repository } = createService();

    await service.search({}, { busca: "11", pagina: 1 });

    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({ texto: "11", digitosCnpj: undefined }),
    );
  });

  it("returns the page with the available credit and the salesperson name of each client", async () => {
    const { service } = createService({ total: 61 });

    const page = await service.search({}, { pagina: 1 });

    expect(customerPageSchema.parse(page)).toEqual({
      itens: [
        {
          id: exemplo.id,
          codigoErp: "C9001",
          razaoSocial: "Construtora Exemplo Ltda",
          cnpj: "11222333000181",
          cidade: "Recife",
          uf: "PE",
          status: "ATIVO",
          codigoVendedor: "V01",
          vendedorNome: "Patrícia Lima",
          limiteDisponivelCentavos: 1_200_000,
        },
        {
          id: semNome.id,
          codigoErp: "C9002",
          razaoSocial: "Elétrica Sem Vendedor ME",
          cnpj: "44555666000199",
          cidade: "Recife",
          uf: "PE",
          status: "ATIVO",
          codigoVendedor: "V09",
          vendedorNome: null,
          limiteDisponivelCentavos: -250_000,
        },
      ],
      total: 61,
      pagina: 1,
      tamanhoPagina: 60,
    });
  });

  it("returns an empty page without loading receivables when nothing matches", async () => {
    const { service, repository } = createService({ customers: [] });

    const page = await service.search({}, { busca: "nada", pagina: 1 });

    expect(page).toEqual({ itens: [], total: 0, pagina: 1, tamanhoPagina: 60 });
    expect(repository.findUnpaidReceivables).not.toHaveBeenCalled();
  });
});

describe("CustomersService.getProfile", () => {
  it("looks the client up inside the portfolio and answers null outside it", async () => {
    const { service, repository } = createService();

    const profile = await service.getProfile(
      { codigoVendedor: "V02" },
      exemplo.id,
    );

    expect(profile).toBeNull();
    expect(repository.findById).toHaveBeenCalledWith(exemplo.id, {
      codigoVendedor: "V02",
    });
  });

  it("returns the client data, credit position, overdue receivables, and data freshness", async () => {
    const { service } = createService();

    const profile = await service.getProfile(
      { codigoVendedor: "V01" },
      exemplo.id,
    );

    expect(customerProfileSchema.parse(profile)).toEqual({
      id: exemplo.id,
      codigoErp: "C9001",
      razaoSocial: "Construtora Exemplo Ltda",
      cnpj: "11222333000181",
      cidade: "Recife",
      uf: "PE",
      segmento: "Construtora",
      status: "ATIVO",
      codigoVendedor: "V01",
      vendedorNome: "Patrícia Lima",
      credito: {
        limiteCreditoCentavos: 2_000_000,
        emAbertoCentavos: 500_000,
        vencidoCentavos: 300_000,
        limiteDisponivelCentavos: 1_200_000,
      },
      titulosVencidos: [
        {
          numero: "NF-1201",
          parcela: 2,
          valorCentavos: 300_000,
          vencimento: "2026-11-17",
          diasEmAtraso: 10,
        },
      ],
      ultimoPedidoEm: null,
      ultimaSincronizacao: {
        clientesEm: "2026-11-27T14:00:00.000Z",
        titulosEm: null,
      },
    });
  });
});
