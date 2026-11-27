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
- ERP fields that the ERP always sends are required: `Cliente.codigoVendedor`, `Cliente.segmento`, and `Produto.categoria` (ERP API v3.3.0). A client without `codigoVendedor` would be in no portfolio (RN-08), and the client page (US-004) and the evolution by category (US-015) depend on the other two.
- A `VENDEDOR` user must have `codigoVendedor`. Prisma cannot express a conditional requirement, so the initial migration adds the CHECK constraint `Usuario_vendedor_tem_codigo`. Other roles keep it empty.
- `Cliente`, `Produto`, and `Titulo` store the ERP `atualizadoEm` in `atualizadoNoErpEm`. `atualizadoEm` (`@updatedAt`) is the time the portal wrote the row, so it cannot drive the incremental sync; the max of `atualizadoNoErpEm` is the `atualizadoDesde` of the next sync (RN-15). It is empty for receivables loaded from the spreadsheet.
- `PedidoHistorico.clienteId` and `produtoId` are required. Lines without a safe match go to the pending list and do not enter the history (US-011).
- `Contrato` stores who handled the notice and when (`avisoTratadoPorId`, `avisoTratadoEm`, US-022), and `RiscoChurn` stores who registered the contact (`contatoRegistradoPorId`, US-027).
- `Documento` stores the summary and the role it is forwarded to (`resumo`, `encaminhadoPara`) for documents classified as `OUTRO` (US-024).
- The AI cost is `ExecucaoAgente.custoEstimadoMicrodolares`, an `Int` in millionths of a US dollar. One model call costs fractions of a cent, so cents would round it to 0. It is the only money column not in cents.

- `Titulo.pedidoErp` is required: the ERP always sends it and every line of `titulos.csv` has `num_pedido`.
- `Titulo.parcela` stays an `Int` with the installment number. The ERP sends `"1/3"` and the spreadsheet also has `01/01` and `1 de 1`, so the number before the separator is the only form both sources share, and it keeps `numero + parcela` safe against double counting (RN-17).
- `StatusTitulo` has no `CANCELADO`. The 6 `Estornado` lines of `titulos.csv` are discarded by the history load with their reason (RN-16), so they never count as revenue (RN-17).
- `PedidoHistorico.cancelado` is a `Boolean` instead of a free-text status. The spreadsheet only has Faturado and Cancelado, and cancelled orders stay marked but never count as sales (US-011).
- `PedidoHistorico.vendedorNome` keeps the name as typed in the spreadsheet (nicknames). The portfolio comes from `Cliente.codigoVendedor`, because the ERP wins (RN-09).
- `Contrato.volumeMinimoCentavos`: every sample contract states the minimum monthly volume in reais, so it is money in cents (RN-13).
- `HistoricoStatus.usuarioId` is required: every state change stores date, time, and user (RN-12). Automatic retries record the user who sent the order.
- `Pedido.vendedorId` keeps the PRD name (7.1). It is the user who created the order, which may be a manager; the portfolio of an order comes from its client.
- `RegistroSincronizacao.relatorio` (`Json`) holds the history load report: per file, the lines read, fixed, discarded, and pending by problem type, and each pending line with its original content and reason (US-012, RN-16). This keeps the 13 tables of PRD 7.1.

## Rejected alternatives

- Integer auto-increment ids: they leak ordering and clash with ERP codes.
- `Decimal` for money: integer cents match the ERP contract and avoid rounding.
- Cascade deletes: they conflict with the retention requirement.

## Open points for the team

- Values of `StatusTitulo`, `SituacaoDocumento`, `FaixaRisco`, `TipoRegistro`, and `ResultadoRegistro` are proposals to be confirmed.
- The seed uses a temporary scrypt hash until BACK-01 defines password hashing.
