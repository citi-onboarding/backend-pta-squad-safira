# Proposal: Diagnose the legacy spreadsheets

## Why

The history load (F11) needs to know what is actually inside the spreadsheets the DistriLux sales team uses today before any row is cleaned or loaded. PRD section 7.4 lists the expected problems (duplicates, dates and values in different formats, outdated statuses, clients identified by name, quantities typed wrong, and total lines) but not which of them really occur, nor how often. DATA-03 (cleaning and load) is blocked until a repeatable diagnosis with one proposed cleaning rule per problem exists.

## What changes

- Add a read-only command that reads `Clientes - Comercial.xlsx`, `Pedidos 2025-2026 - Comercial.xlsx`, and `titulos.csv` from a folder given on the command line and never changes them.
- For each file, report columns and inferred types, row counts (data rows, blank rows, total lines), empty values per column, duplicates, and the date and value formats found.
- Detect the problems named by task DATA-02 and PRD 7.4: clients written in different ways, invalid CNPJs, dates in different formats, values with a decimal comma, duplicates, orders without a client, outdated statuses, quantities typed wrong, and total lines; report which ones occur and how often.
- Compare each spreadsheet column with the ERP fields, using both the DATA-01 Prisma schema and the BACK-02 ERP client schemas, and report which columns match.
- Generate `docs/data/diagnostico-planilhas.md` with the numbers and one proposed cleaning rule per problem found, for DATA-03 to apply, following RN-09 (the ERP is the reference) and the rule that receivables from 2026-10-01 come from the ERP.
- Add the `exceljs` dependency (pinned to 4.4.0) to read both the `.xlsx` files and the `;`-separated CSV.

## Impact

- Business: DATA-03 gets an agreed list of cleaning rules backed by real counts.
- Database and migrations: none. Nothing is written to the portal tables.
- API: none.
- Security and privacy: the spreadsheets contain client names, CNPJs, phone numbers, and amounts. They stay outside the repository; the generated document contains only aggregated numbers and masked examples. The command never logs cell values.
- Observability: the command prints only progress and totals.
- Documentation: `docs/data/diagnostico-planilhas.md` (generated), the change summary, and the README section on how to run the command.
- Dependencies: `exceljs@4.4.0`, reviewed in the pull request (see design).

## In scope

- The read-only diagnosis command, its tests with a small invented spreadsheet, the generated document, and the `data:diagnose` package script.

## Non-goals

- Cleaning, transforming, or loading any data (DATA-03).
- Calling the ERP. Column matching uses the schemas only.
- Storing the real spreadsheets in the repository.

## Provisional decisions (to confirm with the squad manager)

1. File paths: the DATA-02 task text names `scripts/carga/diagnostico.ts` and `docs/carga-historico-diagnostico.md`, while its file tree and details name `scripts/data/read-spreadsheets.ts`, `scripts/data/__tests__/read-spreadsheets.test.ts`, and `docs/data/diagnostico-planilhas.md`. The tree is used because it is the only list with every file and because AGENTS.md asks for English code names.
2. Test folder: the task names `scripts/data/__tests__/`, but the repository lint requires kebab-case folders under `scripts/` (`check-file/folder-naming-convention`), so the tests live in `scripts/data/tests/`.
3. Expected volumes: the task mentions about 9,700 order rows and about 6,500 receivable rows, while the files have 15,363 and 8,314 physical rows. The diagnosis reports the real counts and explains the difference.
