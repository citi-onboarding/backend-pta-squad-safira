import type { Logger } from "pino";
import type { z } from "zod";

import { HttpProblem } from "../http/problem.js";
import {
  erpClienteSchema,
  erpNovoPedidoSchema,
  erpPageQuerySchema,
  erpPageSchema,
  erpPedidoSchema,
  erpProblemSchema,
  erpProdutoSchema,
  erpTituloSchema,
} from "./erp-client.schemas.js";
import type {
  ErpCliente,
  ErpFieldError,
  ErpNovoPedido,
  ErpPage,
  ErpPageQuery,
  ErpPedido,
  ErpProduto,
  ErpTitulo,
} from "./erp-client.schemas.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const MAX_ATTEMPTS = 3;
const MAX_RATE_LIMIT_WAITS = 3;
const MAX_RETRY_AFTER_SECONDS = 60;
const PROBLEM_TYPE_BASE = "https://distrilux.dev/problems/";

export interface ErpClientOptions {
  baseUrl: string;
  apiKey: string;
  logger: Logger;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retryBaseDelayMs?: number;
}

/** The only way the portal talks to the ERP. Consumers never see HTTP. */
export interface ErpClient {
  listClientes(query?: ErpPageQuery): Promise<ErpPage<ErpCliente>>;
  listProdutos(query?: ErpPageQuery): Promise<ErpPage<ErpProduto>>;
  listTitulos(query?: ErpPageQuery): Promise<ErpPage<ErpTitulo>>;
  getCliente(codigo: string): Promise<ErpCliente>;
  criarPedido(payload: ErpNovoPedido, chaveDeEnvio: string): Promise<ErpPedido>;
  consultarPedido(numero: number): Promise<ErpPedido>;
}

function retryAfterExtension(retryAfterSeconds: number | undefined) {
  return retryAfterSeconds === undefined ? {} : { retryAfterSeconds };
}

export class ErpIndisponivelError extends HttpProblem {
  constructor(public readonly retryAfterSeconds?: number) {
    super(
      503,
      "ERP Unavailable",
      "The ERP is temporarily unavailable. Try again later.",
      `${PROBLEM_TYPE_BASE}erp-unavailable`,
      retryAfterExtension(retryAfterSeconds),
    );
    this.name = "ErpIndisponivelError";
  }
}

export class ErpLimiteDeUsoError extends HttpProblem {
  constructor(public readonly retryAfterSeconds?: number) {
    super(
      503,
      "ERP Usage Limit Reached",
      "The ERP usage limit was reached. Try again later.",
      `${PROBLEM_TYPE_BASE}erp-usage-limit`,
      retryAfterExtension(retryAfterSeconds),
    );
    this.name = "ErpLimiteDeUsoError";
  }
}

function refusalStatus(erpStatus: number): number {
  return erpStatus === 404 || erpStatus === 409 ? erpStatus : 422;
}

export class ErpRecusouError extends HttpProblem {
  constructor(
    public readonly erpStatus: number,
    erpDetail: string | undefined,
    public readonly erros: ErpFieldError[] = [],
  ) {
    super(
      refusalStatus(erpStatus),
      "ERP Refused the Request",
      erpDetail ?? "The ERP refused the request.",
      `${PROBLEM_TYPE_BASE}erp-refused`,
      erros.length > 0 ? { erros } : {},
    );
    this.name = "ErpRecusouError";
  }
}

type RetryableResult =
  | { kind: "transient"; retryAfterSeconds?: number | undefined }
  | { kind: "rate-limited"; retryAfterSeconds?: number | undefined };

type AttemptResult =
  | { kind: "success"; data: unknown }
  | RetryableResult
  | { kind: "failure"; error: HttpProblem };

