# Design: Domain data model

The schema follows the database map attached to task DATA-01 and PRD sections 7.1 to 7.4.

## Decisions

- Every `id` is a uuid `String`. ERP identifiers live in `codigoErp` so the portal never depends on ERP key formats.
- Money is always `Int` in cents with the `Centavos` suffix (RN-13). The only `Float` is the churn probability, which is not money.
- Day-only dates use `@db.Date`. Timestamps use `DateTime`.
- Every foreign key uses `onDelete: Restrict`, so nothing is deleted in cascade (5-year retention, PRD 7.3).
- The salesperson portfolio links `Usuario` and `Cliente` through `codigoVendedor` without a foreign key, because the ERP may have salespeople without a portal user (RN-08).
- `Pedido.chaveEnvio` is unique and generated on creation. It is the idempotency key sent to the ERP, so one portal order creates at most one ERP order (RN-07).
- `Titulo` is unique by `numero + parcela`, because receivables from October 2026 exist in both the ERP and the legacy spreadsheet with the same number (RN-17).
- `StatusTitulo` mirrors the values returned by the ERP API (`EM_ABERTO`, `VENCIDO`, `PAGO`) instead of the map's proposal, so the receivable sync needs no translation.
- `Titulo` has `atualizadoEm`, because receivables change in the ERP when they are paid.

## Rejected alternatives

- Integer auto-increment ids: they leak ordering and clash with ERP codes.
- `Decimal` for money: integer cents match the ERP contract and avoid rounding.
- Cascade deletes: they conflict with the retention requirement.

## Open points for the team

- Values of `StatusTitulo`, `SituacaoDocumento`, `FaixaRisco`, `TipoRegistro`, and `ResultadoRegistro` are proposals to be confirmed.
- The seed uses a temporary scrypt hash until BACK-01 defines password hashing.
