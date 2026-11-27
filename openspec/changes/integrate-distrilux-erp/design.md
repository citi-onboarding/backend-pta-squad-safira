## Context

The backend has `src/shared` infrastructure (environment, logger, Problem
Details handler) and no business modules yet. The ERP contract is DistriLux ERP
API v3.3.0 (`https://pta-erp-api.onrender.com/openapi.json`): `X-Api-Key`
authentication, paginated lists (`dados`, `pagina`, `tamanho`, `total`,
`totalPaginas`), integer cents, `application/problem+json` errors with an
optional `erros[]` of `{ campo, mensagem }`, and `Retry-After` on `429`/`503`.
Future modules (synchronizers, BACK-08 submission) must consume ERP data
without importing each other, so the client lives in `src/shared`.

## Goals / Non-Goals

**Goals:**

- One injectable `ErpClient` interface that hides HTTP from consumers.
- Deterministic, fast tests with a fake `fetch` and fake timers.
- Failures that are typed for callers and safe for clients.

**Non-Goals:**

- Cross-request rate-limit budgeting, circuit breaking, or caching.
- Pagination loops ("fetch all pages"); synchronizers own iteration.

## Decisions

### Location and shape

`src/shared/erp/erp-client.service.ts` exports the `ErpClient` interface, the
`createErpClient(options)` factory, and the three error classes;
`erp-client.schemas.ts` holds the Zod schemas and inferred types. Consumers
depend on the interface type only and receive the instance through
`createApp` options. Rejected: a module under `src/modules/erp` — modules
cannot import other modules, so synchronizers could not reuse it.

### Injected `fetch`, no HTTP mocking library

Options accept `fetch: typeof globalThis.fetch` (default the global), a
logger, `timeoutMs` (30 000), and `retryBaseDelayMs` (500). Waits use
`setTimeout`, so tests inject a fake `fetch` and use fake timers; no injectable
`sleep` was needed.
Rejected: MSW or nock, which the task suggested for the fake ERP. An injected
`fetch` covers the same five scenarios (200, 503, 429, timeout, refusal) without
a new dependency and keeps the client honest about its seams; accepted in the
PR #12 review.

### Errors extend `HttpProblem`

`ErpIndisponivelError`, `ErpLimiteDeUsoError`, and `ErpRecusouError` extend the
existing `HttpProblem`, so the existing `problemHandler` renders them without
changes and does not log them as unhandled errors. Mapping:

| Failure                                                                     | Error                  | Client status             |
| --------------------------------------------------------------------------- | ---------------------- | ------------------------- |
| 5xx after attempts, timeout, network, 401/403, malformed or non-JSON answer | `ErpIndisponivelError` | 503                       |
| 429 after waits, or `Retry-After` > 60 s; 429 on submission                 | `ErpLimiteDeUsoError`  | 503 + `retryAfterSeconds` |
| 400, 404, 409, 422                                                          | `ErpRecusouError`      | 404 / 409 / 422           |

Usage limit maps to `503` (decided with the requester): from the browser's
point of view a dependency is temporarily unavailable; `429` would suggest the
user is being throttled. Rejected: a fourth error for malformed responses —
the requester bounded the set to three, and callers react the same way.

