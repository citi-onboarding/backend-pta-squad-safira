## 1. SDD

- [x] 1.1 Read the answer key, the reference lists, and confirm the 18 sample PDFs.
- [x] 1.2 Resolve pending decisions with the requester (proposal + ADR, `unpdf`, optional key, reference lists from materials, alert categories, registry-derived alerts and notice deadline in deterministic code, dependency versions).
- [x] 1.3 Check model IDs and prices on the official documentation (2026-11-25).
- [x] 1.4 Write proposal, `document-triage` and `triage-accuracy-evaluation` delta specs, and design.
- [x] 1.5 Requester reviews the planning artifacts and the per-alert category mapping.
- [x] 1.6 Run `pnpm spec:validate`.

## 2. Red

- [x] 2.1 Install `@anthropic-ai/sdk@1.12.0` and `unpdf@1.9.1` as exact dev dependencies.
- [x] 2.2 Developer writes failing tests for the model key configuration and its log redaction.
- [x] 2.3 Developer writes failing tests for the order and contract proposal contracts and the alert categories.
- [x] 2.4 Developer writes failing tests for the notice deadline (RN-11).
- [x] 2.5 Developer writes failing tests for the request builder: no tools, role instructions, delimited text, closing-delimiter neutralization, PDF document block (RN-19 read-only role, RN-10 document instructions never followed).
- [x] 2.6 Developer writes failing tests for extraction classification, answer-key loading, order and contract scoring, cost from usage, and the dry run, using fake responses and fixtures only.
- [x] 2.7 Run the narrow test files and record the failing output as Red evidence.

## 3. Green

- [x] 3.1 Implement the environment variable and redaction.
- [x] 3.2 Implement schemas, notice deadline, and request builder in `src/modules/triage/`.
- [x] 3.3 Implement extraction classification, answer-key loader, grader, pricing, and the dry-run runner in `scripts/agent-spike/`.
- [x] 3.4 Run the narrow test files and record the passing output as Green evidence.

## 4. Refactor

- [ ] 4.1 Simplify without changing behavior.
- [ ] 4.2 Re-run the tests and record the output as Refactor evidence.

## 5. Spike results without the API

- [ ] 5.1 Run approach A extraction on the 18 PDFs and record each class in `docs/agent/spike-resultados.md`.
- [ ] 5.2 Run `run.ts` in dry-run mode and record the planned request count.
- [ ] 5.3 Draft `docs/agent/spike-resultados.md` and `docs/adr/0002-document-reading-approach-for-triage.md` with empty model tables.

## 6. Consolidation

- [ ] 6.1 Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, and `pnpm build`.
- [ ] 6.2 Run `pnpm spec:validate` (strict) and typecheck.
- [ ] 6.3 Write `docs/changes/evaluate-document-reading-for-triage.md` from the template; keep the change active until the API run completes the ADR.
