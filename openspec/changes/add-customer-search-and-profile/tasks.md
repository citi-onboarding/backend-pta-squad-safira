# Tasks

## 1. SDD

- [x] 1.1 Write the proposal, the customer-search and customer-profile specs, and the design.
- [x] 1.2 Run `openspec validate add-customer-search-and-profile --strict`.
- [x] 1.3 Confirm with the project manager whether the administrator sees clients (confirmed on 27/11: no access), and update the design.

## 2. Contract

- [ ] 2.1 Generate the module with `pnpm gen:module customers`.
- [ ] 2.2 Write the request and response schemas in `customers.schemas.ts`: search query, client id, list page, list item, profile, credit position, overdue receivable, and data freshness.
- [ ] 2.3 Register `GET /clientes` and `GET /clientes/{id}` in `customers.openapi.ts`, with the 200, 400, 401, 403, and 404 responses.
- [ ] 2.4 Developer writes a test that the OpenAPI document contains both paths, and runs it.
- [ ] 2.5 Regenerate `openapi.json` with `pnpm openapi:generate`, run `pnpm openapi:check`, and push the branch so FRONT-03 can use the contract.

## 3. Red

- [ ] 3.1 Developer writes unit tests for `calcularLimiteDisponivel`: no receivables, open and overdue receivables, a paid receivable, a spreadsheet receivable, a receivable due today, and a negative result.
- [ ] 3.2 Developer writes unit tests for the service with an in-memory repository: portfolio filter passed to the search, search term normalization (CNPJ with and without punctuation, at least 3 digits, digit-only terms), pagination, overdue list with days overdue, and 404 for a client outside the portfolio.
- [ ] 3.3 Developer writes router tests: 401 without a session, 403 for the administrator and for a salesperson without a code, 400 for an invalid page, a long term, and a malformed id, and responses that match the schemas.
- [ ] 3.4 Developer writes PostgreSQL integration tests with their own clients, users, receivables, and sync records: search by partial name, code, and CNPJ with and without punctuation; salesperson sees only V01 and gets 404 for a V02 client; manager and finance see both; 61 clients make two pages; credit position for a client without receivables, with receivables, with a paid receivable, and above the limit; last successful sync times.
- [ ] 3.5 Run the tests and confirm that they fail for the expected reason.

## 4. Green

- [ ] 4.1 Implement `calcularLimiteDisponivel` in `src/shared/credit/available-credit.ts`.
- [ ] 4.2 Implement `customers.repository.ts`: search with the portfolio filter, count, profile by id and portfolio, unpaid ERP receivables per client, salesperson names, and the last successful sync times.
- [ ] 4.3 Implement `customers.service.ts` with the clock injected and today's date in America/Recife.
- [ ] 4.4 Implement `customers.router.ts` with the session middleware, the portfolio filter, request validation, and response parsing.
- [ ] 4.5 Register the router at `/clientes` in `src/app/create-app.ts`.
- [ ] 4.6 Regenerate `openapi.json` and run the tests until they pass.

## 5. Refactor

- [ ] 5.1 Review names, duplication, and logs, keeping search terms, CNPJs, and client data out of every log line.
- [ ] 5.2 Run the tests again after refactoring.

## 6. Consolidation

- [ ] 6.1 Write `docs/changes/add-customer-search-and-profile.md` using `docs/templates/change.md`, and evaluate whether an ADR is needed.
- [ ] 6.2 Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, `pnpm test:integration`, and `pnpm build`.
- [ ] 6.3 Run `openspec validate add-customer-search-and-profile --strict`.
- [ ] 6.4 After BACK-03 and BACK-04 are reviewed, merge their branches, run the sync against the ERP, and check the profile of real clients (limit, open, and overdue amounts).
- [ ] 6.5 Open the pull request to `feat/authAndUsers`, noting the dependency on BACK-01, BACK-03, and BACK-04 and the project manager's confirmation that the administrator has no access to clients.
