---
change_id: integrate-distrilux-erp
date: 2026-11-25
status: in-progress
owners: []
tags: [erp, integration, security, money, configuration]
related_adrs: [ADR-0001]
openspec_change: openspec/changes/integrate-distrilux-erp/
---

# Integrate the DistriLux ERP

## Objective

Give the portal one safe, resilient, typed way to read customers, products,
receivables, and orders from the DistriLux ERP and to submit orders, so that
synchronizers and order submission (BACK-08) can use the ERP without knowing
HTTP, the key never leaves the server (RN-14), and ERP limits never lose or
duplicate work (RN-15). Task: BACK-02.

## Change made

- `src/shared/erp/erp-client.service.ts`: `ErpClient` interface,
  `createErpClient` factory, and the errors `ErpIndisponivelError`,
  `ErpLimiteDeUsoError`, and `ErpRecusouError`, all extending `HttpProblem`.
  Operations: `listClientes`, `listProdutos`, `listTitulos` (page, size 1–50,
  `atualizadoDesde`), `getCliente`, `criarPedido(payload, chaveDeEnvio)`, and
  `consultarPedido`.
- `src/shared/erp/erp-client.schemas.ts`: Zod schemas and types mirroring ERP
  API v3.3.0 for records, pages, page queries, order payloads, and ERP problems.
- `src/shared/money.ts`: `centavosParaReais` and `formatarReais` (pt-BR, BRL).
- `ERP_API_URL` and `ERP_API_KEY` are required in `src/shared/config/env.ts`
  and listed without values in `.env.example`; Compose passes them through,
  and the test setup and container smoke test provide placeholders.
- `createApp` receives `erpClient`; `src/server.ts` builds the real client.
- Logger redaction also covers `apiKey`, `ERP_API_KEY`, and
  `headers["x-api-key"]`.
- Housekeeping: the Compose and `.env.example` database is now
  `distrilux_portal`; README title and template text describe the DistriLux
  portal; `openspec/config.yaml` context describes the DistriLux domain.

Implementation detail beyond the spec: each attempt is one `send` (HTTP
exchange with its own `AbortController` timer, body included) followed by a
classification into success, transient, rate-limited, or failure; a single
`nextDelay` policy turns retryable results into a wait or a typed error.

## Resulting behavior

- Every ERP request carries the key in `X-Api-Key`; the key never appears in
  logs, error messages, serialized errors, or client responses.
- The server refuses to start without an absolute `ERP_API_URL` and a non-empty
  `ERP_API_KEY`.
- Paginated reads send `pagina`, `tamanho`, and `atualizadoDesde` and return the
  validated items with pagination metadata; a size outside 1–50 fails before any
  request.
- Every request is aborted after 30 seconds by default; slower cold starts up
  to that limit are kept.
- Reads retry on `5xx`, timeouts, and network errors up to 3 attempts with
  500 ms and 1 000 ms backoff, using `Retry-After` of a `503` when present and
  ignoring it on other 5xx (`500`, `502`, `504`); after 3 failures they throw
  `ErpIndisponivelError`.
- On `429`, reads wait `Retry-After` (seconds or HTTP date) and repeat the same
  request, up to 3 waits; then, or when the delay exceeds 60 seconds, they throw
  `ErpLimiteDeUsoError`. A `503` delay above 60 seconds throws
  `ErpIndisponivelError` immediately. Rate-limit waits do not spend the 5xx
  attempts.
- `criarPedido` sends exactly one `POST /v1/pedidos` with `Idempotency-Key` and
  never retries; invalid payloads and an empty submission key fail with a
  `ZodError` before any request.
- ERP `400`/`404`/`409`/`422` become `ErpRecusouError` carrying the ERP status,
  detail (`erpDetail`), and field errors (`erros`) for server code only; the
  log records the status and field names, and the client response has the
  fixed detail `The ERP refused the request.` without ERP text.
  `401`/`403` become `ErpIndisponivelError`.
- Malformed or non-JSON successful answers become `ErpIndisponivelError`;
  bad data is never returned.
- Clients receive Problem Details `503` (with `retryAfterSeconds` when known)
  for unavailability and usage limits, and `404`, `409`, or `422` for refusals;
  the server keeps serving other requests.
- `formatarReais(123456789)` returns `R$ 1.234.567,89`; non-integer cents throw
  `RangeError`.

## Impact

- **API:** no new route; `openapi.json` is unchanged. Future routes using the
  client inherit the Problem Details mapping above.
- **Configuration (breaking for local setups):** `ERP_API_URL` and
  `ERP_API_KEY` are now required. Every `.env`, CI secret store, and deployment
  must set them; the CI workflow does not start the server, so it is not
  affected.
- **Local database:** developers using the Compose PostgreSQL must change
  `DATABASE_URL` to `distrilux_portal` and recreate the volume
  (`docker compose down -v`). Hosted databases (for example Neon) are not
  affected.
- **Security:** RN-14 is enforced in one place and covered by tests; logger
  redaction gained ERP key paths.
- **Architecture:** `src/shared/erp` is the single ERP entry point for all
  modules (ADR-0001).
- **Database migration:** none.
- **Dependencies:** none added.

## Validations executed

Red evidence (before production code), with signature-only skeletons that throw
`Not implemented`:

