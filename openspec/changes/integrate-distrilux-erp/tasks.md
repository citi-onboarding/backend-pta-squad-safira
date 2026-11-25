## 1. SDD

- [x] 1.1 Read the ERP OpenAPI contract v3.3.0 and the existing `backend-foundation` spec.
- [x] 1.2 Resolve pending decisions with the requester (usage limit maps to 503, 3 waits capped at 60 s, 404 is a refusal, ERP variables are required).
- [x] 1.3 Write proposal, `erp-integration` and `monetary-values` delta specs, and design.
- [x] 1.4 Run `pnpm spec:validate` and obtain review of the planning artifacts.

## 2. Red

- [x] 2.1 Developer writes failing tests in `src/shared/money.test.ts` for every `monetary-values` scenario.
- [x] 2.2 Developer writes failing tests in `src/shared/config/env.test.ts` for the ERP configuration scenarios.
- [x] 2.3 Developer writes failing tests in `src/shared/erp/erp-client.test.ts` with a fake `fetch` and fake timers for: key header, paginated reads and filters, single-record reads, submission once with `Idempotency-Key`, timeout, 5xx retries, 503 three times, 429 then success, 429 persisting, `Retry-After` above 60 s, refusals, 401, malformed and non-JSON answers, invalid inputs, and key absence from logs and errors.
- [x] 2.4 Developer writes failing HTTP-boundary tests in `src/shared/erp/erp-client.test.ts` (Express + existing `problemHandler`) proving ERP failures become Problem Details (503 with `retryAfterSeconds`, 409) without the key and the server keeps serving; update `src/app/create-app.test.ts` to inject `erpClient` and the ERP environment.
- [x] 2.5 Run the narrow test files and record the failing output as Red evidence.

## 3. Green

- [x] 3.1 Implement `src/shared/money.ts`.
- [x] 3.2 Add `ERP_API_URL` and `ERP_API_KEY` to `env.ts`, `.env.example` (no values), `tests/setup-env.ts`, Compose, and `scripts/test-container.mjs`.
- [x] 3.3 Implement `erp-client.schemas.ts` and `erp-client.service.ts` (interface, factory, errors, retry policy, timeout, validation, logging).
- [x] 3.4 Inject `erpClient` through `createApp` options and build it in `src/server.ts`; add key paths to logger redaction.
- [x] 3.5 Run the narrow test files and record the passing output as Green evidence.

## 4. Refactor

- [x] 4.1 Simplify the retry loop and error classification without changing behavior.
- [x] 4.2 Rename the Compose and `.env.example` database to `distrilux_portal`, replace the README template title and text, and fill `openspec/config.yaml` context with the DistriLux domain.
- [x] 4.3 Re-run the tests and record the output as Refactor evidence.

## 5. Consolidation

- [x] 5.1 Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, `pnpm build`, and `pnpm test:container`.
- [x] 5.2 Run `pnpm spec:validate` (strict OpenSpec validation) and typecheck.
- [x] 5.3 Write `docs/changes/integrate-distrilux-erp.md` from the template and re-evaluate the ADR decision.
