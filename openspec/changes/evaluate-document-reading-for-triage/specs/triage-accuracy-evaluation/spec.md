## Purpose

Defines how a triage approach is measured against the reviewed answer key, so
the choice of reading approach and model for the triage agent rests on scores,
latency, and cost rather than impressions.

## ADDED Requirements

### Requirement: Extraction quality classification

The evaluation SHALL classify each PDF's extracted text as `good`, `scrambled`,
or `empty` from objective measures: characters per page, and the share of the
answer key's expected terms (product descriptions and quantities, or contract
number and dates) found in the text in their original order.

#### Scenario: No text

- **WHEN** a PDF yields fewer than 20 non-space characters per page
- **THEN** it is classified `empty`

#### Scenario: Terms found in order

- **WHEN** at least 80% of the expected terms are found and they appear in the answer key's order
- **THEN** it is classified `good`

#### Scenario: Terms missing or out of order

- **WHEN** the text has enough characters but fewer than 80% of the expected terms are found, or found terms are out of order
- **THEN** it is classified `scrambled`

### Requirement: Answer key loading

The evaluation SHALL load the answer key and the alert-category mapping from a
directory outside the repository, validate both, and fail when a document,
alert, or code is missing or unknown.

#### Scenario: Valid answer key

- **WHEN** the answer key lists 12 orders and 6 contracts and every expected alert has a category
- **THEN** it is loaded with model-scored and registry-derived alerts separated

#### Scenario: Alert without category

- **WHEN** an expected alert has no entry in the mapping
- **THEN** loading fails and names the document and the alert position

#### Scenario: Mapping not reviewed

- **WHEN** the alert-category mapping is not marked as reviewed by the requester
- **THEN** loading fails

### Requirement: Order scoring

The grader SHALL score an order proposal per field, each from 0 to 1:
`cliente` (code equals), `itens` (F1 of product codes, where an expected item
without a code matches a proposed item without a code), `quantidades` (share of
matched items with the expected quantity), and `alertas` (F1 of model-scored
alert categories). A product proposed on more than one line SHALL count each
extra line as a wrong item and SHALL be compared on the sum of its quantities.

#### Scenario: Perfect order

- **WHEN** a proposal matches the answer key exactly
- **THEN** every field scores `1`

#### Scenario: Wrong customer

- **WHEN** the proposed customer code differs from the expected one
- **THEN** `cliente` scores `0` and the other fields are scored normally

#### Scenario: Missing and extra items

- **WHEN** the answer key has 5 items and the proposal has 4 of them plus 1 product not expected
- **THEN** `itens` scores `0.8`

#### Scenario: Wrong quantity

- **WHEN** all items match and one of 5 quantities differs
- **THEN** `quantidades` scores `0.8`

#### Scenario: Duplicated product line

- **WHEN** the answer key expects one line of `P00025` with `120`, and the proposal has two lines of `P00025` with `80` and `40`
- **THEN** `itens` is penalized for the extra line and `quantidades` counts `P00025` as correct

#### Scenario: Product substituted

- **WHEN** the answer key expects an item without a code and the proposal assigns it a catalog code
- **THEN** the item counts as missing and the substituted code as a wrong item

#### Scenario: No alerts expected

- **WHEN** the answer key expects no model-scored alerts and the proposal has none
- **THEN** `alertas` scores `1`

#### Scenario: Registry-derived alerts

- **WHEN** the answer key has registry-derived alerts for a document
- **THEN** they are listed separately in the report and do not affect any score

### Requirement: Contract scoring

The grader SHALL score a contract proposal per field: `cliente` (code equals),
`datas` (share of start, end, and notice deadline equal to the answer key; the
end is the proposed end or, when null, the end computed from the proposed
duration; the deadline is computed from that end by the notice-deadline rule), and `termos`
(share of number, notice days, automatic renewal, payment term, minimum volume,
and amendment equal to the answer key, with the payment term compared ignoring
case and spaces).

#### Scenario: Perfect contract

- **WHEN** a proposal matches the answer key exactly
- **THEN** `cliente`, `datas`, and `termos` score `1`

#### Scenario: Wrong end date

- **WHEN** the end date is wrong and the notice period is right
- **THEN** both end date and notice deadline count as wrong and `datas` scores `1/3`

#### Scenario: Term stated as a duration

- **WHEN** the answer key ends on `2026-12-09` and the proposal has end null, duration `12` months, and base date `2025-12-10`
- **THEN** the end and the notice deadline count as correct

#### Scenario: Amendment ignored

- **WHEN** the proposal carries the original minimum volume instead of the amended one
- **THEN** `termos` counts the minimum volume as wrong

### Requirement: Run report

The evaluation SHALL report, per approach and model, the mean score of each
field, the latency per document, the input, output, cache-write, and cache-read
tokens, and the cost computed from those tokens with the official prices and
the date they were checked. A response that fails the proposal contract, is
refused, or is truncated SHALL score `0` in every field and be counted
separately.

#### Scenario: Cost from usage

- **WHEN** a Claude Sonnet 5.5 response used 10,000 input and 1,000 output tokens
- **THEN** its cost is US$ 0.03

#### Scenario: Haiku long prompt

- **WHEN** a Claude Haiku 5.5 request's prompt, including cache reads and writes, is over 100,000 tokens
- **THEN** all of its tokens are priced at the long-prompt rates

#### Scenario: Invalid response

- **WHEN** a response does not satisfy the proposal contract
- **THEN** the document scores `0` in every field and is counted as invalid

### Requirement: No call without explicit execution

The run script MUST NOT call the model API unless it is run with an explicit
execution flag and a configured key. Without the flag it SHALL build every
request and report how many would be sent, without sending any.

#### Scenario: Dry run

- **WHEN** the run script is started without the execution flag
- **THEN** it reports the planned requests per approach and model and sends none

#### Scenario: Execution without a key

- **WHEN** the run script is started with the execution flag and no key
- **THEN** it stops before sending any request
