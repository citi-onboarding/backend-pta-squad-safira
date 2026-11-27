import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";

import { createErpClient } from "../../shared/erp/erp-client.service.js";
import {
  ClienteNotFoundInErpError,
  SyncInProgressError,
  SyncService,
} from "./sync.service.js";
import {
  erpCliente,
  erpProduto,
  InMemorySyncRepository,
  many,
  simulatedErp,
} from "./sync-test-doubles.js";

const T10 = new Date("2026-11-27T10:00:00.000Z");
const T11 = new Date("2026-11-27T11:00:00.000Z");
const ERP_KEY = "secret-erp-key";

function clock(start: Date) {
  let current = start;
  return {
    now: () => current,
    set: (next: Date) => {
      current = next;
    },
  };
}

function setup(
  erp = simulatedErp({
    clientes: many(120, (index) => erpCliente(index)),
    produtos: many(60, (index) => erpProduto(index)),
  }),
) {
  const repository = new InMemorySyncRepository();
  const time = clock(T10);
  const service = new SyncService({
    erpClient: erp.erpClient,
    repository,
    now: time.now,
  });
  return { ...erp, repository, service, time };
}

function runOf(
  repository: InMemorySyncRepository,
  tipo: "SINCRONIZACAO_CLIENTES" | "SINCRONIZACAO_PRODUTOS",
) {
  return repository.runs.filter((run) => run.tipo === tipo).at(-1);
}

