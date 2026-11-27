import type {
  ResultadoRegistro,
  StatusCliente,
  TipoRegistro,
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

/** An item that could not be written: its ERP code and a safe reason. */
export interface SkippedItem {
  codigo: string;
  motivo: string;
}

export interface RunOutcome {
  resultado: ResultadoRegistro;
  itensLidos: number;
  itensAlterados: number;
  itensIgnorados: SkippedItem[];
  erros: number;
  pendencias: number;
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
  /** Writes one client under the lock; false when a run is in progress. */
  saveClienteOnDemand(row: ClienteData, now: Date): Promise<boolean>;
  /** Makes one client inactive under the lock; false when a run is in progress. */
  deactivateClienteOnDemand(codigo: string, now: Date): Promise<boolean>;
  /** Start of the last SUCESSO or PARCIAL run of the type. */
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

/** The part of the application logger the sync uses. */
export interface SyncLogger {
  info(object: object, message: string): void;
  warn(object: object, message: string): void;
  error(object: object, message: string): void;
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

class FullLoadIncompleteError extends Error {
  constructor(read: number, total: number, totalChanged: boolean) {
    super(
      `Full load incomplete: read ${String(read)} items, the ERP reported ${String(total)}${totalChanged ? " and its total changed between pages" : ""}; nothing was made inactive.`,
    );
    this.name = "FullLoadIncompleteError";
  }
}

interface SyncServiceOptions {
  erpClient: ErpClient;
  repository: SyncRepository;
  now?: () => Date;
  logger?: SyncLogger;
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

function errorCode(error: unknown): string | null {
  return error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

// The only Prisma codes an ERP item's own data can cause in these tables:
// a unique value already used (CNPJ), a text longer than its column (uf), and
// a number out of its column's range. The item is skipped and the next one can
// still be written. Every other failure, including temporary ones such as
// P2024, P2028 and P2034, stops the run so that no item is lost.
const DATA_ERROR_CODES = new Set(["P2002", "P2000", "P2020"]);

function isDataError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== null && DATA_ERROR_CODES.has(code);
}

function safeReason(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown failure.";
  const code = errorCode(error);
  return code === null ? error.name : `${error.name} ${code}`;
}

function safeDetail(error: unknown): string {
  if (error instanceof FullLoadIncompleteError) return error.message;
  if (!(error instanceof Error)) return "Unknown failure.";
  const status =
    "status" in error && typeof error.status === "number"
      ? ` (status ${String(error.status)})`
      : "";
  const code = errorCode(error);
  return `${error.name}${code === null ? "" : ` ${code}`}${status}`;
}

const RESULT_SEVERITY: Record<ResultadoRegistro, number> = {
  SUCESSO: 0,
  PARCIAL: 1,
  EM_ANDAMENTO: 2,
  FALHA: 3,
};

const silentLogger: SyncLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

interface TypeHandler<TErp, TData extends { codigoErp: string }> {
  tipo: SyncType;
  list(query: ErpPageQuery): Promise<ErpPage<TErp>>;
  toData(item: TErp): TData;
  find(codes: string[]): Promise<TData[]>;
  save(rows: TData[]): Promise<void>;
  deactivateExcept(codes: string[]): Promise<number>;
}

interface PageWrite {
  saved: number;
  skipped: SkippedItem[];
}

export class SyncService {
  private readonly erpClient: ErpClient;
  private readonly repository: SyncRepository;
  private readonly now: () => Date;
  private readonly logger: SyncLogger;

  constructor({ erpClient, repository, now, logger }: SyncServiceOptions) {
    this.erpClient = erpClient;
    this.repository = repository;
    this.now = now ?? (() => new Date());
    this.logger = logger ?? silentLogger;
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

  // Never throws: whatever happens, the other type still runs.
  private async runType<TErp, TData extends { codigoErp: string }>(
    runId: string,
    handler: TypeHandler<TErp, TData>,
  ): Promise<void> {
    const startedAt = this.now();
    const outcome: RunOutcome = {
      resultado: "SUCESSO",
      itensLidos: 0,
      itensAlterados: 0,
      itensIgnorados: [],
      erros: 0,
      pendencias: 0,
      detalhe: null,
    };

    try {
      await this.readAndWrite(handler, outcome);
      const skipped = outcome.itensIgnorados.length;
      if (skipped > 0) {
        outcome.resultado = "PARCIAL";
        outcome.erros = skipped;
        outcome.pendencias = skipped;
        outcome.detalhe = `${String(skipped)} item(s) skipped; see the report.`;
      }
    } catch (error) {
      outcome.resultado = "FALHA";
      outcome.erros = outcome.itensIgnorados.length + 1;
      outcome.pendencias = outcome.itensIgnorados.length;
      outcome.detalhe = safeDetail(error);
    }

    const terminouEm = this.now();
    try {
      await this.repository.finishRun(runId, { ...outcome, terminouEm });
    } catch (error) {
      this.logger.error(
        { sync: { tipo: handler.tipo, detalhe: safeDetail(error) } },
        "Could not record the ERP synchronization result",
      );
    }
    this.log(handler.tipo, outcome, terminouEm.getTime() - startedAt.getTime());
  }

  private async readAndWrite<TErp, TData extends { codigoErp: string }>(
    handler: TypeHandler<TErp, TData>,
    outcome: RunOutcome,
  ): Promise<void> {
    const since = await this.repository.lastSuccessfulStart(handler.tipo);
    const fullLoad = since === null;
    const readCodes = new Set<string>();
    let firstTotal: number | null = null;
    let totalChanged = false;
    let pagina = 1;
    let totalPaginas = 1;

    do {
      const query: ErpPageQuery = { pagina, tamanho: PAGE_SIZE };
      if (since !== null) query.atualizadoDesde = since.toISOString();
      const page = await handler.list(query);
      totalPaginas = page.totalPaginas;
      firstTotal ??= page.total;
      totalChanged ||= page.total !== firstTotal;

      const incoming = page.dados.map((item) => handler.toData(item));
      outcome.itensLidos += incoming.length;
      for (const row of incoming) readCodes.add(row.codigoErp);

      const stored = new Map(
        (await handler.find(incoming.map((row) => row.codigoErp))).map(
          (row) => [row.codigoErp, row],
        ),
      );
      const changed = incoming.filter((row) => {
        const current = stored.get(row.codigoErp);
        return current === undefined || !sameValues(current, row);
      });
      const written = await this.writePage(handler, changed);
      outcome.itensAlterados += written.saved;
      outcome.itensIgnorados.push(...written.skipped);
      pagina += 1;
    } while (pagina <= totalPaginas);

    if (fullLoad) {
      const total = firstTotal;
      // The ERP's ordering is not documented: if items moved between pages,
      // or nothing came back, "missing" items may still exist in the ERP.
      if (readCodes.size === 0 || totalChanged || readCodes.size !== total) {
        throw new FullLoadIncompleteError(readCodes.size, total, totalChanged);
      }
      outcome.itensAlterados += await handler.deactivateExcept([...readCodes]);
    }
  }

  // One transaction per page; when it fails because of an item's data, the
  // items are written one by one and only the failing ones are skipped.
  private async writePage<TData extends { codigoErp: string }>(
    handler: { save(rows: TData[]): Promise<void> },
    rows: TData[],
  ): Promise<PageWrite> {
    if (rows.length === 0) return { saved: 0, skipped: [] };
    try {
      await handler.save(rows);
      return { saved: rows.length, skipped: [] };
    } catch (error) {
      if (!isDataError(error)) throw error;
    }

    const result: PageWrite = { saved: 0, skipped: [] };
    for (const row of rows) {
      try {
        await handler.save([row]);
        result.saved += 1;
      } catch (error) {
        if (!isDataError(error)) throw error;
        result.skipped.push({
          codigo: row.codigoErp,
          motivo: safeReason(error),
        });
      }
    }
    return result;
  }

  private log(tipo: SyncType, outcome: RunOutcome, duracaoMs: number): void {
    const entry = {
      sync: {
        tipo,
        resultado: outcome.resultado,
        itensLidos: outcome.itensLidos,
        itensAlterados: outcome.itensAlterados,
        itensIgnorados: outcome.itensIgnorados.length,
        duracaoMs,
        detalhe: outcome.detalhe,
      },
    };
    if (outcome.resultado === "SUCESSO") {
      this.logger.info(entry, "ERP synchronization finished");
    } else {
      this.logger.warn(entry, "ERP synchronization did not fully succeed");
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
        if (
          !(await this.repository.deactivateClienteOnDemand(codigo, this.now()))
        ) {
          throw new SyncInProgressError();
        }
        throw new ClienteNotFoundInErpError(codigo);
      }
      throw error;
    }

    const data = toClienteData(cliente);
    // Checked again under the lock: a scheduled run may have started while
    // the ERP was being read.
    if (!(await this.repository.saveClienteOnDemand(data, this.now()))) {
      throw new SyncInProgressError();
    }
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
