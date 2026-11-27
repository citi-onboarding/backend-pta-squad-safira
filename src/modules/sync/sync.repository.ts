import type { Database } from "../../shared/database/create-database.js";
import type {
  ClienteData,
  ProdutoData,
  RunIds,
  RunOutcome,
  SyncRepository,
  SyncStatusSnapshot,
  SyncType,
  TypeStatus,
} from "./sync.service.js";

// Any fixed number works: it only has to be the same in every process.
const SYNC_LOCK_KEY = 4_202_611;
const SYNC_TYPES: SyncType[] = [
  "SINCRONIZACAO_CLIENTES",
  "SINCRONIZACAO_PRODUTOS",
];
// A run still in progress after this long was left behind by a crashed process.
export const ABANDONED_AFTER_MS = 30 * 60 * 1000;

const clienteFields = {
  codigoErp: true,
  razaoSocial: true,
  cnpj: true,
  cidade: true,
  uf: true,
  segmento: true,
  codigoVendedor: true,
  limiteCreditoCentavos: true,
  status: true,
  atualizadoNoErpEm: true,
} as const;

const produtoFields = {
  codigoErp: true,
  descricao: true,
  categoria: true,
  unidade: true,
  precoTabelaCentavos: true,
  ativo: true,
  atualizadoNoErpEm: true,
} as const;

type Transaction = Parameters<Parameters<Database["$transaction"]>[0]>[0];

export class PrismaSyncRepository implements SyncRepository {
  constructor(private readonly database: Database) {}

  findClientes(codes: string[]): Promise<ClienteData[]> {
    return this.database.cliente.findMany({
      where: { codigoErp: { in: codes } },
      select: clienteFields,
    });
  }

  findProdutos(codes: string[]): Promise<ProdutoData[]> {
    return this.database.produto.findMany({
      where: { codigoErp: { in: codes } },
      select: produtoFields,
    });
  }

  async saveClientes(rows: ClienteData[]): Promise<void> {
    await this.database.$transaction(
      rows.map((row) =>
        this.database.cliente.upsert({
          where: { codigoErp: row.codigoErp },
          create: row,
          update: row,
        }),
      ),
    );
  }

  async saveProdutos(rows: ProdutoData[]): Promise<void> {
    await this.database.$transaction(
      rows.map((row) =>
        this.database.produto.upsert({
          where: { codigoErp: row.codigoErp },
          create: row,
          update: row,
        }),
      ),
    );
  }

  async deactivateClientesExcept(codes: string[]): Promise<number> {
    const { count } = await this.database.cliente.updateMany({
      where: { codigoErp: { notIn: codes }, status: { not: "INATIVO" } },
      data: { status: "INATIVO" },
    });
    return count;
  }

  async deactivateProdutosExcept(codes: string[]): Promise<number> {
    const { count } = await this.database.produto.updateMany({
      where: { codigoErp: { notIn: codes }, ativo: true },
      data: { ativo: false },
    });
    return count;
  }