interface ErpRequest {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

interface RetryCounters {
  attempts: number;
  rateLimitWaits: number;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** The typed failure a retryable result becomes when it is not retried. */
function failureOf(result: RetryableResult): HttpProblem {
  return result.kind === "rate-limited"
    ? new ErpLimiteDeUsoError(result.retryAfterSeconds)
    : new ErpIndisponivelError(result.retryAfterSeconds);
}

function refusalOf(status: number, text: string): ErpRecusouError {
  const parsed = parseJson(text);
  const problem = erpProblemSchema.safeParse(parsed.ok ? parsed.value : {});
  const details = problem.success ? problem.data : {};
  return new ErpRecusouError(status, details.detail, details.erros);
}

export function createErpClient(options: ErpClientOptions): ErpClient {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryBaseDelayMs =
    options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const baseUrl = options.baseUrl.endsWith("/")
    ? options.baseUrl
    : `${options.baseUrl}/`;
  const logger = options.logger;

  function buildUrl(request: ErpRequest): URL {
    const url = new URL(request.path.replace(/^\//, ""), baseUrl);
    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    return url;
  }

  /** One HTTP exchange bounded by the timeout, body included. */
  async function send(
    request: ErpRequest,
    url: URL,
  ): Promise<{ response: Response; text: string } | { reason: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetchFn(url.toString(), {
        method: request.method,
        headers: {
          accept: "application/json",
          "x-api-key": options.apiKey,
          ...(request.body === undefined
            ? {}
            : { "content-type": "application/json" }),
          ...request.headers,
        },
        ...(request.body === undefined
          ? {}
          : { body: JSON.stringify(request.body) }),
        signal: controller.signal,
      });
      return { response, text: await response.text() };
    } catch {
      return { reason: controller.signal.aborted ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Sends once and classifies the answer. Logs never carry headers or bodies. */
  async function attempt(request: ErpRequest): Promise<AttemptResult> {
    const url = buildUrl(request);
    const log = { method: request.method, path: url.pathname };
    const exchange = await send(request, url);

    if ("reason" in exchange) {
      logger.warn(
        { erp: { ...log, reason: exchange.reason } },
        "ERP request did not complete",
      );
      return { kind: "transient" };
    }

    const { response, text } = exchange;
    const status = response.status;
    if (response.ok) {
      const parsed = parseJson(text);
      if (parsed.ok) return { kind: "success", data: parsed.value };
      logger.error({ erp: { ...log, status } }, "ERP answered with non-JSON");
      return { kind: "failure", error: new ErpIndisponivelError() };
    }

    logger.warn({ erp: { ...log, status } }, "ERP answered with an error");
    const retryAfterSeconds = parseRetryAfter(
      response.headers.get("retry-after"),
    );
    if (status === 429) return { kind: "rate-limited", retryAfterSeconds };
    if (status >= 500) return { kind: "transient", retryAfterSeconds };
    if (status === 401 || status === 403) {
      logger.error(
        { erp: { ...log, status } },
        "ERP rejected the configured credentials",
      );
      return { kind: "failure", error: new ErpIndisponivelError() };
    }
    return { kind: "failure", error: refusalOf(status, text) };
  }

  /**
   * Read retry policy: returns how long to wait before repeating the same
   * request, or throws when the request must not be repeated.
   */
  function nextDelay(result: RetryableResult, counters: RetryCounters): number {
    const { retryAfterSeconds } = result;
    if (
      retryAfterSeconds !== undefined &&
      retryAfterSeconds > MAX_RETRY_AFTER_SECONDS
    ) {
      throw failureOf(result);
    }

    let used: number;
    if (result.kind === "rate-limited") {
      if (counters.rateLimitWaits >= MAX_RATE_LIMIT_WAITS) {
        throw failureOf(result);
      }
      used = ++counters.rateLimitWaits;
    } else {
      used = ++counters.attempts;
      if (used >= MAX_ATTEMPTS) throw new ErpIndisponivelError();
    }

    return retryAfterSeconds === undefined
      ? retryBaseDelayMs * 2 ** (used - 1)
      : retryAfterSeconds * 1000;
  }

  function validate<T>(schema: z.ZodType<T>, data: unknown, path: string): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      logger.error(
        {
          erp: {
            path,
            issues: result.error.issues.map((issue) => issue.path.join(".")),
          },
        },
        "ERP answer did not match the contract",
      );
      throw new ErpIndisponivelError();
    }
    return result.data;
  }

  async function read<T>(
    schema: z.ZodType<T>,
    request: Omit<ErpRequest, "method">,
  ): Promise<T> {
    const counters: RetryCounters = { attempts: 0, rateLimitWaits: 0 };
    for (;;) {
      const result = await attempt({ ...request, method: "GET" });
      if (result.kind === "success") {
        return validate(schema, result.data, request.path);
      }
      if (result.kind === "failure") throw result.error;

      const delay = nextDelay(result, counters);
      logger.warn(
        { erp: { method: "GET", path: request.path, ...counters, delay } },
        "Retrying ERP read",
      );
      await sleep(delay);
    }
  }

  /** Order submission: exactly one attempt, never retried (RN-07). */
  async function submit<T>(
    schema: z.ZodType<T>,
    request: Omit<ErpRequest, "method">,
  ): Promise<T> {
    const result = await attempt({ ...request, method: "POST" });
    if (result.kind === "success") {
      return validate(schema, result.data, request.path);
    }
    throw result.kind === "failure" ? result.error : failureOf(result);
  }

  function listPage<T>(
    path: string,
    item: z.ZodType<T>,
    query?: ErpPageQuery,
  ): Promise<ErpPage<T>> {
    return read(erpPageSchema(item) as z.ZodType<ErpPage<T>>, {
      path,
      query: erpPageQuerySchema.parse(query ?? {}),
    });
  }

  return {
    listClientes: async (query) =>
      listPage("/v1/clientes", erpClienteSchema, query),
    listProdutos: async (query) =>
      listPage("/v1/produtos", erpProdutoSchema, query),
    listTitulos: async (query) =>
      listPage("/v1/titulos", erpTituloSchema, query),
    getCliente: async (codigo) =>
      read(erpClienteSchema, {
        path: `/v1/clientes/${encodeURIComponent(codigo)}`,
      }),
    criarPedido: async (payload, chaveDeEnvio) =>
      submit(erpPedidoSchema, {
        path: "/v1/pedidos",
        body: erpNovoPedidoSchema.parse(payload),
        headers: { "idempotency-key": chaveDeEnvio },
      }),
    consultarPedido: async (numero) =>
      read(erpPedidoSchema, { path: `/v1/pedidos/${String(numero)}` }),
  };
}
