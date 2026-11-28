---
change_id: add-customer-search-and-profile
date: 2026-11-28
status: in-progress
owners: [Beatriz Holanda]
tags: [customers, credit, portfolio, api]
related_adrs: []
openspec_change: openspec/changes/add-customer-search-and-profile/
---

# Add customer search and profile

## Objective

Give salespeople, the sales manager, and the finance team one place to find a client of their portfolio and see whether and how much the client can buy (task BACK-05, US-004, RN-01, RN-08). The client screens (FRONT-03) and the order flow (BACK-06) start from this API.

## Change made

- New `customers` module with `GET /clientes` (search) and `GET /clientes/{id}` (profile), registered at `/clientes` in `create-app.ts` behind the BACK-01 session.
- The contract was published first (commit `2fb83d1`): Zod schemas in `customers.schemas.ts`, routes in `customers.openapi.ts`, and `openapi.json` regenerated. The OpenAPI scripts now import the module.
- The credit rule lives in `src/shared/credit/` so BACK-07 can reuse it without importing the module: `calcularLimiteDisponivel` (RN-01), `listOverdueReceivables`, and `businessDate` and `daysBetween` for "today" in America/Recife.
- The repository applies the portfolio filter from `clientPortfolioFilter` inside the query, both in the search and in the profile lookup, so a client of another portfolio is never loaded.
- Non-obvious choices, detailed in `design.md`:
  - A receivable is overdue when its due date is before today in Recife, not when the ERP status says `VENCIDO`, because the status can lag between syncs.
  - Only unpaid receivables with origin `ERP` use credit; spreadsheet receivables never count.
  - A term is also a CNPJ search only when it has digits and CNPJ punctuation and at least 3 digits, so a code such as `C0001` does not match every CNPJ branch `0001`.

## Resulting behavior

- A salesperson finds only the clients of their own salesperson code; the sales manager and finance find every client. The administrator, and a salesperson without a code, receive 403 (confirmed by the project manager on 27/11; the task card's mention of the administrator was an inconsistency).
- The search matches part of the company name and of the ERP code ignoring letter case, and part of the CNPJ with or without punctuation. It returns pages of 60, ordered by company name, with the total, so the screen can ask the user to refine the search.
- Each listed client shows its available credit and the name of the portal user with its salesperson code, or `null`.
- The profile shows the registration data, status, credit limit, open amount, overdue amount, and available credit in cents (which may be negative), the overdue receivables oldest first with days overdue, and the end time of the last successful client and receivables syncs.
- A client of another portfolio answers 404 with the same title, status, and detail as a client that does not exist.
- `ultimoPedidoEm` is always `null` for now.
- Invalid page numbers, terms longer than 100 characters, unknown query parameters (such as an attempt to choose the portfolio), and malformed ids answer 400.

## Impact

- API: two new read-only routes documented in `openapi.json`; no existing route changes.
- Database: no migration; reads `Cliente`, `Titulo`, `Usuario`, and `RegistroSincronizacao`.
- Security: the portfolio always comes from the session; no search terms, CNPJs, or client data are logged.
- Downstream: FRONT-03 consumes the contract; BACK-07 reuses `src/shared/credit`; BACK-06 starts orders from a client of this API.
- Data: until BACK-03 and BACK-04 run against the ERP, the routes answer with whatever clients and receivables exist in the database, and the sync times are `null`.

## Validations executed

| Command                                                                                    | Result                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `openspec validate add-customer-search-and-profile --strict`                               | Valid                                            |
| `pnpm format:check`                                                                        | All files use Prettier code style                |
| `pnpm verify` (typecheck, lint, unit tests, architecture, OpenSpec, OpenAPI check, skills) | Passed; 23 unit test files, 192 tests            |
| `pnpm test:coverage`                                                                       | Passed; `src/shared` at 100% lines, 98% branches |
| `pnpm test:integration src/modules/customers`                                              | 18 tests passed against PostgreSQL               |
| `pnpm build`                                                                               | Passed                                           |

The Red phase was checked before the implementation: the unit tests failed because the modules did not exist, and the integration tests failed with 404 because the route did not exist.

## Related artifacts

- Proposal: `openspec/changes/add-customer-search-and-profile/proposal.md`
- Specifications: `openspec/changes/add-customer-search-and-profile/specs/customer-search/spec.md` and `specs/customer-profile/spec.md`
- Design: `openspec/changes/add-customer-search-and-profile/design.md`
- Tasks: `openspec/changes/add-customer-search-and-profile/tasks.md`
- ADRs: not applicable. The change follows the existing module pattern and architecture rules; its decisions are local to the credit rule and the customer routes and are recorded in `design.md`.

## Usage

Sign in (`POST /auth/login`), then call with the session cookie:

- `GET /clientes?busca=11.222.333/0001-81&pagina=1`
- `GET /clientes/{id}`

Values are in cents (RN-13); the web client formats them in reais.

## Implementation notes

- Depends on BACK-01 (session and `clientPortfolioFilter`), which is not merged yet; the branch is based on `feat/authAndUsers`.
- Pending: checking the profile of real clients after BACK-03 and BACK-04 are reviewed and their branches merged (task 6.4).
- Accent-insensitive search is a future improvement: it needs the PostgreSQL `unaccent` extension in a migration.
- The search uses `contains`, which does not use indexes; acceptable for a few hundred clients.
