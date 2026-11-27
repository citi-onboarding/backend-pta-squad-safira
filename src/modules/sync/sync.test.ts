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
      itensIgnorados: [],
      erros: 0,
      pendencias: 0,
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
  resultado: "SUCESSO" | "PARCIAL" | "FALHA",
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
    itensIgnorados: [],
    erros: resultado === "FALHA" ? 1 : 0,
    pendencias: 0,
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

// ---------- review fixes ----------

const T12 = new Date("2026-11-27T12:00:00.000Z");

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// A simulated ERP server that pages its clients like the real one.
function pagedFetch(options: {
  clientes: ReturnType<typeof erpCliente>[];
  produtos?: ReturnType<typeof erpProduto>[];
  answer?: (path: string, pagina: number, call: number) => Response | null;
}): typeof globalThis.fetch {
  const calls = new Map<string, number>();
  return vi.fn<typeof globalThis.fetch>((input) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    const pagina = Number(url.searchParams.get("pagina") ?? "1");
    const key = `${url.pathname}?${String(pagina)}`;
    const call = (calls.get(key) ?? 0) + 1;
    calls.set(key, call);
    const custom = options.answer?.(url.pathname, pagina, call);
    if (custom) return Promise.resolve(custom);
    const items =
      url.pathname === "/v1/clientes"
        ? options.clientes
        : (options.produtos ?? []);
    return Promise.resolve(
      json({
        dados: items.slice((pagina - 1) * 50, pagina * 50),
        pagina,
        tamanho: 50,
        total: items.length,
        totalPaginas: Math.max(1, Math.ceil(items.length / 50)),
      }),
    );
  });
}

describe("an item that cannot be written does not block the others", () => {
  it("skips a client whose CNPJ belongs to another one, keeps every other client, and moves on", async () => {
    // Changed after every run below, so the ERP sends them again each time.
    const later = { atualizadoEm: "2026-11-27T13:00:00.000Z" };
    const clientes = many(120, (index) => erpCliente(index, later));
    clientes[1] = erpCliente(2, { ...later, cnpj: erpCliente(1).cnpj });
    const { service, repository, mock, time } = setup(
      simulatedErp({ clientes, produtos: [erpProduto(1)] }),
    );

    for (const moment of [T10, T11, T12]) {
      time.set(moment);
      await service.runOnce();
      expect(runOf(repository, "SINCRONIZACAO_CLIENTES")).toMatchObject({
        resultado: "PARCIAL",
        erros: 1,
        pendencias: 1,
        itensIgnorados: [
          { codigo: "C002", motivo: "PrismaClientKnownRequestError P2002" },
        ],
      });
    }

    expect(repository.clientes.size).toBe(119);
    expect(repository.clientes.has("C120")).toBe(true);
    expect(mock.listClientes).toHaveBeenCalledWith({
      pagina: 1,
      tamanho: 50,
      atualizadoDesde: T11.toISOString(),
    });
  });

  it("counts the items read even when their page cannot be written", async () => {
    const { service, repository } = setup(
      simulatedErp({ clientes: many(50, (index) => erpCliente(index)) }),
    );
    repository.saveClientes = () =>
      Promise.reject(new Error("Connection terminated"));

    await service.runOnce();

    expect(runOf(repository, "SINCRONIZACAO_CLIENTES")).toMatchObject({
      resultado: "FALHA",
      itensLidos: 50,
      detalhe: "Error",
    });
  });
});

describe("full-load guard", () => {
  it("makes nothing inactive when the ERP's total changes between pages", async () => {
    const erp = simulatedErp({
      clientes: many(120, (index) => erpCliente(index)),
    });
    const { service, repository } = setup(erp);
    repository.clientes.set("C999", await toCliente("C999"));
    const realList = erp.mock.listClientes.getMockImplementation();
    erp.mock.listClientes.mockImplementation(async (query) => {
      const page = await realList?.(query);
      if (!page) throw new Error("missing page");
      return query?.pagina === 2 ? { ...page, total: 121 } : page;
    });

    await service.runOnce();

    expect(repository.clientes.get("C999")?.status).toBe("ATIVO");
    expect(runOf(repository, "SINCRONIZACAO_CLIENTES")).toMatchObject({
      resultado: "FALHA",
      detalhe: expect.stringMatching(/full load incomplete/i) as unknown,
    });
  });

  it("makes nothing inactive when the full load reads no item", async () => {
    const { service, repository } = setup(simulatedErp({}));
    repository.clientes.set("C999", await toCliente("C999"));

    await service.runOnce();

    expect(repository.clientes.get("C999")?.status).toBe("ATIVO");
    expect(runOf(repository, "SINCRONIZACAO_CLIENTES")?.resultado).toBe(
      "FALHA",
    );
  });
});

