# Proposal: Synchronize clients and products from the ERP

## Why

The portal has no clients and no product catalog until it copies them from the DistriLux ERP. BACK-05 (client API), FRONT-03 (client screen), BACK-06 (order product search), and IA-02 (the agent) are blocked until clients and products are kept up to date in the portal database (PRD 7.2: ERP to portal at least every hour and on demand per client).

## What changes

- Add the `sync` module, which reads clients and products from the ERP through the shared ERP client (BACK-02) and writes them to the `Cliente` and `Produto` tables (DATA-01).
- The first run is a full load; later runs fetch only what changed since 5 minutes before the start of the last `SUCESSO` run (RN-15), 50 items per page.
- Write by upsert on the ERP code, one transaction per page, so running twice gives the same rows; a client or product missing from a full load becomes inactive and is never deleted. The client status (Ativo, Bloqueado, Inativo) and the product active flag are kept as the ERP sends them (RN-02, RN-04, RN-09).
- Run automatically at most every hour, with a database lock so that two runs never overlap. When the ERP is down or its usage limit persists, the run fails, the data already in the portal stays available, the failure is recorded, and the next hourly run retries.
- Record each run in `RegistroSincronizacao`, one row for clients and one for products: type, start, end, result, items read, errors, and a safe error detail; skipped items go in the row's report. The number of changed items and the complete report belong to BACK-04.
- Add `GET /sync/status`, `{ ultimaSincronizacaoOk, ultimoResultado }`, for the web bar "Sincronizado com o ERP em...", and `POST /sync/clientes/:codigo` for an administrator to synchronize one client on demand.

## Impact

- Business: clients and products reach the portal. A change made in the ERP normally appears within the next hourly run (at most about one hour plus the run's duration). After an ERP failure, it appears in the first run after the ERP is back (the next hour), and a large clock difference between the portal and the ERP could skip a change (design, Risks).
- API: two new routes, published in `openapi.json`. `GET /sync/status` requires a session; `POST /sync/clientes/:codigo` requires the Administrator role. Both rely on the BACK-01 authentication (pull request #13, not merged yet).
- Database and migrations: none; the change uses `Cliente`, `Produto`, and `RegistroSincronizacao` as merged in DATA-01.
- Security: the ERP key stays in the shared ERP client; error details recorded or returned never contain it. Only administrators trigger an on-demand sync.
- Observability: every scheduled run leaves a `RegistroSincronizacao` row per type and one log line per type with the result, counts, duration, and a safe detail.
- Documentation: change summary in `docs/changes/`.

## In scope

- The `sync` module (service, repository, routes), the hourly schedule with its lock, the two routes, and unit and integration tests.

## Non-goals

- Receivables synchronization and the full run report (BACK-04).
- Any web screen (FRONT-03 shows the status bar).
- Schema changes.

## Decisions taken with the developer

1. The incremental filter starts 5 minutes before the start time of the last `SUCESSO` run of the same type; `PARCIAL` and `FALHA` runs do not move it, and without a `SUCESSO` run the run is a full load (squad manager's decision). The largest `atualizadoNoErpEm` is not used, because a run stopped midway would skip items; the DATA-01 schema comment that suggested it is corrected, at the squad manager's request.
2. No migration: the run records type, start, end, result, items read, and the error in `detalhe`; skipped items go in `relatorio`. Changed items and the complete report belong to BACK-04 (squad manager's decision).
3. Missing items are detected only in a full load (the first run).
4. `GET /sync/status` for any signed-in user; `POST /sync/clientes/:codigo` for administrators only.
5. The branch is based on BACK-01 with `develop` merged in, because the routes need the BACK-01 authentication and the sync needs the BACK-02 ERP client.
6. An on-demand client sync writes no `RegistroSincronizacao` row, so it never moves the incremental start; a client the ERP no longer has becomes inactive.
7. `ultimaSincronizacaoOk` is the older of the last `SUCESSO` client and product runs (a `PARCIAL` run does not count); `ultimoResultado` is the worse of their latest results.
8. An item that cannot be written because of its own data (a repeated unique value, a text too long, or a number out of range) is skipped and recorded, and the run ends `PARCIAL`, so one bad ERP record never stops the other items. A `PARCIAL` run does not move the incremental start, so the next run tries that item again. Any other write failure, such as a temporary database failure, ends the run `FALHA` and skips nothing.
9. File names follow the task tree (`sync.service.ts`); the routes add `sync.router.ts`, `sync.schemas.ts`, and `sync.openapi.ts`, like the other modules.
