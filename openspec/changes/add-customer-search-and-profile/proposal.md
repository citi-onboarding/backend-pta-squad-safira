## Why

Salespeople, the sales manager, and the finance team need to find a client and see, in one place, whether that client can buy and how much (US-004, RN-01, RN-08). FRONT-03 builds that screen and BACK-06 starts every order from a client, so both are blocked until the API exists. The first version for the client, due before the meeting on 02/12, is the sign-in plus this client portfolio.

## What Changes

- Add `GET /clientes`, a paginated search by partial company name, ERP code, or CNPJ with or without punctuation. Each page has at most 60 clients and the response carries the total, so the screen can ask the user to refine the search.
- Add `GET /clientes/{id}`, the client profile: registration data, status, salesperson, credit limit, open amount, overdue amount, available credit, the overdue receivables with days overdue, the date of the last order, and the time of the last successful ERP sync.
- Apply the portfolio rule (RN-08) on the server: a salesperson only finds and opens clients of their own portfolio, the sales manager and the finance role see every client. A client of another portfolio answers 404 to the salesperson, so the API does not reveal that it exists.
- Compute the available credit in the server, in cents: credit limit minus the unpaid ERP receivables, both open and overdue (RN-01, RN-13). Receivables loaded from the old spreadsheet do not count. The result may be negative.
- Add a pure available-credit function in `src/shared`, so BACK-07 reuses the same rule when it checks an order.
- Publish both routes in `openapi.json` before the implementation, so FRONT-03 can start from the contract.

## Capabilities

### New Capabilities

- `customer-search`: finding clients of the signed-in user's portfolio by name, code, or CNPJ, page by page.
- `customer-profile`: the profile of one client, with its credit position (RN-01), overdue receivables, and data freshness.

### Modified Capabilities

None.

## Impact

- Business: salespeople see only their portfolio and the real available credit before building an order, which is the base of the credit block in BACK-07.
- API: two new read-only routes under `/clientes`, documented in `openapi.json`. No existing route changes.
- Database: no migration. The change reads the existing `Cliente`, `Titulo`, `Usuario`, and `RegistroSincronizacao` tables created by DATA-01.
- Security: every route requires a session (BACK-01). The portfolio filter always comes from the signed-in user, never from the request. A client outside the portfolio answers 404, not 403.
- Observability: no new log lines. Search terms, CNPJs, and client data are never logged.
- Documentation: change summary in `docs/changes/`. No ADR expected, because the change follows the existing module pattern and adds no cross-cutting decision.

## In scope

- The `customers` module (schemas, OpenAPI, repository, service, router, tests) and its registration in the application.
- The shared available-credit function and its unit tests.
- Integration tests with their own clients and receivables, so the change can be verified before BACK-03 and BACK-04 load real data.

## Non-goals

- Synchronizing clients and receivables with the ERP (BACK-03 and BACK-04).
- Refreshing one client from the ERP on demand (US-003, BACK-13).
- Blocking orders by credit or by overdue receivables (BACK-07). The overdue receivables appear in the profile for reference only.
- Orders of the client and the date of the last order: the field is returned as `null` until orders (BACK-06) or the history load (DATA-03 and DATA-04) exist.
- Churn risk in the profile (FRONT-10).
- Accent-insensitive search ("Sao" finding "São"). It needs a database extension and a migration on the DATA-01 schema; it is recorded as a future improvement.
- The client screens (FRONT-03).
