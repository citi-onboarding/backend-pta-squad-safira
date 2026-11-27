import type {
  StatusCliente,
  TipoRegistro,
  ResultadoRegistro,
} from "../../shared/database/generated/enums.js";
import type {
  ErpCliente,
  ErpPage,
  ErpPageQuery,
  ErpProduto,
} from "../../shared/erp/erp-client.schemas.js";
import type { ErpClient } from "../../shared/erp/erp-client.service.js";
import { ErpRecusouError } from "../../shared/erp/erp-client.service.js";

// Keeps clients and products in the portal up to date with the ERP (BACK-03).

export const PAGE_SIZE = 50;

export type SyncType = Extract<
  TipoRegistro,
  "SINCRONIZACAO_CLIENTES" | "SINCRONIZACAO_PRODUTOS"
>;

export interface ClienteData {
  codigoErp: string;
  razaoSocial: string;
  cnpj: string;
  cidade: string;
  uf: string;
  segmento: string;
  codigoVendedor: string;
  limiteCreditoCentavos: number;
  status: StatusCliente;
  atualizadoNoErpEm: Date;
}

export interface ProdutoData {
  codigoErp: string;
  descricao: string;
  categoria: string;
  unidade: string;
  precoTabelaCentavos: number;
  ativo: boolean;
  atualizadoNoErpEm: Date;
}

export interface RunOutcome {
  resultado: ResultadoRegistro;
  itensLidos: number;
  itensAlterados: number;
  erros: number;
  /** Safe failure detail: an error name and status, never a key or body. */
  detalhe: string | null;
}

export interface TypeStatus {
  latestResult: ResultadoRegistro | null;
  lastSuccessEnd: Date | null;
}

export interface SyncStatusSnapshot {
  clientes: TypeStatus;
  produtos: TypeStatus;
}

export interface RunIds {
  clientes: string;
  produtos: string;
}

export interface SyncRepository {
  findClientes(codes: string[]): Promise<ClienteData[]>;
  findProdutos(codes: string[]): Promise<ProdutoData[]>;
  /** Writes one page in one transaction. */
  saveClientes(rows: ClienteData[]): Promise<void>;
  saveProdutos(rows: ProdutoData[]): Promise<void>;
  deactivateClientesExcept(codes: string[]): Promise<number>;
  deactivateProdutosExcept(codes: string[]): Promise<number>;
  deactivateCliente(codigo: string): Promise<boolean>;
  lastSuccessfulStart(tipo: SyncType): Promise<Date | null>;
  /** Takes the lock and opens the two run rows, or returns null when busy. */
  startRun(now: Date): Promise<RunIds | null>;
  finishRun(
    id: string,
    outcome: RunOutcome & { terminouEm: Date },
  ): Promise<void>;
  isRunInProgress(now: Date): Promise<boolean>;
  statusSnapshot(): Promise<SyncStatusSnapshot>;
}

export interface SyncStatus {
  ultimaSincronizacaoOk: Date | null;
  ultimoResultado: ResultadoRegistro | null;
}

export class SyncInProgressError extends Error {
  constructor() {
    super("A synchronization is already in progress.");
    this.name = "SyncInProgressError";
  }
}

export class ClienteNotFoundInErpError extends Error {
  constructor(readonly codigo: string) {
    super("The ERP has no client with this code.");
    this.name = "ClienteNotFoundInErpError";
  }
}

interface SyncServiceOptions {
  erpClient: ErpClient;
  repository: SyncRepository;
  now?: () => Date;
}

export function toClienteData(cliente: ErpCliente): ClienteData {
  return {
    codigoErp: cliente.codigo,
    razaoSocial: cliente.razaoSocial,
    cnpj: cliente.cnpj,
    cidade: cliente.cidade,
    uf: cliente.uf,
    segmento: cliente.segmento,
    codigoVendedor: cliente.vendedor,
    limiteCreditoCentavos: cliente.limiteCreditoCentavos,
    status: cliente.status,
    atualizadoNoErpEm: new Date(cliente.atualizadoEm),
  };
}

export function toProdutoData(produto: ErpProduto): ProdutoData {
  return {
    codigoErp: produto.codigo,
    descricao: produto.descricao,
    categoria: produto.categoria,
    unidade: produto.unidade,
    precoTabelaCentavos: produto.precoTabelaCentavos,
    ativo: produto.ativo,
    atualizadoNoErpEm: new Date(produto.atualizadoEm),
  };
}

function sameValues<T extends object>(stored: T, incoming: T): boolean {
  return (Object.keys(incoming) as (keyof T)[]).every((key) => {
    const left = stored[key];
    const right = incoming[key];
    return left instanceof Date && right instanceof Date
      ? left.getTime() === right.getTime()
      : left === right;
  });
}

function safeDetail(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown failure.";
  const status =
    "status" in error && typeof error.status === "number"
      ? ` (status ${String(error.status)})`
      : "";
  return `${error.name}${status}`;
}

const RESULT_SEVERITY: Record<ResultadoRegistro, number> = {
  SUCESSO: 0,
  PARCIAL: 1,
  EM_ANDAMENTO: 2,
  FALHA: 3,
};

