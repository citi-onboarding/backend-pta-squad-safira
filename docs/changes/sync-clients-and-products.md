---
change_id: sync-clients-and-products
date: 2026-11-27
status: in-progress
owners: [Luana Allatta Guerra]
tags: [erp, sync, back-03]
related_adrs: []
openspec_change: openspec/changes/sync-clients-and-products/
---

# Client and product synchronization with the ERP (BACK-03)

## Objective

Keep the portal's clients and products at most one hour behind the DistriLux ERP, so BACK-05, FRONT-03, BACK-06, and IA-02 work with real data (PRD 7.2).

## Change made

- New `src/modules/sync/`:
  - `sync.service.ts`: `SyncService` runs clients and then products through the shared ERP client (BACK-02), page by page, 50 items per page; writes only new or changed items; makes items missing from a full load inactive; synchronizes one client on demand; and computes the status.
  - `sync.repository.ts`: `PrismaSyncRepository` writes each page in one transaction by upsert on `codigoErp`, takes the lock (a transaction-level Postgres advisory lock around the check of `EM_ANDAMENTO` rows), closes runs left in progress for more than 30 minutes, and records each run in `RegistroSincronizacao`.
  - `sync.schedule.ts`: runs at once and then every interval; a failed run is logged and the next interval retries.
  - `sync.router.ts`, `sync.schemas.ts`, `sync.openapi.ts`: `GET /sync/status` and `POST /sync/clientes/:codigo`.
- `src/app/create-app.ts` mounts `/sync` and starts the schedule only when it receives `syncSchedule`; `src/server.ts` passes one hour and stops the schedule on shutdown.
- `scripts/generate-openapi.ts` and `scripts/check-openapi.ts` include the sync routes; `openapi.json` is regenerated.
- The test doubles (simulated ERP and in-memory repository) live in `tests/sync/sync-test-doubles.ts`, outside the production build.
- The branch is BACK-01 with `develop` merged in; the merge kept both sides of every conflict and passes the ERP settings and an ERP client double to the BACK-01 tests.

## Resulting behavior

- On start and then every hour, the portal reads clients and products from the ERP: everything on the first run, and only what changed since the start of the last successful run afterwards.
- Running twice keeps the same rows; unchanged rows are not rewritten. A client or product missing from a full load becomes inactive and is never deleted. Client status and product active flag follow the ERP.
- When the ERP is down or its usage limit persists, the run of that type is recorded as `FALHA` with a safe detail, the data already in the portal stays, and the next hourly run starts from the same point. On a `429`, the ERP client waits and the run completes without losing or duplicating rows.
- Two runs never overlap, even across processes.
- `GET /sync/status` (any signed-in user) answers `{ ultimaSincronizacaoOk, ultimoResultado }`; `POST /sync/clientes/:codigo` (administrators) synchronizes one client and answers 200, 404 when the ERP no longer has it (and the client becomes inactive), 409 during a run, or 503 when the ERP is down.

## Impact

- API: two new routes, published in `openapi.json`.
- Database and migrations: none; uses `Cliente`, `Produto`, and `RegistroSincronizacao` from DATA-01. The number of changed items is stored in `RegistroSincronizacao.relatorio`.
- Security: the ERP key stays in the ERP client; run details hold only the error name and status. Only administrators trigger an on-demand sync.
- Dependencies: BACK-01 (pull request #13) for authentication; this branch must be rebased when it merges.

## Validations executed

Run on 2026-11-27 on branch `feat/clientProductSync`:

- `pnpm exec vitest run src/modules/sync` (unit and route tests): 28 tests passed, plus 2 schedule tests.
- `pnpm test:integration`: 4 files, 26 tests passed (9 for the sync with PostgreSQL: full load, second run with the same rows, deactivation, run record, simultaneous runs, abandoned run, failed page, and on-demand deactivation).
- `pnpm format:check`: passed.
- `pnpm verify` (typecheck, lint, tests, `openapi:check`, `openspec validate --all --strict`, skills check): passed; 297 tests.
- `pnpm test:coverage`: passed (threshold on `src/shared`).
- `pnpm build`: passed; the production build has no test doubles.
- `openspec validate sync-clients-and-products --strict`: valid.

## Related artifacts

- Proposal: `openspec/changes/sync-clients-and-products/proposal.md`
- Specification: `openspec/changes/sync-clients-and-products/specs/erp-synchronization/spec.md`
- Design: `openspec/changes/sync-clients-and-products/design.md`
- Tasks: `openspec/changes/sync-clients-and-products/tasks.md`
- ADR: Not applicable. The decisions are local to the `sync` module and reversible.

## Usage

- The schedule starts with the API (`pnpm dev` or the container); no command is needed.
- The web reads `GET /sync/status` for the bar "Sincronizado com o ERP em...".
- An administrator calls `POST /sync/clientes/{codigo}` to refresh one client at once.

## Implementation notes

- The incremental start is the start of the last successful run, as the task says; the DATA-01 schema comment suggests the largest `atualizadoNoErpEm` instead (to confirm with the squad manager).
- Items missing from the ERP are detected only in a full load (the first run).
- A run left `EM_ANDAMENTO` for more than 30 minutes is treated as abandoned.
