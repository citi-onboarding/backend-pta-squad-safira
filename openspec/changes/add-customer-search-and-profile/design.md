# Design: Customer search and profile

The decisions below follow task BACK-05, PRD sections 4.2 and 7.1, US-002, US-004, RN-01, RN-08, and RN-13, the prototype screens 3.2 and 3.3, and the kickoff answers of 25/11. See `proposal.md` for the motivation and the specs for the observable behavior.

## Context

- DATA-01 created `Cliente` (with `codigoVendedor` and `limiteCreditoCentavos`), `Titulo` (with `status`, `origem`, `vencimento`, `valorCentavos`), `Usuario` (with a unique `codigoVendedor`), and `RegistroSincronizacao`. No migration is needed.
- BACK-01 provides the session middleware and `clientPortfolioFilter(user)` in `src/shared/http/require-role.ts`: `{}` for the sales manager and finance, `{ codigoVendedor }` for a salesperson, `null` for the administrator and for a salesperson without a code.
- BACK-03 and BACK-04 fill clients and receivables from the ERP. They are not merged yet; this change only reads the tables, so its tests create their own rows.
- Modules must not import other modules, and BACK-07 must reuse the credit rule.

## Goals / Non-Goals

**Goals:**

- One place for the RN-01 rule, reusable by BACK-07 without importing the `customers` module.
- The portfolio filter applied inside the database query, so a client of another portfolio is never loaded.
- A contract that FRONT-03 can use before the implementation is finished.

**Non-Goals:**

- Caching, full-text search, or new indexes. The DistriLux portfolio has a few hundred clients.
- Any write route.

## Decisions

### Routes and contract

- `GET /clientes?busca=&pagina=` and `GET /clientes/{id}`, as named in the task. JSON properties use the Portuguese domain names already used by the schema and by `/users` (`razaoSocial`, `codigoVendedor`, `limiteDisponivelCentavos`).
- Schemas live in `customers.schemas.ts` and are registered in `customers.openapi.ts`; `openapi.json` is regenerated with `pnpm openapi:generate` and checked by `pnpm openapi:check`. Every response is parsed by its schema before it is sent.
- The contract (schemas, OpenAPI registration, and a test that both paths are in the document) is committed and pushed before the Red phase, so FRONT-03 can start. This is the only production code written before its behavior tests, and it holds no logic.
- List response: `{ itens, total, pagina, tamanhoPagina }`, with `tamanhoPagina` fixed at 60. Profile response: client data, `credito` (`limiteCreditoCentavos`, `emAbertoCentavos`, `vencidoCentavos`, `limiteDisponivelCentavos`), `titulosVencidos`, `ultimoPedidoEm` (always `null` for now), and `ultimaSincronizacao` (`clientesEm`, `titulosEm`, each nullable).
- Alternative rejected: a `limite` and `offset` query. The screen only pages forward and shows "Refine a busca"; a fixed page of 60 is simpler for FRONT-03 and matches the prototype.

### Portfolio and authorization

- Both routes use the BACK-01 session middleware. The router reads `clientPortfolioFilter(request.user)`: `null` answers 403; otherwise the filter goes into the repository query.
- The profile query looks the client up by id and portfolio filter together. A client of another portfolio is therefore indistinguishable from a missing one and answers 404 (task note: do not reveal that it exists).
- Alternative rejected: load the client and then call `canAccessClient`. It works, but it loads data the user may not see and makes the 404 depend on a second check that a later change could forget.
- The administrator has no access, following the BACK-01 design (PRD 4.2 and the prototype menu). The task card also listed the administrator among the roles that see every client; the project manager confirmed on 27/11 that this was an inconsistency in the card and that the administrator has no access to clients.

### Search

- The term is trimmed. Company name and ERP code match with a case-insensitive `contains`.
- When the term has only digits and CNPJ punctuation (`.`, `/`, `-`, spaces) and at least 3 digits, its digits also match the CNPJ with `contains`; the database stores CNPJs as digits only. Restricting this to digit-only terms prevents a code such as `C0001` from matching every CNPJ that contains `0001`.
- Order: company name, then ERP code, so pages are stable.
- Alternative rejected for now: accent-insensitive search with PostgreSQL `unaccent`. It needs an extension created by a migration on the DATA-01 schema; recorded as a future improvement in the proposal.

### Credit rule

- A pure function `calcularLimiteDisponivel` lives in `src/shared/credit/available-credit.ts`, because BACK-07 (another module) reuses it. It receives the credit limit, the receivables (amount, due date, status, origin), and today's date, and returns the open, overdue, and available amounts in cents. It has no database or clock access. The name is the one given in the task, so BACK-07 finds it; it follows the Portuguese domain names of the schema.
- Counted receivables: origin `ERP` and status other than `PAGO`. Overdue: due date before today; open: due today or later. The status `VENCIDO` sent by the ERP is not used to split open and overdue, because between two syncs a receivable that fell due yesterday may still say `EM_ABERTO`; the due date gives the same answer at any time.
- `listOverdueReceivables` in the same file applies the same rule to list the overdue receivables, oldest first, with their days overdue, so the profile and BACK-07 never disagree on what is overdue.
- Today is the date in `America/Recife`, given by a clock injected into the service, so tests are deterministic. `businessDate(now)` and `daysBetween(from, to)` live in `src/shared/credit/business-date.ts`, next to the credit rule that needs them.
- Days overdue = whole days between the due date and today.
- The list computes the available credit for the clients of the page only, with one grouped query of unpaid ERP receivables per page.

### Data freshness and last order

- `ultimaSincronizacao` reads, from `RegistroSincronizacao`, the latest `terminouEm` with `resultado = SUCESSO` for `SINCRONIZACAO_CLIENTES` and for `SINCRONIZACAO_TITULOS`. Until BACK-03 and BACK-04 write those rows, both are `null`.
- `ultimoPedidoEm` is `null`. Orders exist only after BACK-06, and the spreadsheet history only after DATA-03 and DATA-04; the field is in the contract now so FRONT-03 does not change later.

### Code organization

- `src/modules/customers`: `customers.schemas.ts`, `customers.openapi.ts`, `customers.repository.ts` (Prisma only), `customers.service.ts` (rules, clock injected), `customers.router.ts` (HTTP only), plus unit, router, and integration tests, following the `users` module.
- The repository reads the salesperson name from `Usuario` by `codigoVendedor` directly with Prisma; it does not import the `users` module.
- `src/app/create-app.ts` registers the router at `/clientes`.

## Risks / Trade-offs

- [`contains` search does not use the indexes] → Acceptable for a few hundred clients; revisit with a trigram index if the portfolio grows.
- [Data is as fresh as the last sync] → The profile returns the last successful sync times so the screen can show them (US-002); on-demand refresh is BACK-13.
- [Receivables of a client missing from the portal] → Not possible: `Titulo.clienteId` is a required foreign key.

## Migration Plan

No migration. The routes are new and read-only; rollback is removing the router registration.
