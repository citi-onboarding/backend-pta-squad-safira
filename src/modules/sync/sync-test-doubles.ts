import { vi } from "vitest";

import type {
  ErpCliente,
  ErpPageQuery,
  ErpProduto,
} from "../../shared/erp/erp-client.schemas.js";
import type { ErpClient } from "../../shared/erp/erp-client.service.js";
import { ErpRecusouError } from "../../shared/erp/erp-client.service.js";
import type {
  ClienteData,
  ProdutoData,
  RunOutcome,
  SyncRepository,
  SyncStatusSnapshot,
  SyncType,
} from "./sync.service.js";

// Test doubles for the sync service: an in-memory repository (the database is
// an external dependency) and a simulated ERP. The service itself is real.

export function erpCliente(
  index: number,
  overrides: Partial<ErpCliente> = {},
): ErpCliente {
  const code = `C${String(index).padStart(3, "0")}`;
  return {
    codigo: code,
    razaoSocial: `Cliente ${code} Ltda`,
    cnpj: String(10_000_000_000_000 + index).padStart(14, "0"),
    cidade: "Recife",
    uf: "PE",
    segmento: "Construtora",
    limiteCreditoCentavos: 100_000 + index,
    vendedor: "V01",
    dataCadastro: "2024-01-10",
    status: "ATIVO",
    atualizadoEm: "2026-11-01T08:00:00.000Z",
    ...overrides,
  };
}

export function erpProduto(
  index: number,
  overrides: Partial<ErpProduto> = {},
): ErpProduto {
  const code = `P${String(index).padStart(3, "0")}`;
  return {
    codigo: code,
    descricao: `Produto ${code}`,
    categoria: "Cabos",
    unidade: "UN",
    precoTabelaCentavos: 1_000 + index,
    ativo: true,
    atualizadoEm: "2026-11-01T08:00:00.000Z",
    ...overrides,
  };
}

export function many<T>(count: number, build: (index: number) => T): T[] {
  return Array.from({ length: count }, (_, index) => build(index + 1));
}

function pageOf<T extends { atualizadoEm: string }>(
  items: T[],
  query: ErpPageQuery = {},
) {
  const size = query.tamanho ?? 50;
  const page = query.pagina ?? 1;
  const since = query.atualizadoDesde;
  const filtered =
    since === undefined
      ? items
      : items.filter((item) => item.atualizadoEm >= since);
  return {
    dados: filtered.slice((page - 1) * size, page * size),
    pagina: page,
    tamanho: size,
    total: filtered.length,
    totalPaginas: Math.max(1, Math.ceil(filtered.length / size)),
  };
}

export function simulatedErp(
  initial: { clientes?: ErpCliente[]; produtos?: ErpProduto[] } = {},
) {
  const state = {
    clientes: [...(initial.clientes ?? [])],
    produtos: [...(initial.produtos ?? [])],
  };
  const erpClient = {
    listClientes: vi.fn((query?: ErpPageQuery) =>
      Promise.resolve(pageOf(state.clientes, query)),
    ),
    listProdutos: vi.fn((query?: ErpPageQuery) =>
      Promise.resolve(pageOf(state.produtos, query)),
    ),
    getCliente: vi.fn((codigo: string) => {
      const found = state.clientes.find((cliente) => cliente.codigo === codigo);
      return found
        ? Promise.resolve(found)
        : Promise.reject(new ErpRecusouError(404, "Cliente não encontrado."));
    }),
    listTitulos: vi.fn(),
    criarPedido: vi.fn(),
    consultarPedido: vi.fn(),
  };
  return {
    erpClient: erpClient as unknown as ErpClient,
    mock: erpClient,
    state,
  };
}

interface StoredRun extends RunOutcome {
  id: string;
  tipo: SyncType;
  iniciouEm: Date;
  terminouEm: Date | null;
}

// Mirrors the error Prisma throws when a unique column (such as CNPJ)
// already holds the value.
export function uniqueViolation(): Error {
  return Object.assign(
    new Error("Unique constraint failed on the fields: (`cnpj`)"),
    {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
    },
  );
}

// Mirrors any known Prisma request error by its code, such as P2034 (write
// conflict or deadlock) or P2000 (value too long for the column).
export function prismaError(code: string): Error {
  return Object.assign(new Error(`Prisma request failed with ${code}`), {
    name: "PrismaClientKnownRequestError",
    code,
  });
}

export class InMemorySyncRepository implements SyncRepository {
  readonly clientes = new Map<string, ClienteData>();
  readonly produtos = new Map<string, ProdutoData>();
  readonly runs: StoredRun[] = [];
  readonly savedPages: { tipo: SyncType; codes: string[] }[] = [];
  private lockHeld = false;

