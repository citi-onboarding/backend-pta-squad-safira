# Tasks

## SDD

- [x] Write the proposal, the `historical-data-load` spec, and the design; inspect the three files' structure without printing cell values.
- [x] Add `exceljs@4.4.0` with `--save-exact` and record the audit finding in the design.
- [ ] Confirm the provisional file paths, the `tests/` folder, and the volume difference with the squad manager.

## Red

- [x] Developer writes `read-spreadsheets.test.ts`: header found below title rows, missing column, missing file, the three files read without being changed, and `;`-separated CSV.
- [x] Developer writes `diagnose-spreadsheets.test.ts`: profile counts, distinct orders, each of the ten problems found and not found, receivables from 2026-10-01, and the column match table.
- [ ] Developer writes `render-diagnosis.test.ts`: one rule per problem found, "not found" for the others, masked CNPJs, and no names, contacts, or phones.
- [ ] Developer writes `run-diagnosis.test.ts`: missing `--input`, and two runs producing byte-identical documents.
- [ ] Run the tests and confirm that they fail for the expected reason.

## Green

- [ ] Implement `read-spreadsheets.ts`, `diagnose-spreadsheets.ts`, `render-diagnosis.ts`, and `run-diagnosis.ts`.
- [ ] Add the `data:diagnose` package script.
- [ ] Run the tests until they pass.

## Refactor

- [ ] Review names and duplication, and confirm that no cell value is logged; run the tests again.

## Consolidation

- [ ] Run `pnpm data:diagnose` on the real files twice and confirm byte-identical output; commit `docs/data/diagnostico-planilhas.md`.
- [ ] Check the generated document for personal data before committing it.
- [ ] Document how to run the command in the README.
- [ ] Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, and `pnpm build`, and `openspec validate diagnose-legacy-spreadsheets --strict`.
- [ ] Write `docs/changes/diagnose-legacy-spreadsheets.md` from the template and evaluate the ADR.
- [ ] Open the pull request to `develop`, noting the base on `feat/prismaSchema`, the dependency review, and the provisional decisions.
