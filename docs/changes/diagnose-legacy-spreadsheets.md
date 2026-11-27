---
change_id: diagnose-legacy-spreadsheets
date: 2026-11-27
status: in-progress
owners: [Luana Allatta Guerra]
tags: [data, historical-load, data-02]
related_adrs: []
openspec_change: openspec/changes/diagnose-legacy-spreadsheets/
---

# Diagnosis of the legacy spreadsheets (DATA-02)

## Objective

Read the three spreadsheets the DistriLux sales team uses today, measure what is dirty or missing, and propose one cleaning rule per problem found, so DATA-03 can clean and load the history (F11).

## Change made

- `scripts/data/read-spreadsheets.ts` reads `Clientes - Comercial.xlsx`, `Pedidos 2025-2026 - Comercial.xlsx`, and the `;`-separated `titulos.csv` with `exceljs`, finds each header row by the expected column names, and returns every cell with its kind (number, Excel date, text, empty, or a formula without a saved result). The CSV is read as text, exactly as written.
- `scripts/data/diagnose-spreadsheets.ts` builds the profile of each file, detects the ten problems of the spec, counts receivables issued from 2026-10-01, and holds the hand-written column match with the DATA-01 Prisma schema and the BACK-02 ERP client schemas.
- `scripts/data/render-diagnosis.ts` turns the diagnosis into Markdown with one proposed cleaning rule per problem found (RN-09, RN-13, RN-16).
- `scripts/data/run-diagnosis.ts` is the `pnpm data:diagnose` command; it formats the document with the repository's Prettier settings and writes `docs/data/diagnostico-planilhas.md`.
- New dependency: `exceljs@4.4.0` (pinned).

## Resulting behavior

- `pnpm data:diagnose -- --input "<folder>"` reads the three files without changing them and writes `docs/data/diagnostico-planilhas.md`; nothing is written to the database.
- Without `--input`, or with a missing file or column, the command stops with a message naming what is missing and writes nothing.
- Running it again with the same files produces a byte-identical document.
- The document and the terminal output contain counts, column names, formats, and row numbers only; text that matches no known format is described by its shape (for example, `99 aa`), never by its value.
- On the real files: 129 client rows, 15,359 order item rows (4,814 distinct orders), and 8,313 receivable rows; 8 of the 10 problems occur; 296 receivables are issued from 2026-10-01; every `Total` cell of the orders file is a formula without a saved value.

## Impact

- Database, API, and `openapi.json`: none.
- `src/` is unchanged; the command lives in `scripts/data/` and imports nothing from `src/modules`.
- Privacy: the real spreadsheets stay outside the repository; the generated document was checked against 364 real names, contacts, phones, and CNPJs, and none of them appears in it.
- Dependency: `exceljs@4.4.0` adds one moderate `pnpm audit` advisory, GHSA-w5hq-g745-h8pq in `uuid@8.3.2` (v3/v5/v6 buffer bounds). `exceljs` imports only `uuid.v4`, and only when writing conditional formatting; this command only reads. It was chosen because `xlsx` on npm is frozen at 0.18.5 with known advisories, and newer SheetJS releases are published outside npm.
- DATA-03 depends on the proposed rules, which the squad manager still has to confirm.

## Validations executed

Run on 2026-11-27 on branch `feat/spreadsheetDiagnosis`:

- `pnpm exec vitest run scripts/data`: 4 test files, 44 tests passed.
- `pnpm format:check`: all files use Prettier code style.
- `pnpm verify` (typecheck, lint, tests, `openspec validate --all --strict`, skills check): passed; 15 test files, 87 tests; OpenSpec 3 passed, 0 failed.
- `pnpm test:coverage`: passed (the repository threshold covers `src/shared`); the DATA-02 scripts measured separately: 96.22% statements, 87.89% branches, 98.18% functions, 97.01% lines. The uncovered lines are the direct-run entry point and the rethrow of unexpected errors.
- `pnpm build`: passed.
- `openspec validate diagnose-legacy-spreadsheets --strict`: valid.
- `pnpm data:diagnose` run twice on the real files: the same SHA-256 both times, and the three source files kept their sizes.
- `pnpm test:integration`: not applicable, because no database behavior changed.

## Related artifacts

- Proposal: `openspec/changes/diagnose-legacy-spreadsheets/proposal.md`
- Specification: `openspec/changes/diagnose-legacy-spreadsheets/specs/historical-data-load/spec.md`
- Design: `openspec/changes/diagnose-legacy-spreadsheets/design.md`
- Tasks: `openspec/changes/diagnose-legacy-spreadsheets/tasks.md`
- Generated diagnosis: `docs/data/diagnostico-planilhas.md`
- ADR: Not applicable. A read-only local command with no cross-cutting or hard-to-reverse decision; the dependency choice is recorded in the design and in the pull request.

## Usage

1. Download the three spreadsheets from the project's Drive folder to a folder outside the repository, without opening them in Excel.
2. Run `pnpm data:diagnose -- --input "<that folder>"`.
3. Commit `docs/data/diagnostico-planilhas.md` only after checking that it holds no client data.

## Implementation notes

- This branch is based on `feat/prismaSchema` (DATA-01, still open); the column match uses its Prisma schema. The BACK-02 ERP fields are copied by hand, because BACK-02 (PR #12) is not merged into this base.
- Provisional decisions to confirm with the squad manager: the file paths of the task tree instead of the task text, the `scripts/data/tests/` folder instead of `__tests__` (the lint requires kebab-case folders), and the difference between the expected and the real row counts.
- Name comparison treats punctuation as a space, so `S.A.` and `SA` are not considered the same name.