interface TypeHandler<TErp, TData extends { codigoErp: string }> {
  tipo: SyncType;
  list(query: ErpPageQuery): Promise<ErpPage<TErp>>;
  toData(item: TErp): TData;
  find(codes: string[]): Promise<TData[]>;
  save(rows: TData[]): Promise<void>;
  deactivateExcept(codes: string[]): Promise<number>;
}

export class SyncService {
  private readonly erpClient: ErpClient;
  private readonly repository: SyncRepository;
  private readonly now: () => Date;

  constructor({ erpClient, repository, now }: SyncServiceOptions) {
    this.erpClient = erpClient;
    this.repository = repository;
    this.now = now ?? (() => new Date());
  }

  async runOnce(): Promise<{ skipped: boolean }> {
    const ids = await this.repository.startRun(this.now());
    if (ids === null) {
      return { skipped: true };
    }

    await this.runType(ids.clientes, {
      tipo: "SINCRONIZACAO_CLIENTES",
      list: (query) => this.erpClient.listClientes(query),
      toData: toClienteData,
      find: (codes) => this.repository.findClientes(codes),
      save: (rows) => this.repository.saveClientes(rows),
      deactivateExcept: (codes) =>
        this.repository.deactivateClientesExcept(codes),
    });
    await this.runType(ids.produtos, {
      tipo: "SINCRONIZACAO_PRODUTOS",
      list: (query) => this.erpClient.listProdutos(query),
      toData: toProdutoData,
      find: (codes) => this.repository.findProdutos(codes),
      save: (rows) => this.repository.saveProdutos(rows),
      deactivateExcept: (codes) =>
        this.repository.deactivateProdutosExcept(codes),
    });
    return { skipped: false };
  }

  private async runType<TErp, TData extends { codigoErp: string }>(
    runId: string,
    handler: TypeHandler<TErp, TData>,
  ): Promise<void> {
    let itensLidos = 0;
    let itensAlterados = 0;
    try {
      const since = await this.repository.lastSuccessfulStart(handler.tipo);
      const fullLoad = since === null;
      const readCodes: string[] = [];
      let pagina = 1;
      let totalPaginas = 1;

      do {
        const query: ErpPageQuery = { pagina, tamanho: PAGE_SIZE };
        if (since !== null) query.atualizadoDesde = since.toISOString();
        const page = await handler.list(query);
        totalPaginas = page.totalPaginas;

        const incoming = page.dados.map((item) => handler.toData(item));
        const stored = new Map(
          (await handler.find(incoming.map((row) => row.codigoErp))).map(
            (row) => [row.codigoErp, row],
          ),
        );
        const changed = incoming.filter((row) => {
          const current = stored.get(row.codigoErp);
          return current === undefined || !sameValues(current, row);
        });
        if (changed.length > 0) {
          await handler.save(changed);
        }
        itensLidos += incoming.length;
        itensAlterados += changed.length;
        readCodes.push(...incoming.map((row) => row.codigoErp));
        pagina += 1;
      } while (pagina <= totalPaginas);

      if (fullLoad) {
        itensAlterados += await handler.deactivateExcept(readCodes);
      }
      await this.repository.finishRun(runId, {
        terminouEm: this.now(),
        resultado: "SUCESSO",
        itensLidos,
        itensAlterados,
        erros: 0,
        detalhe: null,
      });
    } catch (error) {
      await this.repository.finishRun(runId, {
        terminouEm: this.now(),
        resultado: "FALHA",
        itensLidos,
        itensAlterados,
        erros: 1,
        detalhe: safeDetail(error),
      });
    }
  }

  async syncCliente(
    codigo: string,
  ): Promise<{ codigo: string; status: StatusCliente }> {
    if (await this.repository.isRunInProgress(this.now())) {
      throw new SyncInProgressError();
    }

    let cliente: ErpCliente;
    try {
      cliente = await this.erpClient.getCliente(codigo);
    } catch (error) {
      if (error instanceof ErpRecusouError && error.erpStatus === 404) {
        await this.repository.deactivateCliente(codigo);
        throw new ClienteNotFoundInErpError(codigo);
      }
      throw error;
    }

    const data = toClienteData(cliente);
    await this.repository.saveClientes([data]);
    return { codigo: data.codigoErp, status: data.status };
  }

  async status(): Promise<SyncStatus> {
    const { clientes, produtos } = await this.repository.statusSnapshot();

    const ends = [clientes.lastSuccessEnd, produtos.lastSuccessEnd];
    const ultimaSincronizacaoOk = ends.every((end) => end !== null)
      ? new Date(Math.min(...ends.map((end) => end.getTime())))
      : null;

    const results = [clientes.latestResult, produtos.latestResult].filter(
      (result): result is ResultadoRegistro => result !== null,
    );
    const ultimoResultado =
      results.length === 0
        ? null
        : results.reduce((worse, result) =>
            RESULT_SEVERITY[result] > RESULT_SEVERITY[worse] ? result : worse,
          );

    return { ultimaSincronizacaoOk, ultimoResultado };
  }
}