  saveClienteOnDemand(row: ClienteData, now: Date): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      if (await this.lockedAndBusy(transaction, now)) return false;
      await transaction.cliente.upsert({
        where: { codigoErp: row.codigoErp },
        create: row,
        update: row,
      });
      return true;
    });
  }

  deactivateClienteOnDemand(codigo: string, now: Date): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      if (await this.lockedAndBusy(transaction, now)) return false;
      await transaction.cliente.updateMany({
        where: { codigoErp: codigo },
        data: { status: "INATIVO" },
      });
      return true;
    });
  }

  // Takes the same advisory lock as startRun, so a scheduled run cannot start
  // between this check and the caller's write.
  private async lockedAndBusy(
    transaction: Transaction,
    now: Date,
  ): Promise<boolean> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK_KEY})`;
    const inProgress = await transaction.registroSincronizacao.count({
      where: {
        tipo: { in: SYNC_TYPES },
        resultado: "EM_ANDAMENTO",
        iniciouEm: { gte: new Date(now.getTime() - ABANDONED_AFTER_MS) },
      },
    });
    return inProgress > 0;
  }

  async lastSuccessfulStart(tipo: SyncType): Promise<Date | null> {
    const run = await this.database.registroSincronizacao.findFirst({
      where: { tipo, resultado: "SUCESSO" },
      orderBy: { iniciouEm: "desc" },
      select: { iniciouEm: true },
    });
    return run?.iniciouEm ?? null;
  }

  startRun(now: Date): Promise<RunIds | null> {
    return this.database.$transaction(async (transaction) => {
      // Serializes the check-and-insert across every API process; the lock is
      // released when this short transaction ends.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK_KEY})`;
      await transaction.registroSincronizacao.updateMany({
        where: {
          tipo: { in: SYNC_TYPES },
          resultado: "EM_ANDAMENTO",
          iniciouEm: { lt: new Date(now.getTime() - ABANDONED_AFTER_MS) },
        },
        data: {
          resultado: "FALHA",
          erros: 1,
          terminouEm: now,
          detalhe: "Run abandoned: still in progress after 30 minutes.",
        },
      });
      const inProgress = await transaction.registroSincronizacao.count({
        where: { tipo: { in: SYNC_TYPES }, resultado: "EM_ANDAMENTO" },
      });
      if (inProgress > 0) {
        return null;
      }
      const clientes = await transaction.registroSincronizacao.create({
        data: {
          tipo: "SINCRONIZACAO_CLIENTES",
          iniciouEm: now,
          resultado: "EM_ANDAMENTO",
        },
        select: { id: true },
      });
      const produtos = await transaction.registroSincronizacao.create({
        data: {
          tipo: "SINCRONIZACAO_PRODUTOS",
          iniciouEm: now,
          resultado: "EM_ANDAMENTO",
        },
        select: { id: true },
      });
      return { clientes: clientes.id, produtos: produtos.id };
    });
  }

  async finishRun(
    id: string,
    outcome: RunOutcome & { terminouEm: Date },
  ): Promise<void> {
    await this.database.registroSincronizacao.update({
      where: { id },
      data: {
        terminouEm: outcome.terminouEm,
        resultado: outcome.resultado,
        itensLidos: outcome.itensLidos,
        erros: outcome.erros,
        pendencias: outcome.pendencias,
        detalhe: outcome.detalhe,
        relatorio: {
          itensIgnorados: outcome.itensIgnorados.map((item) => ({
            codigo: item.codigo,
            motivo: item.motivo,
          })),
        },
      },
    });
  }

  async isRunInProgress(now: Date): Promise<boolean> {
    const count = await this.database.registroSincronizacao.count({
      where: {
        tipo: { in: SYNC_TYPES },
        resultado: "EM_ANDAMENTO",
        iniciouEm: { gte: new Date(now.getTime() - ABANDONED_AFTER_MS) },
      },
    });
    return count > 0;
  }

  async statusSnapshot(): Promise<SyncStatusSnapshot> {
    const [clientes, produtos] = await Promise.all(
      SYNC_TYPES.map((tipo) => this.typeStatus(tipo)),
    );
    return {
      clientes: clientes ?? { latestResult: null, lastSuccessEnd: null },
      produtos: produtos ?? { latestResult: null, lastSuccessEnd: null },
    };
  }

  private async typeStatus(tipo: SyncType): Promise<TypeStatus> {
    const [latest, lastSuccess] = await Promise.all([
      this.database.registroSincronizacao.findFirst({
        where: { tipo },
        orderBy: { iniciouEm: "desc" },
        select: { resultado: true },
      }),
      this.database.registroSincronizacao.findFirst({
        where: { tipo, resultado: "SUCESSO" },
        orderBy: { iniciouEm: "desc" },
        select: { terminouEm: true },
      }),
    ]);
    return {
      latestResult: latest?.resultado ?? null,
      lastSuccessEnd: lastSuccess?.terminouEm ?? null,
    };
  }
}