  holdLock(): void {
    this.lockHeld = true;
  }

  findClientes(codes: string[]): Promise<ClienteData[]> {
    return Promise.resolve(
      codes.flatMap((code) => this.clientes.get(code) ?? []),
    );
  }

  findProdutos(codes: string[]): Promise<ProdutoData[]> {
    return Promise.resolve(
      codes.flatMap((code) => this.produtos.get(code) ?? []),
    );
  }

  saveClientes(rows: ClienteData[]): Promise<void> {
    // Like the unique CNPJ column, and like one transaction: all or nothing.
    const owners = new Map(
      [...this.clientes.values()].map((row) => [row.cnpj, row.codigoErp]),
    );
    for (const row of rows) {
      const owner = owners.get(row.cnpj);
      if (owner !== undefined && owner !== row.codigoErp) {
        return Promise.reject(uniqueViolation());
      }
      owners.set(row.cnpj, row.codigoErp);
    }
    for (const row of rows) this.clientes.set(row.codigoErp, { ...row });
    this.savedPages.push({
      tipo: "SINCRONIZACAO_CLIENTES",
      codes: rows.map((row) => row.codigoErp),
    });
    return Promise.resolve();
  }

  saveProdutos(rows: ProdutoData[]): Promise<void> {
    for (const row of rows) this.produtos.set(row.codigoErp, { ...row });
    this.savedPages.push({
      tipo: "SINCRONIZACAO_PRODUTOS",
      codes: rows.map((row) => row.codigoErp),
    });
    return Promise.resolve();
  }

  deactivateClientesExcept(codes: string[]): Promise<number> {
    let count = 0;
    for (const [code, row] of this.clientes) {
      if (!codes.includes(code) && row.status !== "INATIVO") {
        this.clientes.set(code, { ...row, status: "INATIVO" });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  deactivateProdutosExcept(codes: string[]): Promise<number> {
    let count = 0;
    for (const [code, row] of this.produtos) {
      if (!codes.includes(code) && row.ativo) {
        this.produtos.set(code, { ...row, ativo: false });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  async saveClienteOnDemand(row: ClienteData): Promise<boolean> {
    if (await this.isRunInProgress()) return false;
    await this.saveClientes([row]);
    return true;
  }

  async deactivateClienteOnDemand(codigo: string): Promise<boolean> {
    if (await this.isRunInProgress()) return false;
    const row = this.clientes.get(codigo);
    if (row) this.clientes.set(codigo, { ...row, status: "INATIVO" });
    return true;
  }

  lastSuccessfulStart(tipo: SyncType): Promise<Date | null> {
    const success = this.runs
      .filter((run) => run.tipo === tipo && run.resultado === "SUCESSO")
      .at(-1);
    return Promise.resolve(success?.iniciouEm ?? null);
  }

  startRun(now: Date): Promise<{ clientes: string; produtos: string } | null> {
    if (this.lockHeld) return Promise.resolve(null);
    const ids = {
      clientes: `run-${String(this.runs.length + 1)}`,
      produtos: `run-${String(this.runs.length + 2)}`,
    };
    for (const [tipo, id] of [
      ["SINCRONIZACAO_CLIENTES", ids.clientes],
      ["SINCRONIZACAO_PRODUTOS", ids.produtos],
    ] as const) {
      this.runs.push({
        id,
        tipo,
        iniciouEm: now,
        terminouEm: null,
        resultado: "EM_ANDAMENTO",
        itensLidos: 0,
        itensIgnorados: [],
        erros: 0,
        pendencias: 0,
        detalhe: null,
      });
    }
    return Promise.resolve(ids);
  }

  finishRun(
    id: string,
    outcome: RunOutcome & { terminouEm: Date },
  ): Promise<void> {
    const run = this.runs.find((entry) => entry.id === id);
    if (run) Object.assign(run, outcome);
    return Promise.resolve();
  }

  isRunInProgress(): Promise<boolean> {
    return Promise.resolve(
      this.lockHeld ||
        this.runs.some((run) => run.resultado === "EM_ANDAMENTO"),
    );
  }

  statusSnapshot(): Promise<SyncStatusSnapshot> {
    const of = (tipo: SyncType) => {
      const ofType = this.runs.filter((run) => run.tipo === tipo);
      const lastSuccess = ofType
        .filter((run) => run.resultado === "SUCESSO")
        .at(-1);
      return {
        latestResult: ofType.at(-1)?.resultado ?? null,
        lastSuccessEnd: lastSuccess?.terminouEm ?? null,
      };
    };
    return Promise.resolve({
      clientes: of("SINCRONIZACAO_CLIENTES"),
      produtos: of("SINCRONIZACAO_PRODUTOS"),
    });
  }
}
