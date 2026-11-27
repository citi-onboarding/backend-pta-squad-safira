# Proposal: Synchronize clients and products from the ERP

## Why

The portal has no clients and no product catalog until it copies them from the DistriLux ERP. BACK-05 (client API), FRONT-03 (client screen), BACK-06 (order product search), and IA-02 (the agent) are blocked until clients and products are kept up to date in the portal database (PRD 7.2: ERP to portal at least every hour and on demand per client).

## What changes

- Add the `sync` module, which reads clients and products from the ERP through the shared ERP client (BACK-02) and writes them to the `Cliente` and `Produto` tables (DATA-01).
- The first run is a full load; later runs fetch only what changed since the start of the last successful run (RN-15), 50 items per page.
- Write by upsert on the ERP code, one transaction per page, so running twice gives the same rows; a client or product missing from a full load becomes inactive and is never deleted. The client status (Ativo, Bloqueado, Inativo) and the product active flag are kept as the ERP sends them (RN-02, RN-04, RN-09).
- Run automatically at most every hour, with a database lock so that two runs never overlap. When the ERP is down or its usage limit persists, the run fails, the data already in the portal stays available, the failure is recorded, and the next hourly run retries.
- Record each run in `RegistroSincronizacao`, one row for clients and one for products: type, start, end, result, items read, errors, and a safe error detail; the number of changed items goes in the row's report.
- Add `GET /sync/status`, `{ ultimaSincronizacaoOk, ultimoResultado }`, for the web bar "Sincronizado com o ERP em...", and `POST /sync/clientes/:codigo` for an administrator to synchronize one client on demand.

## Impact

- Business: clients and products reach the portal and stay at most one hour behind the ERP.
- API: two new routes, published in `openapi.json`. `GET /sync/status` requires a session; `POST /sync/clientes/:codigo` requires the Administrator role. Both rely on the BACK-01 authentication (pull request #13, not merged yet).
- Database and migrations: none; the change uses `Cliente`, `Produto`, and `RegistroSincronizacao` as merged in DATA-01.
- Security: the ERP key stays in the shared ERP client; error details recorded or returned never contain it. Only administrators trigger an on-demand sync.
- Observability: every scheduled run leaves a `RegistroSincronizacao` row per type; logs carry counts and durations only.
- Documentation: change summary in `docs/changes/`.

## In scope

- The `sync` module (service, repository, routes), the hourly schedule with its lock, the two routes, and unit and integration tests.

## Non-goals

- Receivables synchronization and the full run report (BACK-04).
- Any web screen (FRONT-03 shows the status bar).
- Schema changes.

## Decisions taken with the developer

1. The incremental filter starts at the start time of the last successful run of the same type, as the task note says. The DATA-01 schema comment suggests the largest `atualizadoNoErpEm` instead; this difference is reported to the squad manager.
2. No migration: changed items go in the run's `relatorio`, errors in `erros` and `detalhe`; BACK-04 completes the report.
3. Missing items are detected only in a full load (the first run).
4. `GET /sync/status` for any signed-in user; `POST /sync/clientes/:codigo` for administrators only.
5. The branch is based on BACK-01 with `develop` merged in, because the routes need the BACK-01 authentication and the sync needs the BACK-02 ERP client.
6. An on-demand client sync writes no `RegistroSincronizacao` row, so it never moves the incremental start; a client the ERP no longer has becomes inactive.
7. `ultimaSincronizacaoOk` is the older of the last successful client and product runs; `ultimoResultado` is the worse of their latest results.
8. File names follow the task tree (`sync.service.ts`); the routes add `sync.router.ts`, `sync.schemas.ts`, and `sync.openapi.ts`, like the other modules.
