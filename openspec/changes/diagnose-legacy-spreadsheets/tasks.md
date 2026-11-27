# Tasks

## SDD

- [x] Write the proposal, the `historical-data-load` spec, and the design; inspect the three files' structure without printing cell values.
- [x] Add `exceljs@4.4.0` with `--save-exact` and record the audit finding in the design.
- [ ] Confirm the provisional file paths, the `tests/` folder, and the volume difference with the squad manager.

## Red

- [x] Developer writes `read-spreadsheets.test.ts`: header found below title rows, missing column, missing file, the three files read without being changed, and `;`-separated CSV.
- [x] Developer writes `diagnose-spreadsheets.test.ts`: profile counts, distinct orders, each of the ten problems found and not found, receivables from 2026-10-01, and the column match table.
- [x] Developer writes `render-diagnosis.test.ts`: one rule per problem found, "not found" for the others, masked CNPJs, and no names, contacts, or phones.
- [x] Developer writes `run-diagnosis.test.ts`: missing `--input`, and two runs producing byte-identical documents.
- [x] Run the tests and confirm that they fail for the expected reason.

## Green

- [x] Implement `read-spreadsheets.ts`, `diagnose-spreadsheets.ts`, `render-diagnosis.ts`, and `run-diagnosis.ts`.
- [x] Add the `data:diagnose` package script.
- [x] Run the tests until they pass.

## Refactor

- [x] Review names and duplication, and confirm that no cell value is logged; run the tests again.

## Consolidation

- [x] Run `pnpm data:diagnose` on the real files twice and confirm byte-identical output; commit `docs/data/diagnostico-planilhas.md`.
- [x] Check the generated document for personal data before committing it.
- [x] Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, and `pnpm build`, and `openspec validate diagnose-legacy-spreadsheets --strict`.
- [x] Write `docs/changes/diagnose-legacy-spreadsheets.md` from the template and evaluate the ADR.
- [ ] Open the pull request to `develop`, noting the base on `feat/prismaSchema`, the dependency review, and the provisional decisions.

## Review of the first diagnosis

- [x] Specify four more problems found in the real files (status written in different ways, salespeople identified by name, missing required values, CNPJ in different formats), the volume comparison with the task, and the conversion column of the ERP match.
- [x] Red: developer writes the failing tests for each new scenario and runs them.
- [x] Green: implement the detections, rules, volume note, and conversion column; regenerate the document and check it for personal data.
- [x] Refactor and run all gates again.

## Second review of the diagnosis

- [x] Specify the clients' `Situação` in the status check, status values outside the portal, the honest volume comparison, and the installment conversion.
- [x] Red: developer writes the failing tests, including privacy and volume checks on the generated document.
- [x] Green: implement, regenerate the document twice, and check it for personal data.
- [x] Refactor and run all gates again.
