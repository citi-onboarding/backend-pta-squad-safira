# Design: Diagnose the legacy spreadsheets

See `proposal.md` for the motivation and `specs/historical-data-load/spec.md` for the required behavior. The decisions below follow task DATA-02, PRD sections 7.4 and 7.7, RN-09, RN-13, and RN-16.

## What the files look like

Inspected without printing any cell value:

| File                                                   | Header                                         | Columns                                                                                                                              | Physical rows             |
| ------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `Clientes - Comercial.xlsx` (sheet `Clientes`)         | row 3, after a title row and a blank row       | `Cód.`, `Razão Social`, `CNPJ`, `Cidade/UF`, `Segmento`, `Vendedor`, `Limite`, `Situação`, `Contato`, `Telefone`, `Últ. atualização` | 142                       |
| `Pedidos 2025-2026 - Comercial.xlsx` (sheet `Pedidos`) | row 4, after two title rows and a blank row    | `Nº Pedido`, `Data`, `Cliente`, `Vendedor`, `Produto`, `Descrição`, `Qtd`, `Un`, `Preço Unit.`, `Total`, `Status`                    | 15,363 (one row per item) |
| `titulos.csv`                                          | row 1; `;` separator; ASCII; CRLF line endings | `id_titulo`, `id_cliente`, `num_pedido`, `parcela`, `valor`, `data_emissao`, `data_vencimento`, `data_pagamento`, `status`           | 8,314                     |

## Decisions

### Library: `exceljs@4.4.0`

- Reads the `.xlsx` files and the CSV (with `parserOptions: { delimiter: ";" }`), so there is one reader library.
- Chosen because `xlsx` on npm is frozen at 0.18.5, which has known security advisories, and newer SheetJS releases are published outside npm.
- It adds one moderate `pnpm audit` advisory, GHSA-w5hq-g745-h8pq in `uuid@8.3.2` ("missing buffer bounds check in v3/v5/v6 when buf is provided"). `exceljs` imports only `uuid.v4`, and only in `lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`, which builds conditional-formatting XML when writing. This command only reads. To be reviewed in the pull request, as CONTRIBUTING.md asks for every new dependency.
- Rejected: `xlsx@0.18.5` (advisories); a hand-written CSV parser (`exceljs` already parses CSV).

### Code organization

The task tree lists only `scripts/data/read-spreadsheets.ts` and its test. To keep each file to one job and testable without the real files, the command is split, all under `scripts/data/`:

- `read-spreadsheets.ts`: opens the three files, finds each header row by the expected column names, and returns plain rows (cell value, cell kind, and row number). It never writes.
- `diagnose-spreadsheets.ts`: pure functions that build the profile, detect the problems, count receivables from 2026-10-01, and list the column matches.
- `render-diagnosis.ts`: turns the diagnosis into Markdown, including one fixed cleaning rule per problem found.
- `run-diagnosis.ts`: the command: reads `--input <folder>`, calls the three steps, and writes `docs/data/diagnostico-planilhas.md`.
- Tests in `scripts/data/__tests__/`: `read-spreadsheets.test.ts` (task file), `diagnose-spreadsheets.test.ts`, `render-diagnosis.test.ts`, and `run-diagnosis.test.ts`.

`scripts/` is outside `src/`, so the module boundaries of `src/` do not apply; the command imports nothing from `src/modules`.

### Input and output

- `pnpm data:diagnose -- --input "<folder>"` (new package script, run with `node --import tsx`, like `openapi:generate`). Without `--input`, or with a missing file, the command stops with a clear message and writes nothing.
- The output path is fixed: `docs/data/diagnostico-planilhas.md`, overwritten on each run.

### Header detection

The reader looks for the first row whose cells contain every expected column name for that file, compared after trimming. Rows above it (titles, blank rows) are ignored. A missing column stops the command with the file and column names, so a changed spreadsheet fails loudly instead of producing a wrong diagnosis.

### Problem detection

Exactly as listed in the spec requirement "Detection of data problems". Supporting choices:

- Name normalization for "clients written in different ways": lowercase, remove accents (Unicode NFD without combining marks), replace punctuation with spaces, and collapse spaces.
- CNPJ check digits follow the official modulo-11 algorithm.
- Date formats are classified as `Excel date`, `dd/mm/yyyy`, `yyyy-mm-dd`, or `other text`.
- The quantity-times-price check works in integer cents, to avoid floating-point noise (RN-13).
- "Outdated status" compares only the receivable's own fields, never the current date, so the result does not change from one day to the next.

### Column match with the ERP

A fixed table in `diagnose-spreadsheets.ts` maps each spreadsheet column to the DATA-01 Prisma field (`Cliente`, `PedidoHistorico`, `Titulo`) and to the BACK-02 ERP field (`erpClienteSchema`, `erpPedidoSchema`, `erpTituloSchema`). It is written by hand, because BACK-02 (PR #12) is not merged into this branch's base and scripts must not depend on unmerged code. A test checks that every expected column of the three files appears in the table.

### Repeatable and private output

- No date, time, run duration, or absolute path in the document; rows, columns, problems, and examples are always in the same order.
- The document holds counts, column names, formats, and row numbers only. CNPJ examples are masked to `**.***.***/****-NN`; names, contacts, and phone numbers never appear.
- The command prints only file names and totals.

### Tests

The tests build small invented spreadsheets with `exceljs` in a temporary folder, so no real or binary fixture enters the repository. Each spec scenario maps to at least one test.

## Rejected alternatives

- Fixed header row numbers: simpler, but a new title row in the client's file would silently shift every column.
- Keeping the real files in the repository (even ignored by Git): they contain personal and commercial data.
- Generating only the numbers and writing the rules by hand: the checklist asks for the same result on every run, and a hand-written section could drift from the numbers.

## Risks

- [The ERP field names in the match table drift from BACK-02 when it merges] → DATA-03 rechecks the table against the merged schemas; the table is one place to change.
- [Cleaning rules are proposals] → DATA-03 and the squad manager confirm them before applying.

## ADR

Not applicable: a read-only, local command with no cross-cutting decision. The dependency choice is recorded here and in the pull request.

## Open questions

- Provisional file paths and the volume difference (proposal, "Provisional decisions").
