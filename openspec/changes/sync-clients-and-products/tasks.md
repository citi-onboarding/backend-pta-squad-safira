# Tasks

## SDD

- [x] Merge `develop` into the BACK-01-based branch, keeping both sides of every conflict, and run all tests.
- [x] Generate the module with `pnpm gen:module sync`.
- [x] Write the proposal, the `erp-synchronization` spec, and the design.
- [ ] Send the open points to the squad manager: the incremental start (task note versus DATA-01 schema comment) and the dependency on BACK-01.

## Red

- [ ] Developer writes `sync.test.ts` (service with a simulated ERP and an in-memory repository): full load, deactivation of missing items, incremental filter and 50 per page, upsert without duplicates and 0 changed items on a second run, status mapping, ERP down, usage limit, run record, lock taken, on-demand sync (success, 404, lock taken), and status calculation.
- [ ] Developer writes the router tests: `GET /sync/status` (200, 401) and `POST /sync/clientes/:codigo` (200, 401, 403, 404, 409).
- [ ] Developer writes `sync.integration.test.ts` with PostgreSQL: a full load populates clients and products, a second run keeps the same rows, the lock prevents overlap, and run rows are written.
- [ ] Run the tests and confirm that they fail for the expected reason.

## Green

- [ ] Implement `sync.repository.ts`, `sync.service.ts`, `sync.schedule.ts`, `sync.router.ts`, `sync.schemas.ts`, and `sync.openapi.ts`.
- [ ] Wire the routes and the optional schedule in `src/app/create-app.ts`, and start and stop the schedule in `src/server.ts`.
- [ ] Regenerate `openapi.json`.
- [ ] Run the tests until they pass.

## Refactor

- [ ] Review names and duplication, and confirm that logs and run details hold no ERP key or body; run the tests again.

## Consolidation

- [ ] Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, `pnpm test:integration`, and `pnpm build`, and `openspec validate sync-clients-and-products --strict`.
- [ ] Write `docs/changes/sync-clients-and-products.md` from the template and evaluate the ADR.
- [ ] Open the pull request to `develop`, noting the base on BACK-01 and the merge of `develop`.
