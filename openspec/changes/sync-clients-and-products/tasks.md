# Tasks

## SDD

- [x] Merge `develop` into the BACK-01-based branch, keeping both sides of every conflict, and run all tests.
- [x] Generate the module with `pnpm gen:module sync`.
- [x] Write the proposal, the `erp-synchronization` spec, and the design.
- [x] Send the open points to the squad manager: the incremental start (task note versus DATA-01 schema comment) and the dependency on BACK-01.

## Red

- [x] Developer writes `sync.test.ts` (service with a simulated ERP and an in-memory repository): full load, deactivation of missing items, incremental filter and 50 per page, upsert without duplicates and 0 changed items on a second run, status mapping, ERP down, usage limit, run record, lock taken, on-demand sync (success, 404, lock taken), and status calculation.
- [x] Developer writes the router tests: `GET /sync/status` (200, 401) and `POST /sync/clientes/:codigo` (200, 401, 403, 404, 409).
- [x] Developer writes `sync.integration.test.ts` with PostgreSQL: a full load populates clients and products, a second run keeps the same rows, the lock prevents overlap, and run rows are written.
- [x] Run the tests and confirm that they fail for the expected reason.

## Green

- [x] Implement `sync.repository.ts`, `sync.service.ts`, `sync.schedule.ts`, `sync.router.ts`, `sync.schemas.ts`, and `sync.openapi.ts`.
- [x] Wire the routes and the optional schedule in `src/app/create-app.ts`, and start and stop the schedule in `src/server.ts`.
- [x] Regenerate `openapi.json` (adding the sync routes to `scripts/generate-openapi.ts` and `scripts/check-openapi.ts`), and keep the test doubles in `tests/sync/` so the production build excludes them.
- [x] Run the tests until they pass.

## Refactor

- [x] Review names and duplication, and confirm that logs and run details hold no ERP key or body; run the tests again.

## Consolidation

- [x] Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, `pnpm test:integration`, and `pnpm build`, and `openspec validate sync-clients-and-products --strict`.
- [x] Write `docs/changes/sync-clients-and-products.md` from the template and evaluate the ADR.
- [ ] Open the pull request to `develop`, noting the base on BACK-01 and the merge of `develop`.

## Review fixes

- [x] Specify skipped items (`PARCIAL`), the full-load guard, items read counted before writing, the on-demand sync under the lock, shutdown waiting for the run, logs, the abandoned run, the usage limit exhausted mid-run, 400 and 422 on the on-demand route, and the real freshness bound.
- [x] Red: developer writes the failing tests (duplicated CNPJ in unit and integration, full-load guard, items read, on-demand race, product failure, usage limit exhausted, `finishRun` failure, schedule stop waiting, logs without the key, routes 400 and 422).
- [x] Green: implement, use tagged `$executeRaw`, expose the schedule through `syncScheduleOf(app)` instead of an untyped `app.locals`, keep the test doubles in `src/` excluded from the build, document the new statuses, add `SESSION_SECRET` to `scripts/test-container.mjs`, and write ADR-0003.
- [x] Refactor and run all gates, including `pnpm test:container`.

## Second review fixes

- [x] Specify that only data errors (`P2002`, `P2000`, `P2020`) skip an item and that a temporary database failure ends the run `FALHA`.
- [x] Red: developer writes the failing tests (a write conflict `P2034` does not skip items and ends `FALHA`; `P2000` and `P2020` skip the item).
- [x] Green: list the data-error codes in `sync.service.ts`, and add the error code to the safe detail of a failed run.
- [x] Refactor and run all gates.

## Squad manager decisions

- [x] Specify the incremental start (last `SUCESSO` start minus 5 minutes; `PARCIAL` and `FALHA` do not move it), the status counting only `SUCESSO`, and the run record without changed items.
- [x] Red: developer writes the failing tests (5-minute margin, a `PARCIAL` run does not move the start nor count in the status, the run record has no changed items).
- [x] Green: use only `SUCESSO` for the incremental start and the status, subtract 5 minutes, and stop recording changed items; correct the DATA-01 schema comment on `atualizadoNoErpEm`.
- [x] Refactor, update the change summary, and run all gates.
