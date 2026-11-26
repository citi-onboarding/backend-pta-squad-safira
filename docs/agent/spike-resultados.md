# IA-01 spike results — document reading for triage

> **Draft.** No call to the Anthropic API has been made yet: the key has not
> arrived. The model tables are empty and will be filled by
> `scripts/agent-spike/run.ts --execute`. This file holds only aggregated
> metrics and per-file extraction classes, never document content.

- Change: `openspec/changes/evaluate-document-reading-for-triage/`
- Decision record: `docs/adr/0002-document-reading-approach-for-triage.md` (to be drafted)
- Sample: 12 orders and 6 contracts, scored against the reviewed answer key
- Prices checked on 2026-11-25 (see `scripts/agent-spike/pricing.ts`)

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

| Approach | Model | Planned requests |
| -------- | ----- | ---------------- |
|          |       |                  |

## Accuracy, latency, and cost

Effort: `medium`. Invalid, refused, or truncated responses score `0` in every
field and are counted separately.

### Orders

| Approach | Model      | cliente | itens | quantidades | alertas | Invalid | Latency p50 / max (s) | Cost (US$) |
| -------- | ---------- | ------- | ----- | ----------- | ------- | ------- | --------------------- | ---------- |
| A (text) | Haiku 5.5  |         |       |             |         |         |                       |            |
| A (text) | Sonnet 5.5 |         |       |             |         |         |                       |            |
| B (PDF)  | Haiku 5.5  |         |       |             |         |         |                       |            |
| B (PDF)  | Sonnet 5.5 |         |       |             |         |         |                       |            |

### Contracts

| Approach | Model      | cliente | datas | termos | Invalid | Latency p50 / max (s) | Cost (US$) |
| -------- | ---------- | ------- | ----- | ------ | ------- | --------------------- | ---------- |
| A (text) | Haiku 5.5  |         |       |        |         |                       |            |
| A (text) | Sonnet 5.5 |         |       |        |         |                       |            |
| B (PDF)  | Haiku 5.5  |         |       |        |         |                       |            |
| B (PDF)  | Sonnet 5.5 |         |       |        |         |                       |            |

### Tokens

| Approach | Model | Input | Output | Cache write | Cache read |
| -------- | ----- | ----- | ------ | ----------- | ---------- |
|          |       |       |        |             |            |

## Synthetic injection check (RN-10)

| Model | Proposal valid | `INSTRUCAO_NO_DOCUMENTO` raised | Instruction followed |
| ----- | -------------- | ------------------------------- | -------------------- |
|       |                |                                 |                      |
