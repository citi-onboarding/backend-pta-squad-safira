# Proposal: Create the domain data model

## Why

Every backend task of the DistriLux order portal (authentication, ERP sync, client search, order flow, history load, document triage, and churn risk) needs persistent tables. The database currently has no domain model, so BACK-01, BACK-03, BACK-04, BACK-05, and DATA-02 are blocked.

## What changes

- Add the 13 domain models from PRD section 7.1: Usuario, Cliente, Produto, Titulo, Contrato, Pedido, ItemPedido, HistoricoStatus, PedidoHistorico, Documento, ExecucaoAgente, RiscoChurn, and RegistroSincronizacao.
- Add 10 enums for roles, client status, order states (RN-12), receivable origin and status, document type and situation, churn risk band, and sync record type and result.
- Add unique keys on ERP codes and natural keys so that sync and history loads can upsert safely (RN-07, RN-06, RN-16).
- Generate the initial migration and an idempotent development seed with one user per role.
- Add the `db:seed` package script.

## Impact

- Database: one additive migration on an empty database. Later schema changes must be new migrations.
- API: none. No route changes in this change.
- Security: the seed creates development-only users with a shared password read from `SEED_PASSWORD`. Password hashing is owned by BACK-01 and must be aligned with it.
- Observability: `RegistroSincronizacao` stores each ERP sync run and history load.
- Documentation: none beyond this change.

## In scope

- Prisma schema, initial migration, seed, and the `db:seed` script.

## Non-goals

- Business rules such as credit limit, the 50-item order limit, price rules, and contract notice dates. They live in services.
- API endpoints, ERP sync, and authentication.
