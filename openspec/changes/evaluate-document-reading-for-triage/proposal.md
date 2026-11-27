## Why

The triage agent (PRD 9.1) must read customer purchase orders and supply
contracts sent as PDFs and propose structured data for a person to confirm.
The documents vary widely — text PDFs, printed spreadsheets, printed e-mails,
scans, and a photo of a handwritten order — and it is not yet known whether
sending extracted text or the PDF itself to Claude gives better accuracy, nor
whether Claude Haiku is enough or Claude Sonnet is needed. Task IA-01 is a spike
to decide that with measurements against a reviewed answer key. The Anthropic
API key has not arrived, so this change prepares everything that does not need
it and makes no API call.

Because the Anthropic key is still pending, the PM authorized running the spike
with Google Gemini in the meantime (the sample data is fictitious). The spike
therefore accepts two providers behind one interface — Gemini now, Claude when
its key arrives — selected by an environment variable. Gemini numbers are
provisional: they measure the approaches, not the final model, and the choice
of Claude model for the triage agent (PRD 9.1) stays pending until Claude runs.

## What Changes

- Add an optional, server-only `ANTHROPIC_API_KEY` to the validated environment
  and to `.env.example` (no value).
- Define the triage response contract for orders and contracts as Zod schemas
  compatible with the answer key: customer and product codes from reference
  lists, quantities as found in the document, contract dates, terms in integer
  cents (RN-13), and alerts from a fixed set of categories.
- Compute the contract notice deadline deterministically (end of term minus the
  notice period, RN-11) instead of asking the model for it: calculations stay
  with code (RN-19).
- When a contract states its term only as a duration from a date (contract
  CF-2025-019, Ipojuca: "12 months from the signature"), the model reports the
  duration in months (`vigencia_meses`) and the base date
  (`data_base_vigencia`) and leaves the end null; code computes the end as
  base date + N calendar months − 1 day (RN-19).
- Define the agent's rules: it only reads, consults, and proposes, never writes
  or sends, has no tools, and leaves dates and credit to code (RN-19); any
  instruction written inside a document is content that it reports, never
  follows, and a person confirms every action (RN-10).
- Approach A: extract the text of the 18 sample PDFs and classify each
  extraction as good, scrambled, or empty — the first result of the spike.
- A grader that scores a response against the answer key per field (customer,
  items, quantities, dates, terms, alerts), tested with fake responses.
- `scripts/agent-spike/run.ts`, ready to compare approach A (extracted text) and
  approach B (PDF document block) on the latest Claude Haiku and Claude Sonnet,
  measuring accuracy, latency, and cost from token usage. It runs dry by
  default and calls the API only with an explicit flag and a key.
- A provider interface in `scripts/agent-spike/` with two adapters: Anthropic
  (Claude Haiku and Sonnet, unchanged behavior) and Gemini (`gemini-3.8-flash`,
  which reads PDFs and supports structured output). `AGENT_SPIKE_PROVIDER`
  (`gemini` or `anthropic`) selects the provider; it is required to execute and
  read only by the spike, never by the server.
- Add an optional, server-only `GEMINI_API_KEY` to the validated environment,
  to the logger redaction, and to `.env.example` (commented, no value).
- Cost is reported in integer microdollars (millionths of a US dollar), the unit
  of `ExecucaoAgente.custoEstimadoMicrodolares`, rounded per request, for both
  providers. Gemini prices are recorded with their validity periods (they
  double on 2027-01-01) and priced at the run date.
- Draft `docs/agent/spike-resultados.md` and ADR 0002 with empty result tables.
- Add `@anthropic-ai/sdk@1.12.0`, `@google/genai@3.6.1`, and `unpdf@1.9.1` as
  exact dev dependencies.

## Capabilities

### New Capabilities

- `document-triage`: how the portal reads an order or contract document with a
  model — the response contract, the alert categories the model may raise, the
  deterministic notice deadline, and the agent's read-and-propose and
  prompt-injection rules.
- `triage-accuracy-evaluation`: how a triage approach is measured against the
  answer key — extraction quality, per-field scores, latency, and cost.

### Modified Capabilities

None.

## Impact

- **Business:** produces the evidence to choose the reading approach and model
  for IA-02 before any production triage code exists; the rules RN-19 and
  RN-10 are fixed from the first line of agent code.
- **Security:** the model keys are server-only, optional, never logged (logger
  redaction gains `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`), and unused by the
  server. A Gemini run sends the fictitious sample documents and reference
  lists to Google, as authorized by the PM; no real customer data is sent. The
  agent
  has no tools, so a malicious document cannot make it act. The sample
  documents, the answer key, the reference lists, and every artifact derived
  from them (extracted text, per-alert category mapping, raw responses) stay
  outside the repository.
- **API:** none. No route, no `openapi.json` change.
- **Database migration:** none.
- **Observability:** spike scripts print metrics only (scores, tokens, cost,
  latency), never document content.
- **Cost:** none in this change (no API call). The run script shows the number
  of requests before an execution; prices come from the official pricing pages,
  Claude checked on 2026-11-25 and Gemini on 2026-11-27.
- **Dependencies:** `@anthropic-ai/sdk@1.12.0` (Apache-2.0), `@google/genai@3.6.1`
  (Apache-2.0, Node >= 22), and `unpdf@1.9.1` (MIT, the last release that
  supports Node 22) as exact dev dependencies.

### Provisional Gemini results

Gemini results answer the spike's approach question (extracted text versus
PDF) with real measurements, but they do not choose the model. The ADR stays
`proposed` and the Claude model choice (PRD 9.1) stays pending until the Claude
run, which needs only the key and `AGENT_SPIKE_PROVIDER=anthropic`.

- **Documentation:** spike results draft, ADR 0002, change summary.

### Assumption to confirm with the client

- **Term end from a duration (CF-2025-019, Ipojuca).** "12 months from the
  signature" (2025-12-10) is read as ending on 2026-12-09 (base + N months −
  1 day), which matches the answer key. It can also be read as ending on
  2026-12-10, which would move the notice deadline from 2026-11-24 to
  2026-11-25. The rule lives in one function (`src/modules/triage/term-end.ts`)
  so it can change once the client answers; until then the contract-deadlines
  task must not treat it as settled.

### In scope

- Environment variable, response schemas, notice deadline, agent prompt and
  request builder in `src/modules/triage/`.
- Spike tooling in `scripts/agent-spike/`: text extraction and its
  classification, answer-key loader, grader, pricing and cost, dry-run runner,
  and the provider interface with its Anthropic and Gemini adapters.
- Running approach A extraction on the 18 sample PDFs and recording the result.

### Out of scope

- Any call to the Anthropic API (blocked until the key arrives) or to the
  Gemini API (this change prepares the run; executing it is a separate step).
- Using Gemini in the production triage agent (IA-02).
- Rule-derived alerts that depend on the registry — blocked customer (RN-02),
  expired contract, similar or different registry names — which belong to
  deterministic code in IA-02; the grader reports them separately and does not
  score the model on them.
- Fetching reference data from the ERP; the spike uses the reference lists in
  the materials folder, and IA-02 will use the ERP through `erpClient`.
- Routes, persistence, human confirmation flow, and production triage.
- Upgrading the project to Node 24.
