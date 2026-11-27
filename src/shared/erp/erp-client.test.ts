import { Writable } from "node:stream";

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { problemHandler } from "../http/problem.js";
import { createLogger } from "../logging/logger.js";
import {
  createErpClient,
  ErpIndisponivelError,
  ErpLimiteDeUsoError,
  ErpRecusouError,
} from "./erp-client.service.js";
import type { ErpClientOptions } from "./erp-client.service.js";

const BASE_URL = "https://erp.test";
const API_KEY = "erp-secret-key-7f3a9c";

const cliente = {
  codigo: "C0001",
  razaoSocial: "Mercado Boa Luz Ltda",
  cnpj: "23775684000107",
  cidade: "Recife",
  uf: "PE",
  segmento: "Varejo",
  limiteCreditoCentavos: 5_000_000,
  vendedor: "Ana",
  dataCadastro: "2021-12-20",
  status: "ATIVO",
  atualizadoEm: "2026-11-05T09:00:00-03:00",
};

const produto = {
  codigo: "P00001",
  descricao: "Lâmpada LED 9W",
  categoria: "Iluminação",
  unidade: "UN",
  precoTabelaCentavos: 1290,
  ativo: true,
  atualizadoEm: "2026-11-10T09:00:00-03:00",
};

const titulo = {
  numero: 900457,
  cliente: "C0003",
  pedidoErp: 70001,
  parcela: "1/3",
  valorCentavos: 43_000,
  emissao: "2026-10-05",
  vencimento: "2026-11-04",
  pagamento: null,
  status: "VENCIDO",
  atualizadoEm: "2026-11-05T06:00:00-03:00",
};

const pedido = {
  numero: 70001,
  status: "RECEBIDO",
  cliente: "C0001",
  itens: [
    {
      produto: "P00001",
      descricao: "Lâmpada LED 9W",
      quantidade: 10,
      precoUnitarioCentavos: 1290,
      subtotalCentavos: 12_900,
    },
  ],
  valorTotalCentavos: 12_900,
  referenciaPortal: "portal-42",
  criadoEm: "2026-11-19T14:03:00-03:00",
};

const novoPedido = {
  cliente: "C0001",
  itens: [{ produto: "P00001", quantidade: 10 }],
  referenciaPortal: "portal-42",
};

function page<T>(dados: T[], pagina = 1, tamanho = 20) {
  return { dados, pagina, tamanho, total: dados.length, totalPaginas: 1 };
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function problemResponse(
  status: number,
  headers: Record<string, string> = {},
  extra: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title: "ERP problem",
      status,
      detail: "ERP detail",
      instance: "/v1/x",
      ...extra,
    }),
    {
      status,
      headers: { "content-type": "application/problem+json", ...headers },
    },
  );
}

type FetchFake = ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

function hangUntilAborted(): Parameters<
  FetchFake["mockImplementationOnce"]
>[0] {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    });
}

function setup(options: Partial<ErpClientOptions> = {}) {
  let logs = "";
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      logs += chunk.toString();
      callback();
    },
  });
  const logger = createLogger({ LOG_LEVEL: "trace" }, destination);
  const fetch: FetchFake = vi.fn<typeof globalThis.fetch>();
  const client = createErpClient({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    fetch,
    logger,
    ...options,
  });
  return { client, fetch, logs: () => logs };
}

function sentRequest(fetch: FetchFake, index: number) {
  const call = fetch.mock.calls[index];
  if (!call) throw new Error(`No ERP request at index ${index}`);
  const [input, init] = call;
  return {
    url: new URL(input instanceof Request ? input.url : input),
    method: init?.method ?? "GET",
    headers: new Headers(init?.headers),
    body: init?.body,
  };
}

async function settle<T>(promise: Promise<T>) {
  const outcome = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  return outcome;
}

async function failureOf(promise: Promise<unknown>) {
  const outcome = await settle(promise);
  if (outcome.ok) throw new Error("Expected the ERP operation to fail");
  return outcome.error;
}

