# Design: Synchronize clients and products from the ERP

See `proposal.md` for the motivation and the decisions taken with the developer, and `specs/erp-synchronization/spec.md` for the behavior.

## Context

- DATA-01 (merged) provides `Cliente` and `Produto` with a unique `codigoErp` and an `atualizadoNoErpEm` column, and `RegistroSincronizacao` with `tipo`, `iniciouEm`, `terminouEm`, `resultado`, `itensLidos`, `erros`, `pendencias`, `detalhe`, and `relatorio`.
- BACK-02 (merged) provides `ErpClient` in `src/shared/erp`: `listClientes` and `listProdutos` with `pagina`, `tamanho` (up to 50), and `atualizadoDesde`; `getCliente(codigo)`; it already retries reads on 5xx and timeouts and waits on `429` (up to three waits of at most 60 seconds), then throws `ErpIndisponivelError` or `ErpLimiteDeUsoError`. A refusal such as `404` throws `ErpRecusouError` with `erpStatus`.
- BACK-01 (pull request #13) provides `createAuthenticate` and `requireRole`. This branch is BACK-01 with `develop` merged in.

## Decisions

### Module layout

- `src/modules/sync/sync.service.ts`: `SyncService` orchestrates a run (clients, then products), the on-demand client sync, and the status. It receives the ERP client, the repository, and a clock, so it is tested without HTTP or a database.
- `src/modules/sync/sync.repository.ts`: `PrismaSyncRepository` reads existing rows by code, writes a page in one transaction, marks missing items inactive, manages the run rows and the lock, and reads the status.
- `src/modules/sync/sync.router.ts`, `sync.schemas.ts`, `sync.openapi.ts`: the two routes, their Zod schemas, and their OpenAPI registration, like the `auth` and `users` modules.
- `src/modules/sync/sync.schedule.ts`: starts a run at once and then every hour, and returns a `stop` function.
- The module imports only `src/shared` (ERP client, HTTP helpers, database type), never another module.
- `src/modules/sync/sync-test-doubles.ts` holds the simulated ERP and the in-memory repository for the tests. It stays in `src/` because the Docker build type-checks only `src/`, and `tsconfig.build.json` excludes `*-test-doubles.ts` from the production build.

### Mapping

| ERP field               | Cliente                 | ERP field             | Produto               |
| ----------------------- | ----------------------- | --------------------- | --------------------- |
| `codigo`                | `codigoErp`             | `codigo`              | `codigoErp`           |
| `razaoSocial`           | `razaoSocial`           | `descricao`           | `descricao`           |
| `cnpj`                  | `cnpj`                  | `categoria`           | `categoria`           |
| `cidade`, `uf`          | `cidade`, `uf`          | `unidade`             | `unidade`             |
| `segmento`              | `segmento`              | `precoTabelaCentavos` | `precoTabelaCentavos` |
| `vendedor`              | `codigoVendedor`        | `ativo`               | `ativo`               |
| `limiteCreditoCentavos` | `limiteCreditoCentavos` | `atualizadoEm`        | `atualizadoNoErpEm`   |
| `status`                | `status`                |                       |                       |
| `atualizadoEm`          | `atualizadoNoErpEm`     |                       |                       |

`dataCadastro` has no column and is not stored.

### Writing

- For each page, the service loads the existing rows for the page's codes, compares every mapped field, and writes only new or changed items, by upsert on `codigoErp`, in one transaction per page. Unchanged rows are not rewritten, so the second run of the same data reports 0 changed items and keeps `atualizadoEm`.
- When a page's transaction fails, the service writes its items one by one; an item that still fails (for example, a CNPJ already used by another client) is skipped and recorded as `{ codigo, motivo }` in the report, where the reason is the error name and, for Prisma, its code. The run ends `PARCIAL`, which moves the incremental start like `SUCESSO`; otherwise one bad item would block every later change forever.
- A full load (no successful run of the type yet) collects every code it read; at the end it sets `INATIVO` (clients) or `ativo = false` (products) on rows whose code was not read, but only when it read at least one item, the number of distinct codes equals the ERP's `total`, and that total did not change between pages. The ERP's ordering is not documented, so items moving between pages, or an empty answer, must never make existing items inactive; in those cases the run is `FALHA` and the next one repeats the full load. Nothing is deleted.

### Incremental start

The start of the last `SUCESSO` row of the same type (`iniciouEm`) is the `atualizadoDesde` of the next run. Using the start, not the end, means an item changed while a run was reading is fetched again next time; the upsert makes the repeat harmless.

### Lock and run rows

- A run acquires the lock in one short transaction that takes a Postgres transaction-level advisory lock (`pg_advisory_xact_lock`), checks that no `EM_ANDAMENTO` row newer than 30 minutes exists, and inserts the two `EM_ANDAMENTO` rows (clients and products). The advisory lock makes the check-and-insert atomic across processes; the `EM_ANDAMENTO` rows are the lock while the run lasts and record its start. A run that finds the lock taken returns without reading the ERP.
- When a type finishes, its row gets `terminouEm`, `SUCESSO` or `FALHA`, `itensLidos`, `erros` (0 or 1), a safe `detalhe` (the error class and status, never the key or a body), and `relatorio = { itensAlterados }`.
- An `EM_ANDAMENTO` row older than 30 minutes is considered left behind by a crashed process: the next run marks it `FALHA` with that reason and proceeds. A full load is about five pages, far below 30 minutes even with the ERP client's waits.
- The on-demand client sync checks for a recent `EM_ANDAMENTO` row before reading the ERP, and writes (or makes inactive) under the same advisory lock after checking again, so a scheduled run that started meanwhile wins and the on-demand sync answers 409; it writes no run row.
- The advisory lock is taken with Prisma's tagged `$executeRaw`, not the unsafe variant.
- Known limit: a real run longer than 30 minutes would be taken as abandoned and could overlap with the next one. A full load is about five requests; even with the ERP client's waits (three retries and three usage-limit waits of at most 60 seconds per request) it stays well under 30 minutes.

### Failure handling

- `ErpIndisponivelError` and `ErpLimiteDeUsoError` stop the type's run: its row becomes `FALHA`; pages already written stay; the incremental start does not move. Products still run after a client failure, and vice versa, so one type does not block the other.
- No extra retry: the next hourly run is the retry.
- Each type runs in its own guard: a failure while recording one type's result is logged and does not stop the other type.
- Each finished type is logged at info (`SUCESSO`) or warn (`PARCIAL`, `FALHA`) with type, result, items read and changed, duration, and the safe detail.

### Schedule

`createApp` accepts an optional `syncSchedule` (`{ intervalMs }`). When present, it starts the schedule and exposes its `stop` on `app.locals` (typed through Express's `Locals` interface); `stop` clears the timers and returns a promise that settles when the run in progress ends. `server.ts` passes one hour and awaits `stop` before closing the database. Tests do not pass it, so no timer runs in tests.

### Routes

- `GET /sync/status`: `authenticate`; response validated by a Zod schema; `ultimaSincronizacaoOk` as an ISO date-time or `null`.
- `POST /sync/clientes/:codigo`: `authenticate` and `requireRole("ADMINISTRADOR")`; the code is validated by Zod (400); ERP errors reach the client through the existing Problem Details mapping (`ErpIndisponivelError` and `ErpLimiteDeUsoError` → 503, other `ErpRecusouError` → 422 or 409); an `ErpRecusouError` with `erpStatus` 404 marks the client inactive and answers 404. Every status is documented in `openapi.json`.

## Rejected alternatives

- Session-level advisory lock held for the whole run: Prisma's connection pool does not guarantee the same connection for the unlock, so the lock could leak.
- In-memory flag: does not protect against a second API process.
- One transaction for the whole run: a failure on the last page would undo everything and the portal would keep older data than necessary.
- Largest `atualizadoNoErpEm` as the incremental start: suggested by the DATA-01 schema comment, but the task names the start of the last successful run (proposal, decision 1).

## Risks

- [Portal and ERP clocks differ] → the incremental start comes from the portal clock; a large difference could skip changes. Reported to the squad manager with decision 1.
- [Two ERP clients share a CNPJ] → the unique CNPJ makes that page's transaction fail; the run is recorded as `FALHA` with the reason, and the data stays as it was.
- [BACK-01 changes before merge] → this branch merges `develop` and BACK-01; it is rebased when BACK-01 merges.

## ADR

[ADR-0003](../../../docs/adr/0003-in-process-erp-sync-schedule-with-database-lock.md): the hourly schedule runs inside the API process, and runs are kept from overlapping by a Postgres advisory lock plus `EM_ANDAMENTO` rows. BACK-04 will reuse it.
