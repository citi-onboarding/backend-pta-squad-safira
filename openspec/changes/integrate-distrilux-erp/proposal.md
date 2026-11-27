## Why

The DistriLux order portal depends on the DistriLux ERP for customers, products,
receivables, and order submission, but the backend has no way to talk to it yet.
Upcoming synchronizers and the order submission flow (BACK-08) need one safe,
resilient, typed entry point to the ERP so that no other code handles HTTP, the
ERP key never leaves the server (RN-14), and temporary ERP limits never lose or
duplicate work (RN-15).

## What Changes

- Add a server-side ERP client that is the only place in the codebase that calls
  the ERP. It exposes typed operations: `listClientes`, `listProdutos`,
  `listTitulos` (each with page and an "updated since" filter), `getCliente`,
  `criarPedido(payload, chaveDeEnvio)`, and `consultarPedido`.
- Every ERP call has a timeout. Reads retry with growing backoff on 5xx,
  timeouts, and network failures (3 attempts) and honor `Retry-After` on `429`
  and `503`, resuming the same request; on other 5xx it is ignored.
- Order submission is attempted exactly once, always with an `Idempotency-Key`;
  retry policy for submission belongs to BACK-08 (RN-07).
- Every ERP response is validated; a malformed response becomes an error, never
  data.
- Three typed failures — `ErpIndisponivelError`, `ErpLimiteDeUsoError`, and
  `ErpRecusouError` — reach clients as RFC 9457 Problem Details through the
  existing error handler; a refusal never returns the ERP text to clients.
- Add money helpers that convert ERP integer cents to reais and format them in
  Brazilian Real (RN-13).
- Require `ERP_API_URL` and `ERP_API_KEY` in the validated environment; the
  example file lists them without values.
- Inject the ERP client into the application composition.
- Housekeeping without behavior change: rename the local database from
  `node_boilerplate` in Compose and the example environment, replace the README
  template title and text, and describe the DistriLux domain in
  `openspec/config.yaml` context.

## Capabilities

### New Capabilities

- `erp-integration`: how the portal reads ERP data and submits orders — key
  confidentiality, timeouts, retries, rate-limit handling, response validation,
  and how ERP failures reach clients.
- `monetary-values`: conversion of ERP integer cents to reais and their
  Brazilian Real presentation.

### Modified Capabilities

None. `backend-foundation` requirements are unchanged; the new required
environment variables are covered by `erp-integration`.

## Impact

- **Business:** enables catalog, customer, and receivables synchronization and
  order submission without coupling each feature to ERP HTTP details. ERP
  outages and limits degrade gracefully instead of crashing the server or
  duplicating work.
- **Security:** the ERP key is read only from the server environment, sent only
  in the `X-Api-Key` header, and never logged or returned in a response.
  Logger redaction gains the key paths as defense in depth.
- **API:** no new route. Any route that later uses the client returns Problem
  Details `503` (with `retryAfterSeconds` when known) for unavailability and
  rate limits, and `404`, `409`, or `422` when the ERP refuses a request.
  `openapi.json` is unchanged.
- **Database migration:** none. Only the local database name changes in
  Compose and `.env.example`; existing local volumes keep the old database and
  must be recreated.
- **Observability:** retries and ERP failures are logged with method, path,
  status, and attempt — never headers, bodies, or the key.
- **Configuration:** `ERP_API_URL` and `ERP_API_KEY` become required at startup;
  local `.env` files, Compose, the container smoke test, and the test setup must
  provide them.
- **Documentation:** README and OpenSpec context describe the DistriLux portal.
- **Dependencies:** none added. Tests fake the ERP with an injected `fetch`.

### In scope

- `src/shared/erp/` client, schemas, errors, and tests.
- `src/shared/money.ts` and tests.
- Environment, example environment, Compose, test setup, and container smoke
  test configuration.
- Application composition wiring and server bootstrap.
- README, OpenSpec context.

### Out of scope

- Synchronizers for customers, products, and receivables, and local persistence
  of ERP data.
- Order submission use case, idempotency storage, and retry policy (BACK-08,
  RN-07).
- `GET /v1/pedidos` listing and `GET /v1/produtos/{codigo}`; not needed yet.
- Circuit breaker, caching, or rate-limit budgeting across requests.
- Renaming `node_boilerplate` outside Compose and `.env.example` (CI,
  `prisma.config.ts`, test setup database URL, container smoke test, Problem
  type URL).
