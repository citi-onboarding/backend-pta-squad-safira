# IA-01 spike results — document reading for triage

> **Draft.** No model API has been called yet. The Anthropic key has not
> arrived, so the PM authorized running the spike with Gemini first
> (fictitious data). The model tables are empty and will be filled by
> `AGENT_SPIKE_PROVIDER=<gemini|anthropic> scripts/agent-spike/run.ts --execute`.
> This file holds only aggregated metrics and per-file extraction classes,
> never document content.
>
> **Gemini rows are provisional.** They measure approach A versus B with a real
> model; they do not choose the model. The Claude model for the triage agent
> (PRD 9.1) stays pending until the Claude run.

- Change: `openspec/changes/evaluate-document-reading-for-triage/`
- Decision record: `docs/adr/0002-document-reading-approach-for-triage.md` (to be drafted)
- Sample: 12 orders and 6 contracts, scored against the reviewed answer key
- Prices checked on 2026-11-25 (Claude) and 2026-11-27 (Gemini 3.8 Flash, which
  doubles on 2027-01-01); see `scripts/agent-spike/pricing.ts`. Cost is in
  integer microdollars (µ$, millionths of a US dollar), rounded per request.

## Assumptions to confirm with the client

| #   | Document              | Assumption                                                                                                                                                                                                                                             | Alternative reading                            | Where it lives                   |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------- |
| 1   | CF-2025-019 (Ipojuca) | The term is stated as "12 months from the signature" (2025-12-10). The model reports `vigencia_meses = 12` and `data_base_vigencia = 2025-12-10`; code computes the end as base + N months − 1 day = 2026-12-09, notice deadline 2026-11-24 (15 days). | End on 2026-12-10, notice deadline 2026-11-25. | `src/modules/triage/term-end.ts` |

The answer key agrees with assumption 1, so the spike scores against it. The
contract-deadlines task must not treat it as settled until the client confirms.

## Approach A — text extraction quality

Classes: `good`, `scrambled`, `empty` (see the `triage-accuracy-evaluation` spec).

| File | Kind | Characters per page | Expected terms found | Class |
| ---- | ---- | ------------------- | -------------------- | ----- |
|      |      |                     |                      |       |

## Dry run

Recorded on 2026-11-27 with `AGENT_SPIKE_PROVIDER` set and no `--execute`; no request was sent.

| Provider  | Models                              | Planned requests                                |
| --------- | ----------------------------------- | ----------------------------------------------- |
| gemini    | gemini-3.8-flash                    | 37 (18 documents × 2 approaches + 1 injection)  |
| anthropic | claude-haiku-5-5, claude-sonnet-5-5 | 74 (18 documents × 2 approaches × 2 models + 2) |

## Accuracy, latency, and cost

Effort: `medium`. Invalid, refused, or truncated responses score `0` in every
field and are counted separately.

### Orders

| Approach | Model                          | cliente | itens | quantidades | alertas | Invalid | Latency p50 / max (s) | Cost (µ$) |
| -------- | ------------------------------ | ------- | ----- | ----------- | ------- | ------- | --------------------- | --------- |
| A (text) | Haiku 5.5                      |         |       |             |         |         |                       |           |
| A (text) | Sonnet 5.5                     |         |       |             |         |         |                       |           |
| B (PDF)  | Haiku 5.5                      |         |       |             |         |         |                       |           |
| B (PDF)  | Sonnet 5.5                     |         |       |             |         |         |                       |           |
| A (text) | Gemini 3.8 Flash (provisional) |         |       |             |         |         |                       |           |
| B (PDF)  | Gemini 3.8 Flash (provisional) |         |       |             |         |         |                       |           |

### Contracts

| Approach | Model                          | cliente | datas | termos | Invalid | Latency p50 / max (s) | Cost (µ$) |
| -------- | ------------------------------ | ------- | ----- | ------ | ------- | --------------------- | --------- |
| A (text) | Haiku 5.5                      |         |       |        |         |                       |           |
| A (text) | Sonnet 5.5                     |         |       |        |         |                       |           |
| B (PDF)  | Haiku 5.5                      |         |       |        |         |                       |           |
| B (PDF)  | Sonnet 5.5                     |         |       |        |         |                       |           |
| A (text) | Gemini 3.8 Flash (provisional) |         |       |        |         |                       |           |
| B (PDF)  | Gemini 3.8 Flash (provisional) |         |       |        |         |                       |           |

### Tokens

| Approach | Model | Input | Output | Cache write | Cache read |
| -------- | ----- | ----- | ------ | ----------- | ---------- |
|          |       |       |        |             |            |

## Synthetic injection check (RN-10)

| Model | Proposal valid | `INSTRUCAO_NO_DOCUMENTO` raised | Instruction followed |
| ----- | -------------- | ------------------------------- | -------------------- |
|       |                |                                 |                      |
