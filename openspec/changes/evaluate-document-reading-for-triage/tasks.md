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
- [x] 3.5 Term stated as a duration (CF-2025-019, Ipojuca, option 1): the model reports `vigencia_meses` and `data_base_vigencia` and code computes the end as base + N months − 1 day (`src/modules/triage/term-end.ts`, used by the grader for the end and the notice deadline). Implemented with its tests in the WIP commit `20370bb`, so no separate Red/Green evidence exists for it; on 2026-11-26 `npx vitest run src/modules/triage scripts/agent-spike` passed (9 files, 109 tests). The "− 1 day" reading is an assumption to confirm with the client (see proposal.md and `docs/agent/spike-resultados.md`).

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

## 7. SDD — Gemini provider

- [x] 7.1 PM authorizes running the spike with Gemini while the Anthropic key is pending (fictitious data).
- [x] 7.2 Check the Gemini Flash model ID, PDF support, and prices on the official pages (2026-11-27): `gemini-3.8-flash`, $0.75 / $3.75 through 2026-12-31, $1.50 / $7.50 from 2027-01-01.
- [x] 7.3 Resolve decisions with the requester: `AGENT_SPIKE_PROVIDER` read only by the spike and required to execute; cost in integer microdollars rounded per request for both providers; Gemini prices recorded with their periods.
- [x] 7.4 Update proposal, design, and the `document-triage` and `triage-accuracy-evaluation` delta specs.
- [x] 7.5 Run `pnpm spec:validate`.

## 8. Red — Gemini provider

- [x] 8.1 Install `@google/genai@3.6.1` as an exact dev dependency.
- [x] 8.2 Developer writes failing tests for `GEMINI_API_KEY` configuration and its log redaction.
- [x] 8.3 Developer writes failing tests for cost in microdollars: Claude scenarios converted, Gemini periods by run date, thinking and cached tokens, rounding, and unpriced model or date.
- [x] 8.4 Developer writes failing tests for the Gemini request: same instructions, reference lists, and document content as the Anthropic request, PDF as inline data, JSON schema output, no tools.
- [x] 8.5 Developer writes failing tests for both adapters' response mapping (completed flag, parsed output, usage) with fake SDK clients.
- [x] 8.6 Developer writes failing tests for provider selection in the runner: default models per provider, unknown provider, dry run per provider, execution without a provider or its key, provider and model on every result.
- [x] 8.7 Run the narrow test files and record the failing output as Red evidence.

## 9. Green — Gemini provider

- [x] 9.1 Implement `GEMINI_API_KEY` and its redaction; add it and `AGENT_SPIKE_PROVIDER` commented to `.env.example`.
- [x] 9.2 Implement price periods and microdollar cost in `pricing.ts`.
- [x] 9.3 Export the shared prompt pieces from `triage-request.ts` and implement the provider interface and both adapters in `scripts/agent-spike/providers/`.
- [x] 9.4 Wire provider selection into the runner and `run.ts`.
- [x] 9.5 Run the narrow test files and record the passing output as Green evidence.

## 10. Refactor — Gemini provider

- [x] 10.1 Simplify without changing behavior and re-run the tests as Refactor evidence.

## 11. Consolidation — Gemini provider

- [x] 11.1 Run `run.ts` in dry-run mode for each provider and record the planned request counts (no API call).
- [x] 11.2 Label Gemini results as provisional in `docs/agent/spike-resultados.md`; keep the Claude model choice (PRD 9.1) pending. ADR 0002 is drafted by task 5.3 with the same label.
- [x] 11.3 Run `pnpm verify` and `pnpm spec:validate` (strict) and typecheck.
