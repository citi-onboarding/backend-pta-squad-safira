---
change_id: sync-clients-and-products
date: 2026-11-27
status: in-progress
owners: [Luana Allatta Guerra]
tags: [erp, sync, back-03]
related_adrs: [ADR-0003]
openspec_change: openspec/changes/sync-clients-and-products/
---

# Client and product synchronization with the ERP (BACK-03)

## Objective

Keep the portal's clients and products up to date with the DistriLux ERP, normally within the next hourly run, so BACK-05, FRONT-03, BACK-06, and IA-02 work with real data (PRD 7.2).

## Change made

- New `src/modules/sync/`:
  - `sync.service.ts`: `SyncService` runs clients and then products through the shared ERP client (BACK-02), page by page, 50 items per page; writes only new or changed items; skips and records an item whose own data cannot be written (Prisma `P2002`, `P2000`, or `P2020`, such as a repeated CNPJ) and ends the run `PARCIAL`, while any other write failure ends it `FALHA`; makes items missing from a full load inactive only when the load is complete; synchronizes one client on demand under the lock; logs each finished type; and computes the status.
  - `sync.repository.ts`: `PrismaSyncRepository` writes each page in one transaction by upsert on `codigoErp`, takes the lock (a transaction-level Postgres advisory lock around the check of `EM_ANDAMENTO` rows, also used by the on-demand sync), closes runs left in progress for more than 30 minutes, and records each run in `RegistroSincronizacao` (changed and skipped items in `relatorio`).
  - `sync.schedule.ts`: runs at once and then every interval; a failed run is logged and the next interval retries; `stop` waits for the run in progress.
  - `sync.router.ts`, `sync.schemas.ts`, `sync.openapi.ts`: `GET /sync/status` and `POST /sync/clientes/:codigo`.
- `src/app/create-app.ts` mounts `/sync`, starts the schedule only when it receives `syncSchedule`, and exposes it through `syncScheduleOf(app)`; `src/server.ts` passes one hour and waits for the schedule to stop before closing the database.
- `scripts/generate-openapi.ts` and `scripts/check-openapi.ts` include the sync routes; `openapi.json` is regenerated.
- The test doubles (simulated ERP and in-memory repository) live in `src/modules/sync/sync-test-doubles.ts`, because the Docker build type-checks only `src/`; `tsconfig.build.json` excludes `*-test-doubles.ts` from the production build, as it already excludes `*.test.ts`.
- `scripts/test-container.mjs` passes `SESSION_SECRET`, required since BACK-01, so the production container can start.
- ADR-0003 records the in-process schedule with the database lock.
- The branch is BACK-01 with `develop` merged in; the merge kept both sides of every conflict and passes the ERP settings and an ERP client double to the BACK-01 tests.

## Resulting behavior

- On start and then every hour, the portal reads clients and products from the ERP: everything on the first run, and only what changed since the start of the last successful or partial run afterwards. A change made in the ERP normally appears within the next hourly run (about one hour plus the run's duration); after an ERP failure it appears in the first run after the ERP is back; a large clock difference between the portal and the ERP could skip a change.
- Running twice keeps the same rows; unchanged rows are not rewritten. A client or product missing from a full load becomes inactive and is never deleted. Client status and product active flag follow the ERP.
- When the ERP is down or its usage limit persists, the run of that type is recorded as `FALHA` with a safe detail, the data already in the portal stays, and the next hourly run starts from the same point. On a `429`, the ERP client waits and the run completes without losing or duplicating rows.
- An item that cannot be written (for example, two ERP clients with the same CNPJ) is skipped and recorded with its ERP code; every other item is written, the run is `PARCIAL`, and later changes keep arriving. A temporary database failure (no free connection, transaction timeout, write conflict) skips nothing: the run is `FALHA` and the next one asks for the same changes again.
- A full load that reads nothing, or whose total changes between pages, makes nothing inactive and is recorded as `FALHA`.
- A failure in one type never stops the other, and each finished type is logged with its result, counts, and duration.
- Two runs never overlap, even across processes.
- `GET /sync/status` (any signed-in user) answers `{ ultimaSincronizacaoOk, ultimoResultado }`; `POST /sync/clientes/:codigo` (administrators) synchronizes one client and answers 200, 400 for an invalid code, 404 when the ERP no longer has it (and the client becomes inactive), 409 during a run (also when a run starts while the ERP is being read), 422 when the ERP refuses, or 503 when the ERP is down or its usage limit was reached.

## Impact

- API: two new routes, published in `openapi.json`.
- Database and migrations: none; uses `Cliente`, `Produto`, and `RegistroSincronizacao` from DATA-01. The number of changed items is stored in `RegistroSincronizacao.relatorio`.
- Security: the ERP key stays in the ERP client; run details hold only the error name, code, and status. Only administrators trigger an on-demand sync.
- Dependencies: BACK-01 (pull request #13) for authentication; this branch must be rebased when it merges.

## Validations executed

Run on 2026-11-27 on branch `feat/clientProductSync`, after the review fixes:

- `pnpm exec vitest run src/modules/sync` (without the integration file): 3 files, 44 tests passed (service, routes, and schedule).
- `pnpm test:integration`: 4 files, 27 tests passed; 10 of them cover the sync with PostgreSQL (full load, second run with the same rows, deactivation, run record, simultaneous runs, recent and abandoned runs, a client with a repeated CNPJ skipped run after run, an on-demand write refused during a run, and on-demand deactivation).
- `pnpm format:check`: passed.
- `pnpm verify` (typecheck, lint, tests, `openapi:check`, `openspec validate --all --strict`, skills check): passed; 27 files, 313 tests; OpenSpec 6 passed, 0 failed.
- `pnpm test:coverage`: passed (threshold on `src/shared`: 99.57% statements, 94.35% branches).
- `pnpm build`: passed; `dist/` holds no test file or test double.
- `pnpm test:container`: passed ("Production container smoke test passed.") after adding `SESSION_SECRET` to the script.
- `openspec validate sync-clients-and-products --strict`: valid.

## Related artifacts

- Proposal: `openspec/changes/sync-clients-and-products/proposal.md`
- Specification: `openspec/changes/sync-clients-and-products/specs/erp-synchronization/spec.md`
- Design: `openspec/changes/sync-clients-and-products/design.md`
- Tasks: `openspec/changes/sync-clients-and-products/tasks.md`
- ADR: [ADR-0003](../adr/0003-in-process-erp-sync-schedule-with-database-lock.md), in-process schedule with a database lock (proposed).

## Usage

- The schedule starts with the API (`pnpm dev` or the container); no command is needed.
- The web reads `GET /sync/status` for the bar "Sincronizado com o ERP em...".
- An administrator calls `POST /sync/clientes/{codigo}` to refresh one client at once.

## Implementation notes

- The incremental start is the start of the last successful run, as the task says; the DATA-01 schema comment suggests the largest `atualizadoNoErpEm` instead (to confirm with the squad manager).
- Items missing from the ERP are detected only in a full load (the first run).
- A run left `EM_ANDAMENTO` for more than 30 minutes is treated as abandoned; a real run longer than that could overlap with the next one (ADR-0003, Negative).
- The DATA-01 schema comment on `atualizadoNoErpEm` still describes the other incremental start; it is a DATA-01 file and stays as it is until the squad manager decides.