describe("ERP client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("authentication", () => {
    it("sends the key in the X-Api-Key header on every operation", async () => {
      const { client, fetch } = setup();
      fetch
        .mockResolvedValueOnce(jsonResponse(page([cliente])))
        .mockResolvedValueOnce(jsonResponse(page([produto])))
        .mockResolvedValueOnce(jsonResponse(page([titulo])))
        .mockResolvedValueOnce(jsonResponse(cliente))
        .mockResolvedValueOnce(jsonResponse(pedido, 201))
        .mockResolvedValueOnce(jsonResponse(pedido));

      await client.listClientes();
      await client.listProdutos();
      await client.listTitulos();
      await client.getCliente("C0001");
      await client.criarPedido(novoPedido, "pedido-123");
      await client.consultarPedido(70001);

      expect(fetch).toHaveBeenCalledTimes(6);
      for (let index = 0; index < 6; index += 1) {
        expect(sentRequest(fetch, index).headers.get("x-api-key")).toBe(
          API_KEY,
        );
      }
    });
  });

  describe("paginated reads", () => {
    it("reads a customers page with page, size, and updated-since filter", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValueOnce(jsonResponse(page([cliente], 2, 50)));

      const result = await client.listClientes({
        pagina: 2,
        tamanho: 50,
        atualizadoDesde: "2026-11-01T00:00:00-03:00",
      });

      const sent = sentRequest(fetch, 0);
      expect(sent.method).toBe("GET");
      expect(sent.url.origin).toBe(BASE_URL);
      expect(sent.url.pathname).toBe("/v1/clientes");
      expect(sent.url.searchParams.get("pagina")).toBe("2");
      expect(sent.url.searchParams.get("tamanho")).toBe("50");
      expect(sent.url.searchParams.get("atualizadoDesde")).toBe(
        "2026-11-01T00:00:00-03:00",
      );
      expect(result).toEqual(page([cliente], 2, 50));
    });

    it("reads products and receivables pages", async () => {
      const { client, fetch } = setup();
      fetch
        .mockResolvedValueOnce(jsonResponse(page([produto], 3, 10)))
        .mockResolvedValueOnce(jsonResponse(page([titulo], 1, 50)));

      const produtos = await client.listProdutos({ pagina: 3, tamanho: 10 });
      const titulos = await client.listTitulos({
        tamanho: 50,
        atualizadoDesde: "2026-11-20",
      });

      expect(sentRequest(fetch, 0).url.pathname).toBe("/v1/produtos");
      expect(sentRequest(fetch, 0).url.searchParams.get("pagina")).toBe("3");
      expect(sentRequest(fetch, 1).url.pathname).toBe("/v1/titulos");
      expect(
        sentRequest(fetch, 1).url.searchParams.get("atualizadoDesde"),
      ).toBe("2026-11-20");
      expect(produtos.dados).toEqual([produto]);
      expect(titulos.dados).toEqual([titulo]);
    });

    it("reads the receivables of one customer", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValueOnce(jsonResponse(page([titulo], 1, 50)));

      const result = await client.listTitulos({
        cliente: "C0001",
        tamanho: 50,
      });

      const sent = sentRequest(fetch, 0);
      expect(sent.url.pathname).toBe("/v1/titulos");
      expect(sent.url.searchParams.get("cliente")).toBe("C0001");
      expect(result.dados).toEqual([titulo]);
    });

    it("rejects an empty customer filter without calling the ERP", async () => {
      const { client, fetch } = setup();

      await expect(client.listTitulos({ cliente: "" })).rejects.toThrow(
        ZodError,
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each([0, 51])(
      "rejects page size %i without calling the ERP",
      async (tamanho) => {
        const { client, fetch } = setup();

        await expect(client.listClientes({ tamanho })).rejects.toThrow(
          ZodError,
        );
        expect(fetch).not.toHaveBeenCalled();
      },
    );
  });

  describe("single-record reads", () => {
    it("reads one customer by code", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValueOnce(jsonResponse(cliente));

      await expect(client.getCliente("C0001")).resolves.toEqual(cliente);
      expect(sentRequest(fetch, 0).url.pathname).toBe("/v1/clientes/C0001");
    });

    it("reads one order by number", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValueOnce(jsonResponse(pedido));

      await expect(client.consultarPedido(70001)).resolves.toEqual(pedido);
      expect(sentRequest(fetch, 0).url.pathname).toBe("/v1/pedidos/70001");
    });

    it("fails with a 404 refusal when the record does not exist", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValueOnce(problemResponse(404));

      const error = await failureOf(client.getCliente("C9999"));

      expect(error).toBeInstanceOf(ErpRecusouError);
      expect(error).toMatchObject({ status: 404, erpStatus: 404 });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("order submission", () => {
    it("submits once with the Idempotency-Key and returns the ERP order", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValueOnce(jsonResponse(pedido, 201));

      const result = await client.criarPedido(novoPedido, "pedido-123");

      const sent = sentRequest(fetch, 0);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(sent.method).toBe("POST");
      expect(sent.url.pathname).toBe("/v1/pedidos");
      expect(sent.headers.get("idempotency-key")).toBe("pedido-123");
      expect(sent.headers.get("content-type")).toContain("application/json");
      expect(JSON.parse(sent.body as string)).toEqual(novoPedido);
      expect(result).toEqual(pedido);
    });

    it.each([
      ["503", () => problemResponse(503, { "retry-after": "1" })],
      ["500", () => problemResponse(500)],
    ])(
      "does not retry and fails as unavailable on %s",
      async (_label, response) => {
        const { client, fetch } = setup();
        fetch.mockResolvedValue(response());

        const error = await failureOf(
          client.criarPedido(novoPedido, "pedido-123"),
        );

        expect(error).toBeInstanceOf(ErpIndisponivelError);
        expect(fetch).toHaveBeenCalledTimes(1);
      },
    );

    it("does not retry on 429 and reports the requested delay", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValue(problemResponse(429, { "retry-after": "2" }));

      const error = await failureOf(
        client.criarPedido(novoPedido, "pedido-123"),
      );

      expect(error).toBeInstanceOf(ErpLimiteDeUsoError);
      expect(error).toMatchObject({ retryAfterSeconds: 2 });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("does not retry after a timeout", async () => {
      const { client, fetch } = setup();
      fetch.mockImplementation(hangUntilAborted());

      const error = await failureOf(
        client.criarPedido(novoPedido, "pedido-123"),
      );

      expect(error).toBeInstanceOf(ErpIndisponivelError);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["no items", { cliente: "C0001", itens: [] }],
      [
        "more than 50 items",
        {
          cliente: "C0001",
          itens: Array.from({ length: 51 }, () => ({
            produto: "P00001",
            quantidade: 1,
          })),
        },
      ],
      [
        "a quantity above 9999",
        {
          cliente: "C0001",
          itens: [{ produto: "P00001", quantidade: 10_000 }],
        },
      ],
      [
        "a quantity below 1",
        { cliente: "C0001", itens: [{ produto: "P00001", quantidade: 0 }] },
      ],
    ])(
      "rejects an order with %s without calling the ERP",
      async (_label, payload) => {
        const { client, fetch } = setup();

        await expect(client.criarPedido(payload, "pedido-123")).rejects.toThrow(
          ZodError,
        );
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it("rejects an empty submission key without calling the ERP", async () => {
      const { client, fetch } = setup();

      await expect(client.criarPedido(novoPedido, "")).rejects.toThrow(
        ZodError,
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("timeouts", () => {
    it("aborts after 30 seconds by default and retries the read", async () => {
      const { client, fetch } = setup();
      fetch
        .mockImplementationOnce(hangUntilAborted())
        .mockResolvedValueOnce(jsonResponse(page([cliente])));

      const result = client.listClientes();
      await vi.advanceTimersByTimeAsync(29_999);
      expect(fetch).toHaveBeenCalledTimes(1);

      const outcome = await settle(result);
      expect(outcome).toEqual({ ok: true, value: page([cliente]) });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("keeps a slow answer that arrives within the default timeout", async () => {
      const { client, fetch } = setup();
      fetch.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => {
              resolve(jsonResponse(cliente));
            }, 25_000);
          }),
      );

      const outcome = await settle(client.getCliente("C0001"));

      expect(outcome).toEqual({ ok: true, value: cliente });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("honors a configured timeout", async () => {
      const { client, fetch } = setup({ timeoutMs: 1_000 });
      fetch
        .mockImplementationOnce(hangUntilAborted())
        .mockResolvedValueOnce(jsonResponse(cliente));

      const result = client.getCliente("C0001");
      await vi.advanceTimersByTimeAsync(1_000);
      expect(fetch).toHaveBeenCalledTimes(1);

      await settle(result);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("resilient reads", () => {
    it("retries a 5xx with growing backoff and succeeds", async () => {
      const { client, fetch } = setup();
      fetch
        .mockResolvedValueOnce(problemResponse(500))
        .mockResolvedValueOnce(problemResponse(502))
        .mockResolvedValueOnce(jsonResponse(page([produto])));

      const result = client.listProdutos();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(499);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(3);

      await expect(result).resolves.toEqual(page([produto]));
    });

    it("fails as unavailable after 503 three times", async () => {
      const { client, fetch } = setup();
      fetch.mockImplementation(() => Promise.resolve(problemResponse(503)));

      const error = await failureOf(client.listClientes());

      expect(error).toBeInstanceOf(ErpIndisponivelError);
      expect(error).toMatchObject({ status: 503 });
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("waits the Retry-After of a 503 before the next attempt", async () => {
      const { client, fetch } = setup();
      fetch
        .mockResolvedValueOnce(problemResponse(503, { "retry-after": "3" }))
        .mockResolvedValueOnce(jsonResponse(page([titulo])));

      const result = client.listTitulos();
      await vi.advanceTimersByTimeAsync(2_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      await expect(result).resolves.toEqual(page([titulo]));
    });

    it("fails immediately when a 503 Retry-After exceeds 60 seconds", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValue(problemResponse(503, { "retry-after": "120" }));

      const error = await failureOf(client.listTitulos());

      expect(error).toBeInstanceOf(ErpIndisponivelError);
      expect(error).toMatchObject({ status: 503, retryAfterSeconds: 120 });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("ignores Retry-After on a 502 and retries with backoff", async () => {
      const { client, fetch } = setup();
      fetch.mockImplementation(() =>
        Promise.resolve(problemResponse(502, { "retry-after": "120" })),
      );

      const failure = client.listClientes().then(
        () => undefined,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(499);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(3);

      const error = await failure;
      expect(error).toBeInstanceOf(ErpIndisponivelError);
      expect(error).toMatchObject({ retryAfterSeconds: undefined });
    });

    it("fails as unavailable when the ERP cannot be reached", async () => {
      const { client, fetch } = setup();
      fetch.mockRejectedValue(new TypeError("fetch failed"));

      const error = await failureOf(client.getCliente("C0001"));

      expect(error).toBeInstanceOf(ErpIndisponivelError);
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("rate limits", () => {
    it("waits Retry-After on 429 and repeats the same request", async () => {
      const { client, fetch } = setup();
      fetch
        .mockResolvedValueOnce(problemResponse(429, { "retry-after": "2" }))
        .mockResolvedValueOnce(jsonResponse(page([cliente], 4, 50)));

      const result = client.listClientes({
        pagina: 4,
        tamanho: 50,
        atualizadoDesde: "2026-11-01",
      });
      await vi.advanceTimersByTimeAsync(1_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      await expect(result).resolves.toEqual(page([cliente], 4, 50));
      expect(sentRequest(fetch, 1).url.href).toBe(
        sentRequest(fetch, 0).url.href,
      );
    });

    it("accepts Retry-After as an HTTP date", async () => {
      vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
      const { client, fetch } = setup();
      fetch
        .mockResolvedValueOnce(
          problemResponse(429, {
            "retry-after": "Wed, 25 Nov 2026 12:00:05 GMT",
          }),
        )
        .mockResolvedValueOnce(jsonResponse(cliente));

      const result = client.getCliente("C0001");
      await vi.advanceTimersByTimeAsync(4_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);

      await expect(result).resolves.toEqual(cliente);
    });

    it("does not spend 5xx attempts while waiting for a rate limit", async () => {
      const { client, fetch } = setup();
      fetch
        .mockResolvedValueOnce(problemResponse(429, { "retry-after": "1" }))
        .mockResolvedValueOnce(problemResponse(500))
        .mockResolvedValueOnce(problemResponse(500))
        .mockResolvedValueOnce(jsonResponse(cliente));

      const outcome = await settle(client.getCliente("C0001"));

      expect(outcome).toEqual({ ok: true, value: cliente });
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it("fails with a usage limit after 3 waits", async () => {
      const { client, fetch } = setup();
      fetch.mockImplementation(() =>
        Promise.resolve(problemResponse(429, { "retry-after": "1" })),
      );

      const error = await failureOf(client.listProdutos());

      expect(error).toBeInstanceOf(ErpLimiteDeUsoError);
      expect(error).toMatchObject({ status: 503, retryAfterSeconds: 1 });
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it("fails immediately when Retry-After exceeds 60 seconds", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValue(problemResponse(429, { "retry-after": "120" }));

      const error = await failureOf(client.listProdutos());

      expect(error).toBeInstanceOf(ErpLimiteDeUsoError);
      expect(error).toMatchObject({ retryAfterSeconds: 120 });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("refusals and misconfiguration", () => {
    it("keeps the ERP status, detail, and field errors of a 422 on the error only", async () => {
      const { client, fetch } = setup();
      const erros = [{ campo: "itens.0.produto", mensagem: "Produto inativo" }];
      fetch.mockResolvedValueOnce(
        problemResponse(422, {}, { detail: "Pedido inválido", erros }),
      );

      const error = await failureOf(
        client.criarPedido(novoPedido, "pedido-123"),
      );

      expect(error).toBeInstanceOf(ErpRecusouError);
      expect(error).toMatchObject({
        status: 422,
        erpStatus: 422,
        erpDetail: "Pedido inválido",
        erros,
        message: "The ERP refused the request.",
        extensions: {},
      });
    });

    it("logs the ERP status and field names but no ERP text", async () => {
      const { client, fetch, logs } = setup();
      fetch.mockResolvedValueOnce(
        problemResponse(
          422,
          {},
          {
            detail: "Cliente 23775684000107 sem cadastro",
            erros: [{ campo: "itens.0.produto", mensagem: "Produto inativo" }],
          },
        ),
      );

      await failureOf(client.criarPedido(novoPedido, "pedido-123"));

      expect(logs()).toContain('"status":422');
      expect(logs()).toContain("itens.0.produto");
      expect(logs()).not.toContain("23775684000107");
      expect(logs()).not.toContain("Produto inativo");
    });

    it.each([
      [400, 422],
      [409, 409],
    ])(
      "maps an ERP %i refusal to client status %i without retrying",
      async (erpStatus, clientStatus) => {
        const { client, fetch } = setup();
        fetch.mockResolvedValue(problemResponse(erpStatus));

        const error = await failureOf(client.listClientes());

        expect(error).toBeInstanceOf(ErpRecusouError);
        expect(error).toMatchObject({ status: clientStatus, erpStatus });
        expect(fetch).toHaveBeenCalledTimes(1);
      },
    );

    it.each([401, 403])(
      "fails as unavailable on %i without retrying",
      async (status) => {
        const { client, fetch } = setup();
        fetch.mockResolvedValue(problemResponse(status));

        const error = await failureOf(client.listClientes());

        expect(error).toBeInstanceOf(ErpIndisponivelError);
        expect(fetch).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe("response validation", () => {
    it("fails as unavailable instead of returning a malformed record", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValue(
        jsonResponse(page([{ ...cliente, limiteCreditoCentavos: "5000000" }])),
      );

      const outcome = await settle(client.listClientes());

      expect(outcome.ok).toBe(false);
      expect(outcome.ok ? undefined : outcome.error).toBeInstanceOf(
        ErpIndisponivelError,
      );
      expect(JSON.stringify(outcome)).not.toContain("Mercado Boa Luz");
    });

    it("fails as unavailable when a successful body is not JSON", async () => {
      const { client, fetch } = setup();
      fetch.mockResolvedValue(
        new Response("<html>gateway</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );

      const error = await failureOf(client.getCliente("C0001"));

      expect(error).toBeInstanceOf(ErpIndisponivelError);
    });
  });

  describe("key confidentiality", () => {
    it("never writes the key to logs or errors", async () => {
      const { client, fetch, logs } = setup();
      fetch
        .mockImplementationOnce(() => Promise.resolve(problemResponse(503)))
        .mockImplementationOnce(() => Promise.resolve(problemResponse(503)))
        .mockImplementationOnce(() => Promise.resolve(problemResponse(503)))
        .mockImplementationOnce(() => Promise.resolve(problemResponse(401)))
        .mockImplementationOnce(() => Promise.resolve(problemResponse(422)))
        .mockImplementationOnce(() => Promise.resolve(problemResponse(429)))
        .mockImplementationOnce(hangUntilAborted());

      const errors = [
        await failureOf(client.listClientes()),
        await failureOf(client.listProdutos()),
        await failureOf(client.criarPedido(novoPedido, "pedido-123")),
        await failureOf(client.criarPedido(novoPedido, "pedido-124")),
        await failureOf(client.criarPedido(novoPedido, "pedido-125")),
      ];
      await vi.runAllTimersAsync();

      expect(logs()).not.toBe("");
      expect(logs()).not.toContain(API_KEY);
      for (const error of errors) {
        expect((error as Error).message).not.toContain(API_KEY);
        expect(JSON.stringify(error)).not.toContain(API_KEY);
        expect(String((error as Error).stack)).not.toContain(API_KEY);
      }
    });
  });
});

describe("ERP failures at the HTTP boundary", () => {
  function createTestApp(fetch: FetchFake) {
    const client = createErpClient({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      fetch,
      logger: createLogger({ LOG_LEVEL: "silent" }),
      retryBaseDelayMs: 1,
    });
    const app = express();
    app.get("/clientes", async (_request, response) => {
      response.json(await client.listClientes());
    });
    app.post("/pedidos", async (_request, response) => {
      response.json(await client.criarPedido(novoPedido, "pedido-123"));
    });
    app.get("/alive", (_request, response) => {
      response.json({ status: "ok" });
    });
    app.use(problemHandler);
    return app;
  }

  it("returns 503 Problem Details without the key and keeps serving", async () => {
    const fetch: FetchFake = vi.fn<typeof globalThis.fetch>();
    fetch.mockImplementation(() => Promise.resolve(problemResponse(503)));
    const app = createTestApp(fetch);

    const failed = await request(app).get("/clientes").expect(503);

    expect(failed.headers["content-type"]).toContain(
      "application/problem+json",
    );
    expect(failed.body).toMatchObject({ status: 503 });
    expect(failed.text).not.toContain(API_KEY);
    expect(fetch).toHaveBeenCalledTimes(3);
    await request(app).get("/alive").expect(200, { status: "ok" });
  });

  it("returns 503 with retryAfterSeconds for a usage limit", async () => {
    const fetch: FetchFake = vi.fn<typeof globalThis.fetch>();
    fetch.mockResolvedValue(problemResponse(429, { "retry-after": "120" }));

    const failed = await request(createTestApp(fetch))
      .get("/clientes")
      .expect(503);

    expect(failed.body).toMatchObject({ status: 503, retryAfterSeconds: 120 });
    expect(failed.text).not.toContain(API_KEY);
  });

  it("returns 409 for an ERP conflict refusal", async () => {
    const fetch: FetchFake = vi.fn<typeof globalThis.fetch>();
    fetch.mockResolvedValue(
      problemResponse(
        409,
        {},
        {
          detail: "Pedido duplicado do cliente C0001",
          erros: [{ campo: "referenciaPortal", mensagem: "Já usada" }],
        },
      ),
    );

    const failed = await request(createTestApp(fetch))
      .post("/pedidos")
      .expect(409);

    expect(failed.body).toMatchObject({
      status: 409,
      detail: "The ERP refused the request.",
    });
    expect(failed.body).not.toHaveProperty("erros");
    expect(failed.text).not.toContain("Pedido duplicado");
    expect(failed.text).not.toContain("Já usada");
    expect(failed.text).not.toContain(API_KEY);
  });
});