// A real ERP client whose server answers are simulated by `fetch`.
function realErpClient(fetch: typeof globalThis.fetch) {
  return createErpClient({
    baseUrl: "https://erp.example.com",
    apiKey: ERP_KEY,
    logger: pino({ level: "silent" }),
    fetch,
    retryBaseDelayMs: 1,
  });
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function page<T>(dados: T[]) {
  return {
    dados,
    pagina: 1,
    tamanho: 50,
    total: dados.length,
    totalPaginas: 1,
  };
}

describe("full load on the first run", () => {
  it("reads every page without a change filter and writes every item", async () => {
    const { service, repository, mock } = setup();

    await service.runOnce();

    expect(mock.listClientes.mock.calls.map(([query]) => query)).toEqual([
      { pagina: 1, tamanho: 50 },
      { pagina: 2, tamanho: 50 },
      { pagina: 3, tamanho: 50 },
    ]);
    expect(mock.listProdutos).toHaveBeenCalledTimes(2);
    expect(repository.clientes.size).toBe(120);
    expect(repository.produtos.size).toBe(60);
    expect(repository.clientes.get("C001")).toEqual({
      codigoErp: "C001",
      razaoSocial: "Cliente C001 Ltda",
      cnpj: "10000000000001",
      cidade: "Recife",
      uf: "PE",
      segmento: "Construtora",
      codigoVendedor: "V01",
      limiteCreditoCentavos: 100_001,
      status: "ATIVO",
      atualizadoNoErpEm: new Date("2026-11-01T08:00:00.000Z"),
    });
    expect(repository.produtos.get("P001")).toEqual({
      codigoErp: "P001",
      descricao: "Produto P001",
      categoria: "Cabos",
      unidade: "UN",
      precoTabelaCentavos: 1_001,
      ativo: true,
      atualizadoNoErpEm: new Date("2026-11-01T08:00:00.000Z"),
    });
  });

  it("makes items missing from the full load inactive without deleting them", async () => {
    const { service, repository } = setup();
    repository.clientes.set("C999", {
      ...(await toCliente("C999")),
    });
    repository.produtos.set("P999", await toProduto("P999"));

    await service.runOnce();

    expect(repository.clientes.get("C999")?.status).toBe("INATIVO");
    expect(repository.produtos.get("P999")?.ativo).toBe(false);
  });
});

describe("incremental runs", () => {
  it("asks only for changes since the start of the last successful run, 50 per page", async () => {
    const { service, mock, time } = setup();
    await service.runOnce();
    mock.listClientes.mockClear();
    time.set(T11);

    await service.runOnce();

    expect(mock.listClientes).toHaveBeenCalledWith({
      pagina: 1,
      tamanho: 50,
      atualizadoDesde: T10.toISOString(),
    });
  });

  it("brings a changed credit limit, description, and price to the portal", async () => {
    const { service, repository, state, time } = setup();
    await service.runOnce();
    state.clientes[0] = erpCliente(1, {
      limiteCreditoCentavos: 555_000,
      atualizadoEm: "2026-11-27T10:30:00.000Z",
    });
    state.produtos[0] = erpProduto(1, {
      descricao: "Produto novo",
      precoTabelaCentavos: 9_999,
      atualizadoEm: "2026-11-27T10:30:00.000Z",
    });
    time.set(T11);

    await service.runOnce();

    expect(repository.clientes.get("C001")?.limiteCreditoCentavos).toBe(
      555_000,
    );
    expect(repository.produtos.get("P001")).toMatchObject({
      descricao: "Produto novo",
      precoTabelaCentavos: 9_999,
    });
  });
});

describe("upsert by ERP code", () => {
  it("keeps the same rows and reports 0 changed items when the same data comes twice", async () => {
    // Items updated after both starts, so the incremental run brings them again.
    const erp = simulatedErp({
      clientes: many(120, (index) =>
        erpCliente(index, { atualizadoEm: "2026-11-27T12:00:00.000Z" }),
      ),
      produtos: many(60, (index) =>
        erpProduto(index, { atualizadoEm: "2026-11-27T12:00:00.000Z" }),
      ),
    });
    const { service, repository, time } = setup(erp);
    await service.runOnce();
    time.set(T11);

    await service.runOnce();

    expect(repository.clientes.size).toBe(120);
    expect(repository.produtos.size).toBe(60);
    expect(runOf(repository, "SINCRONIZACAO_CLIENTES")).toMatchObject({
      resultado: "SUCESSO",
      itensLidos: 120,
      itensAlterados: 0,
    });
    expect(runOf(repository, "SINCRONIZACAO_PRODUTOS")).toMatchObject({
      itensLidos: 60,
      itensAlterados: 0,
    });
  });

  it("keeps a blocked client blocked", async () => {
    const { service, repository } = setup(
      simulatedErp({ clientes: [erpCliente(1, { status: "BLOQUEADO" })] }),
    );

    await service.runOnce();

    expect(repository.clientes.get("C001")?.status).toBe("BLOQUEADO");
  });
});

describe("data stays available when the ERP fails", () => {
  function routedFetch(
    answer: (path: string, call: number) => Response,
  ): typeof globalThis.fetch {
    const calls = new Map<string, number>();
    return vi.fn<typeof globalThis.fetch>((input) => {
      const url = input instanceof Request ? input.url : input.toString();
      const path = new URL(url).pathname;
      const call = (calls.get(path) ?? 0) + 1;
      calls.set(path, call);
      return Promise.resolve(answer(path, call));
    });
  }

  it("records the failure, keeps the data, and starts the next run from the same point", async () => {
    let erpDown = false;
    const fetch = routedFetch((path) => {
      if (path === "/v1/clientes" && erpDown) {
        return json({ title: "Unavailable" }, { status: 503 });
      }
      return path === "/v1/clientes"
        ? json(page([erpCliente(1)]))
        : json(page([erpProduto(1)]));
    });
    const repository = new InMemorySyncRepository();
    const time = clock(T10);
    const service = new SyncService({
      erpClient: realErpClient(fetch),
      repository,
      now: time.now,
    });
    await service.runOnce();
    erpDown = true;
    time.set(T11);

    await service.runOnce();

    expect(repository.clientes.get("C001")).toBeDefined();
    const failed = runOf(repository, "SINCRONIZACAO_CLIENTES");
    expect(failed).toMatchObject({ resultado: "FALHA", erros: 1 });
    expect(failed?.detalhe).toMatch(/ErpIndisponivelError/);
    expect(failed?.detalhe).not.toContain(ERP_KEY);
    expect(runOf(repository, "SINCRONIZACAO_PRODUTOS")).toMatchObject({
      resultado: "SUCESSO",
    });
    await expect(
      repository.lastSuccessfulStart("SINCRONIZACAO_CLIENTES"),
    ).resolves.toEqual(T10);
  });

  it("waits on the usage limit and writes every item of the page exactly once", async () => {
    const fetch = routedFetch((path, call) => {
      if (path === "/v1/clientes" && call === 1) {
        return json(
          { title: "Too Many Requests" },
          { status: 429, headers: { "retry-after": "0" } },
        );
      }
      return path === "/v1/clientes"
        ? json(page(many(3, (index) => erpCliente(index))))
        : json(page([]));
    });
    const repository = new InMemorySyncRepository();
    const service = new SyncService({
      erpClient: realErpClient(fetch),
      repository,
      now: () => T10,
    });

    await service.runOnce();

    expect(runOf(repository, "SINCRONIZACAO_CLIENTES")).toMatchObject({
      resultado: "SUCESSO",
      itensLidos: 3,
    });
    expect(
      repository.savedPages
        .filter((saved) => saved.tipo === "SINCRONIZACAO_CLIENTES")
        .flatMap((saved) => saved.codes),
    ).toEqual(["C001", "C002", "C003"]);
  });
});

describe("run record", () => {
  it("records type, start, end, result, items read, errors, and changed items", async () => {
    const { service, repository } = setup();

    await service.runOnce();

    expect(runOf(repository, "SINCRONIZACAO_CLIENTES")).toEqual({
      id: expect.any(String),
      tipo: "SINCRONIZACAO_CLIENTES",
      iniciouEm: T10,
      terminouEm: T10,
      resultado: "SUCESSO",
      itensLidos: 120,
      itensAlterados: 120,
      erros: 0,
      detalhe: null,
    });
  });
});

describe("no overlapping runs", () => {
  it("does not read the ERP nor write anything while another run holds the lock", async () => {
    const { service, repository, mock } = setup();
    repository.holdLock();

    await expect(service.runOnce()).resolves.toEqual({ skipped: true });

    expect(mock.listClientes).not.toHaveBeenCalled();
    expect(repository.runs).toEqual([]);
    expect(repository.clientes.size).toBe(0);
  });
});

describe("on-demand client synchronization", () => {
  it("writes the client and records no run", async () => {
    const { service, repository } = setup();

    await expect(service.syncCliente("C001")).resolves.toEqual({
      codigo: "C001",
      status: "ATIVO",
    });

    expect(repository.clientes.get("C001")?.razaoSocial).toBe(
      "Cliente C001 Ltda",
    );
    expect(repository.runs).toEqual([]);
  });

  it("makes the client inactive when the ERP no longer has it", async () => {
    const { service, repository } = setup();
    repository.clientes.set("C999", await toCliente("C999"));

    await expect(service.syncCliente("C999")).rejects.toBeInstanceOf(
      ClienteNotFoundInErpError,
    );

    expect(repository.clientes.get("C999")?.status).toBe("INATIVO");
  });

  it("refuses while a scheduled run is in progress", async () => {
    const { service, repository, mock } = setup();
    repository.holdLock();

    await expect(service.syncCliente("C001")).rejects.toBeInstanceOf(
      SyncInProgressError,
    );

    expect(mock.getCliente).not.toHaveBeenCalled();
  });
});

describe("synchronization status", () => {
  it("is empty before any run", async () => {
    const { service } = setup();

    await expect(service.status()).resolves.toEqual({
      ultimaSincronizacaoOk: null,
      ultimoResultado: null,
    });
  });

  it("uses the older successful end and the worse latest result", async () => {
    const { service, repository } = setup();
    repository.runs.push(
      run("SINCRONIZACAO_CLIENTES", "SUCESSO", "2026-11-27T10:05:00.000Z"),
      run("SINCRONIZACAO_PRODUTOS", "SUCESSO", "2026-11-27T10:03:00.000Z"),
    );

    await expect(service.status()).resolves.toEqual({
      ultimaSincronizacaoOk: new Date("2026-11-27T10:03:00.000Z"),
      ultimoResultado: "SUCESSO",
    });

    repository.runs.push(
      run("SINCRONIZACAO_PRODUTOS", "FALHA", "2026-11-27T11:01:00.000Z"),
    );

    await expect(service.status()).resolves.toMatchObject({
      ultimaSincronizacaoOk: new Date("2026-11-27T10:03:00.000Z"),
      ultimoResultado: "FALHA",
    });
  });
});

function run(
  tipo: "SINCRONIZACAO_CLIENTES" | "SINCRONIZACAO_PRODUTOS",
  resultado: "SUCESSO" | "FALHA",
  end: string,
) {
  return {
    id: `${tipo}-${end}`,
    tipo,
    iniciouEm: new Date(end),
    terminouEm: new Date(end),
    resultado,
    itensLidos: 0,
    itensAlterados: 0,
    erros: resultado === "FALHA" ? 1 : 0,
    detalhe: null,
  };
}

function toCliente(codigo: string) {
  return Promise.resolve({
    codigoErp: codigo,
    razaoSocial: `Cliente ${codigo}`,
    cnpj: "99999999000199",
    cidade: "Recife",
    uf: "PE",
    segmento: "Revenda",
    codigoVendedor: "V02",
    limiteCreditoCentavos: 1,
    status: "ATIVO" as const,
    atualizadoNoErpEm: new Date("2026-01-01T00:00:00.000Z"),
  });
}

function toProduto(codigo: string) {
  return Promise.resolve({
    codigoErp: codigo,
    descricao: `Produto ${codigo}`,
    categoria: "Outros",
    unidade: "UN",
    precoTabelaCentavos: 1,
    ativo: true,
    atualizadoNoErpEm: new Date("2026-01-01T00:00:00.000Z"),
  });
}