describe("failures of one type", () => {
  it("records a product failure without affecting the client run", async () => {
    const fetch = pagedFetch({
      clientes: [erpCliente(1)],
      answer: (path) =>
        path === "/v1/produtos"
          ? json({ title: "Unavailable" }, { status: 503 })
          : null,
    });
    const repository = new InMemorySyncRepository();
    const service = new SyncService({
      erpClient: realErpClient(fetch),
      repository,
      now: () => T10,
    });

    await service.runOnce();

    expect(runOf(repository, "SINCRONIZACAO_PRODUTOS")).toMatchObject({
      resultado: "FALHA",
      erros: 1,
      detalhe: expect.stringMatching(/ErpIndisponivelError/) as unknown,
    });
    expect(runOf(repository, "SINCRONIZACAO_CLIENTES")?.resultado).toBe(
      "SUCESSO",
    );
  });

  it("still runs products when recording the client result fails", async () => {
    const { service, repository } = setup();
    const realFinish = repository.finishRun.bind(repository);
    repository.finishRun = (id, outcome) =>
      id === "run-1"
        ? Promise.reject(new Error("Connection terminated"))
        : realFinish(id, outcome);

    await expect(service.runOnce()).resolves.toEqual({ skipped: false });

    expect(repository.produtos.size).toBe(60);
    expect(runOf(repository, "SINCRONIZACAO_PRODUTOS")?.resultado).toBe(
      "SUCESSO",
    );
  });

  it("keeps the first page when the usage limit runs out, and a later run completes without duplicates", async () => {
    let limited = true;
    const clientes = many(120, (index) => erpCliente(index));
    const fetch = pagedFetch({
      clientes,
      answer: (path, pagina) =>
        limited && path === "/v1/clientes" && pagina === 2
          ? json(
              { title: "Too Many Requests" },
              { status: 429, headers: { "retry-after": "0" } },
            )
          : null,
    });
    const repository = new InMemorySyncRepository();
    const time = clock(T10);
    const service = new SyncService({
      erpClient: realErpClient(fetch),
      repository,
      now: time.now,
    });

    await service.runOnce();

    expect(runOf(repository, "SINCRONIZACAO_CLIENTES")).toMatchObject({
      resultado: "FALHA",
      detalhe: expect.stringMatching(/ErpLimiteDeUsoError/) as unknown,
    });
    expect(repository.clientes.size).toBe(50);

    limited = false;
    time.set(T11);
    await service.runOnce();

    expect(runOf(repository, "SINCRONIZACAO_CLIENTES")?.resultado).toBe(
      "SUCESSO",
    );
    expect(repository.clientes.size).toBe(120);
  });
});

describe("logs", () => {
  it("logs each finished type with its result and counts, never the ERP key", async () => {
    const logger = silentLogger();
    const fetch = pagedFetch({
      clientes: [erpCliente(1)],
      answer: (path) =>
        path === "/v1/produtos"
          ? json({ title: "Unavailable" }, { status: 503 })
          : null,
    });
    const service = new SyncService({
      erpClient: realErpClient(fetch),
      repository: new InMemorySyncRepository(),
      now: () => T10,
      logger,
    });

    await service.runOnce();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        sync: expect.objectContaining({
          tipo: "SINCRONIZACAO_CLIENTES",
          resultado: "SUCESSO",
          itensLidos: 1,
          itensAlterados: 1,
        }) as unknown,
      }),
      expect.any(String),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        sync: expect.objectContaining({
          tipo: "SINCRONIZACAO_PRODUTOS",
          resultado: "FALHA",
        }) as unknown,
      }),
      expect.any(String),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(ERP_KEY);
  });
});

describe("on-demand sync and a scheduled run that starts meanwhile", () => {
  it("writes nothing and refuses when a run starts while the ERP is being read", async () => {
    const { service, repository, mock } = setup();
    const realGet = mock.getCliente.getMockImplementation();
    mock.getCliente.mockImplementation(async (codigo: string) => {
      repository.holdLock();
      const found = await realGet?.(codigo);
      if (!found) throw new Error("missing client");
      return found;
    });

    await expect(service.syncCliente("C001")).rejects.toBeInstanceOf(
      SyncInProgressError,
    );

    expect(repository.clientes.has("C001")).toBe(false);
  });
});

describe("status with a partial run", () => {
  it("counts a partial run as synchronized and reports it as the worse result", async () => {
    const { service, repository } = setup();
    repository.runs.push(
      run("SINCRONIZACAO_CLIENTES", "PARCIAL", "2026-11-27T10:05:00.000Z"),
      run("SINCRONIZACAO_PRODUTOS", "SUCESSO", "2026-11-27T10:03:00.000Z"),
    );

    await expect(service.status()).resolves.toEqual({
      ultimaSincronizacaoOk: new Date("2026-11-27T10:03:00.000Z"),
      ultimoResultado: "PARCIAL",
    });
  });
});
