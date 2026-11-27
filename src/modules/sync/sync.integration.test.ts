import { execFileSync } from "node:child_process";

import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "../../shared/database/create-database.js";
import { PrismaSyncRepository } from "./sync.repository.js";
import { SyncService } from "./sync.service.js";
import {
  erpCliente,
  erpProduto,
  many,
  simulatedErp,
} from "../../../tests/sync/sync-test-doubles.js";

const T10 = new Date("2026-11-27T10:00:00.000Z");
const T11 = new Date("2026-11-27T11:00:00.000Z");
const MINUTE = 60_000;

let container: StartedTestContainer;
let database: Database;

function service(
  erp: ReturnType<typeof simulatedErp>,
  now: () => Date = () => T10,
) {
  return new SyncService({
    erpClient: erp.erpClient,
    repository: new PrismaSyncRepository(database),
    now,
  });
}

function fullErp(atualizadoEm = "2026-11-01T08:00:00.000Z") {
  return simulatedErp({
    clientes: many(120, (index) => erpCliente(index, { atualizadoEm })),
    produtos: many(60, (index) => erpProduto(index, { atualizadoEm })),
  });
}

describe("client and product sync with PostgreSQL", () => {
  beforeAll(async () => {
    container = await new GenericContainer("postgres:17-alpine")
      .withEnvironment({
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_DB: "integration",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/),
      )
      .start();
    const databaseUrl = `postgresql://postgres:postgres@${container.getHost()}:${String(container.getMappedPort(5432))}/integration`;
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "pipe",
      },
    );
    const { createDatabase } =
      await import("../../shared/database/create-database.js");
    database = createDatabase(databaseUrl);
  });

  beforeEach(async () => {
    await database.registroSincronizacao.deleteMany();
    await database.cliente.deleteMany();
    await database.produto.deleteMany();
  });

  afterAll(async () => {
    await database.$disconnect();
    await container.stop();
  });

  it("populates clients and products with the ERP values on the full load", async () => {
    await service(fullErp()).runOnce();

    await expect(database.cliente.count()).resolves.toBe(120);
    await expect(database.produto.count()).resolves.toBe(60);
    await expect(
      database.cliente.findUniqueOrThrow({ where: { codigoErp: "C001" } }),
    ).resolves.toMatchObject({
      razaoSocial: "Cliente C001 Ltda",
      cnpj: "10000000000001",
      uf: "PE",
      codigoVendedor: "V01",
      limiteCreditoCentavos: 100_001,
      status: "ATIVO",
    });
    await expect(
      database.produto.findUniqueOrThrow({ where: { codigoErp: "P001" } }),
    ).resolves.toMatchObject({ precoTabelaCentavos: 1_001, ativo: true });
  });

  it("keeps the same rows when the same data comes twice", async () => {
    // Updated after both starts, so the incremental run brings every item again.
    const erp = fullErp("2026-11-27T12:00:00.000Z");
    await service(erp, () => T10).runOnce();
    const before = await database.cliente.findMany({
      orderBy: { codigoErp: "asc" },
    });

    await service(erp, () => T11).runOnce();

    await expect(database.cliente.count()).resolves.toBe(120);
    await expect(database.produto.count()).resolves.toBe(60);
    const after = await database.cliente.findMany({
      orderBy: { codigoErp: "asc" },
    });
    expect(after.map((row) => [row.id, row.atualizadoEm])).toEqual(
      before.map((row) => [row.id, row.atualizadoEm]),
    );
    const latest = await database.registroSincronizacao.findFirstOrThrow({
      where: { tipo: "SINCRONIZACAO_CLIENTES" },
      orderBy: { iniciouEm: "desc" },
    });
    expect(latest).toMatchObject({
      resultado: "SUCESSO",
      itensLidos: 120,
      relatorio: { itensAlterados: 0 },
    });
  });

  it("makes items missing from the full load inactive without deleting them", async () => {
    await database.cliente.create({
      data: {
        codigoErp: "C999",
        razaoSocial: "Cliente antigo",
        cnpj: "99999999000199",
        cidade: "Recife",
        uf: "PE",
        segmento: "Revenda",
        codigoVendedor: "V02",
        limiteCreditoCentavos: 1,
        status: "ATIVO",
        atualizadoNoErpEm: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await service(fullErp()).runOnce();

    await expect(
      database.cliente.findUniqueOrThrow({ where: { codigoErp: "C999" } }),
    ).resolves.toMatchObject({ status: "INATIVO" });
  });

  it("records each run with type, start, end, result, counts, and changed items", async () => {
    await service(fullErp()).runOnce();

    const rows = await database.registroSincronizacao.findMany({
      orderBy: { tipo: "asc" },
    });
    expect(rows).toEqual([
      expect.objectContaining({
        tipo: "SINCRONIZACAO_CLIENTES",
        iniciouEm: T10,
        terminouEm: T10,
        resultado: "SUCESSO",
        itensLidos: 120,
        erros: 0,
        detalhe: null,
        relatorio: { itensAlterados: 120 },
      }),
      expect.objectContaining({
        tipo: "SINCRONIZACAO_PRODUTOS",
        resultado: "SUCESSO",
        itensLidos: 60,
        relatorio: { itensAlterados: 60 },
      }),
    ]);
    await expect(service(fullErp()).status()).resolves.toEqual({
      ultimaSincronizacaoOk: T10,
      ultimoResultado: "SUCESSO",
    });
  });

  it("lets only one of two simultaneous runs read the ERP", async () => {
    const results = await Promise.all([
      service(fullErp()).runOnce(),
      service(fullErp()).runOnce(),
    ]);

    expect(results.map((result) => result.skipped).sort()).toEqual([
      false,
      true,
    ]);
    await expect(database.registroSincronizacao.count()).resolves.toBe(2);
    await expect(database.cliente.count()).resolves.toBe(120);
  });

  it("skips while a recent run is in progress", async () => {
    await database.registroSincronizacao.create({
      data: {
        tipo: "SINCRONIZACAO_CLIENTES",
        iniciouEm: new Date(T10.getTime() - 5 * MINUTE),
        resultado: "EM_ANDAMENTO",
      },
    });

    await expect(service(fullErp()).runOnce()).resolves.toEqual({
      skipped: true,
    });
    await expect(database.cliente.count()).resolves.toBe(0);
  });

  it("closes a run left in progress for more than 30 minutes and runs", async () => {
    const abandoned = await database.registroSincronizacao.create({
      data: {
        tipo: "SINCRONIZACAO_CLIENTES",
        iniciouEm: new Date(T10.getTime() - 31 * MINUTE),
        resultado: "EM_ANDAMENTO",
      },
    });

    await expect(service(fullErp()).runOnce()).resolves.toEqual({
      skipped: false,
    });

    await expect(
      database.registroSincronizacao.findUniqueOrThrow({
        where: { id: abandoned.id },
      }),
    ).resolves.toMatchObject({ resultado: "FALHA", erros: 1 });
    await expect(database.cliente.count()).resolves.toBe(120);
  });

  it("writes nothing of a page that fails, and records the failure", async () => {
    const erp = simulatedErp({
      clientes: [erpCliente(1), erpCliente(2, { cnpj: erpCliente(1).cnpj })],
      produtos: [erpProduto(1)],
    });

    await service(erp).runOnce();

    await expect(database.cliente.count()).resolves.toBe(0);
    await expect(
      database.registroSincronizacao.findFirstOrThrow({
        where: { tipo: "SINCRONIZACAO_CLIENTES" },
      }),
    ).resolves.toMatchObject({ resultado: "FALHA", erros: 1 });
    await expect(database.produto.count()).resolves.toBe(1);
  });

  it("makes one client inactive", async () => {
    await service(fullErp()).runOnce();

    await expect(
      new PrismaSyncRepository(database).deactivateCliente("C001"),
    ).resolves.toBe(true);
    await expect(
      database.cliente.findUniqueOrThrow({ where: { codigoErp: "C001" } }),
    ).resolves.toMatchObject({ status: "INATIVO" });
  });
});