- `pnpm exec vitest run src/shared/money.test.ts` → `Tests 5 failed (5)`
  (`expected error to be instance of RangeError`).
- `pnpm exec vitest run src/shared/erp/erp-client.test.ts` →
  `Tests 40 failed (40)` (`expected Error: Not implemented to be an instance of
ErpIndisponivelError`, `expected error to be instance of ZodError`, …).
- `pnpm exec vitest run src/shared/config/env.test.ts` →
  `Tests 4 failed | 3 passed (7)`.
- `pnpm exec tsc --noEmit` → `'erpClient' does not exist in type
'CreateAppOptions'` in `src/app/create-app.test.ts`.
- Logger redaction test against the original `logger.ts` →
  `Tests 1 failed | 1 passed (2)`.

Green and Refactor evidence: `pnpm exec vitest run src/shared src/app` →
`Test Files 10 passed (10)`, `Tests 70 passed (70)`; `pnpm typecheck` and
`pnpm lint` without errors.

Consolidation:

- `pnpm format:check` → `All matched files use Prettier code style!`
- `pnpm verify` → exit code 0: typecheck, lint, `Test Files 13 passed (13)` /
  `Tests 94 passed (94)`, architecture `Tests 3 passed (3)`,
  `openspec validate --all --strict` `Totals: 2 passed, 0 failed`,
  `openapi:check` passed, `skills:check` passed.
- `pnpm test:coverage` → `Tests 94 passed (94)`; all files 99.42 % statements,
  92.85 % branches, 100 % functions, 100 % lines (`shared/erp` 91.13 % branches).
- `pnpm build` → exit code 0.
- `pnpm test:integration` → exit code 0 with `No test files found`; the
  repository has no integration tests yet and this change adds none (no
  database behavior changed).
- `pnpm test:container` → `Production container smoke test passed.`
- `openspec validate integrate-distrilux-erp --strict` →
  `Change 'integrate-distrilux-erp' is valid`.

PR #12 review fixes (2026-11-27), one cycle per point after updating the spec:

- `Retry-After` only on `429`/`503` — Red:
  `vitest run src/shared/erp/erp-client.test.ts -t "ignores Retry-After on a 502"`
  → `expected "vi.fn()" to be called 2 times, but got 1 times`. Green and
  Refactor: `Tests 42 passed (42)`.
- Refusal without ERP text — Red: 3 failed (error `message`/`extensions`, log
  without `itens.0.produto`, `409` response `detail`). Green and Refactor:
  `Tests 43 passed (43)`.
- Rate-limit waits not spending 5xx attempts — spec scenario only; the existing
  test "does not spend 5xx attempts while waiting for a rate limit" covers it.
- Empty submission key — Red: `expected error to be instance of ZodError`
  (received `ErpIndisponivelError`). Green and Refactor: `Tests 44 passed (44)`.
- `pnpm verify` → exit code 0: `Test Files 13 passed (13)` /
  `Tests 97 passed (97)`, architecture `Tests 3 passed (3)`,
  `Totals: 2 passed, 0 failed`, `openapi:check` and `skills:check` passed.
- `pnpm test:coverage` → `Tests 97 passed (97)`; all files 99.44 % statements,
  93.75 % branches, 100 % functions, 100 % lines (`shared/erp` 92.2 % branches).
- `pnpm build` → exit code 0. `pnpm test:container` not re-run: runtime
  delivery did not change.

## Related artifacts

- Proposal: `openspec/changes/integrate-distrilux-erp/proposal.md`
- Specs: `openspec/changes/integrate-distrilux-erp/specs/erp-integration/spec.md`,
  `openspec/changes/integrate-distrilux-erp/specs/monetary-values/spec.md`
- Design: `openspec/changes/integrate-distrilux-erp/design.md`
- Tasks: `openspec/changes/integrate-distrilux-erp/tasks.md`
- ADR: `docs/adr/0001-erp-access-through-a-single-shared-client.md`

## Usage

Set `ERP_API_URL` and `ERP_API_KEY` in `.env` (ask the Project Manager for the
key). Inside a module, receive the `ErpClient` through composition and call it:

```ts
const page = await erpClient.listClientes({
  pagina: 1,
  tamanho: 50,
  atualizadoDesde: "2026-11-01T00:00:00-03:00",
});
const pedido = await erpClient.criarPedido(
  { cliente: "C0001", itens: [{ produto: "P00001", quantidade: 10 }] },
  chaveDeEnvio,
);
```

Let the typed errors propagate to reach clients as Problem Details, or catch
them to decide what a synchronizer does next.

## Implementation notes

- Names stay in Portuguese for ERP domain terms by explicit request; comments,
  tests, and documentation are in English.
- `ErpLimiteDeUsoError` maps to client status `503`, not `429`, so the browser
  does not read it as user throttling.
- Retry waits use `setTimeout`; a read can hold a synchronizer for up to
  3 × 60 seconds under rate limiting.
- `GET /v1/pedidos` listing and `GET /v1/produtos/{codigo}` are not wrapped yet.
- `node_boilerplate` remains in CI, `prisma.config.ts`, the test setup database
  URL, the container smoke test, and the Problem type URL in `problem.ts`; out
  of scope for this change.
- The OpenSpec change stays active until the pull request is approved; archiving
  is a separate step with its own confirmation.