Error `detail` strings are fixed English text; they never interpolate the ERP
answer, headers, URLs with credentials, or the key. A refusal keeps the ERP
`detail` and field errors on the error object (`erpDetail`, `erros`) for server
code, but neither reaches the Problem Details response (PR #12 review): ERP
text may carry customer data and is not the portal's message to give.
Unknown 4xx statuses are treated as refusals with client status `422`.

### Retry policy

- Reads: attempt loop with two counters — `attempts` (max 3) for 5xx, timeout,
  network errors; `rateLimitWaits` (max 3) for `429`. Backoff is
  `retryBaseDelayMs × 2^(attempt-1)` (500 ms, 1 000 ms). A `503` with
  `Retry-After` uses that delay but still counts as an attempt. A `Retry-After`
  above 60 s fails immediately — as a usage limit on `429` and as an
  unavailability on `503`, both carrying `retryAfterSeconds`. `Retry-After` is
  read only on `429` and `503`; on other 5xx (`500`, `502`, `504`) it is
  ignored and the backoff applies (PR #12 review).
- Structure: each attempt is `send` (HTTP exchange with timeout, body included)
  followed by classification into success, transient, rate-limited, or failure;
  a single `nextDelay` policy turns a retryable result plus the counters into a
  wait or a typed error. Submission reuses the same classification without the
  policy.
- `Retry-After` accepts delta-seconds or an HTTP date; invalid values fall back
  to backoff.
- Submission: single request, no loop. The caller passes `chaveDeEnvio`, sent
  as `Idempotency-Key`, and an empty key is rejected with a `ZodError` before
  any request; generating and persisting it is BACK-08.

### Timeout

Each attempt uses its own `AbortController` armed by `setTimeout(timeoutMs)`
(not `AbortSignal.timeout`, whose internal timer fake timers cannot control),
cleared when the answer arrives; an abort is classified as
a timeout. Rejected: one timeout for the whole retry sequence — it would let a
slow first attempt starve the retries. The default is 30 s because the ERP is
hosted on Render and its first call after idling can take long (cold start);
rejected: 10 s, which would turn every cold start into a retry or a failure.

### Validation

Inputs (page, size 1–50, `atualizadoDesde`, order payload per the ERP schema)
are validated with Zod before any request. Responses are parsed with Zod
(`safeParse`); failures log only the issue paths, never values.

### Logging and redaction

The client logs `{ method, path, status, attempt }` at `warn` for retries and
failures. Headers and bodies are never logged. A refusal adds only the names
of the fields in error (`erros[].campo`), never the ERP `detail` or field
messages, which may carry customer data. `createLogger` redact paths gain
`apiKey`, `ERP_API_KEY`, and `headers["x-api-key"]` as defense in depth.

### Naming

Operation, error, and money helper names stay in Portuguese
(`listClientes`, `ErpRecusouError`, `centavosParaReais`) as requested by the
task, because they mirror ERP domain terms and RN identifiers. Comments, test
names, and documentation remain in English per `AGENTS.md`.

### Money helpers

`src/shared/money.ts` takes integer cents in both helpers to keep floats out of
the source; `formatarReais` uses a cached `Intl.NumberFormat("pt-BR", BRL)`.

## Risks / Trade-offs

- [Retry-After waits hold a sync job for up to 3 × 60 s] → bounded by the
  waits counter and the 60 s cap; synchronizers run outside request handling.
- [ERP usage limit] → measured on 2026-11-27 with one real read: the ERP
  answers `RateLimit-Limit: 20`, `RateLimit-Remaining: 19`, and
  `RateLimit-Reset: 31`, so the key allows 20 requests per window of at most
  60 s. The 60 s `Retry-After` cap fits that window. A full sync of 120
  customers and 60 products at size 50 takes 5 requests plus the receivables
  pages, well under the limit; synchronizers should still read pages
  sequentially.
- [A malformed ERP answer is reported as `ErpIndisponivelError`] → the task
  lists three typed errors, so there is no separate invalid-response error; the
  log records the validation failure, and synchronizers treat both cases as
  "try again later".
- [Reads retried after an ambiguous timeout] → reads are idempotent; submission
  never retries.
- [Required ERP variables break existing local `.env` files and the container
  smoke test] → `.env.example`, Compose, `tests/setup-env.ts`, and
  `scripts/test-container.mjs` provide values; README tells developers to ask
  the PM for the key.
- [Renaming the Compose database leaves old volumes with `node_boilerplate`] →
  documented in the change summary; recreate the local volume.
- [Refusals reach clients with the fixed English detail
  `The ERP refused the request.`] → US-007 asks the salesperson to see the
  refusal reason in Portuguese. `ErpRecusouError` keeps `erpDetail` and
  `erros` for server code; BACK-08 owns translating them for the user.

## Migration Plan

No database migration. Deploy with `ERP_API_URL` and `ERP_API_KEY` set; rollback
is reverting the commit, as nothing persists ERP data yet.

## ADR

Re-evaluated in Consolidation: making `src/shared/erp` the single ERP entry
point that every future module depends on changes a durable system boundary and
affects more than one feature, so it is recorded in
`docs/adr/0001-erp-access-through-a-single-shared-client.md`. Timeout, backoff,
and `Retry-After` limits stay local, reversible decisions recorded only here.
