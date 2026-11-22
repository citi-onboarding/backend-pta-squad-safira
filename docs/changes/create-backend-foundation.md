---
change_id: create-backend-foundation
date: 2026-09-16
status: shipped
owners: []
tags: [foundation, backend, tooling]
related_adrs: []
openspec_change: openspec/changes/archive/2026-08-13-create-backend-foundation/
---

# Create the backend foundation

> **Written retroactively.** This document was reconstructed on 2026-09-16, after
> the change had already been archived on 2026-08-13 without one. The flow
> requires the change document to be written during Consolidation, precisely so
> that the result of each validation is recorded as it happened; those original
> results were not preserved. The validations recorded below are re-runs at the
> time of writing, not the ones that gated the original archive. Treat this
> document as the current state of the foundation, not as evidence of what was
> verified in August.

## Objective

Replace a backend template that was coupled to a specific product, had almost no
meaningful tests, duplicated its API documentation, and mixed deployment
provisioning with reusable application concerns. The goal was a product-neutral
foundation whose quality rules are executable rather than written down.

## Change made

- A product-neutral Express and Prisma foundation, organized as
  `src/app → src/modules → src/shared` with dependencies flowing in one direction.
- Validation, OpenAPI generation, tests, migrations, logging, and documentation
  turned into executable quality gates rather than conventions: `pnpm verify`
  bundles typecheck, lint, unit tests, architecture tests, strict OpenSpec
  validation, and the OpenAPI contract check.
- OpenAPI generated from the same Zod schemas used for runtime validation, with
  `openapi:check` failing when the committed contract drifts from the code.
- Architecture tests that run ESLint programmatically against deliberately invalid
  fixtures, so a boundary violation fails a test rather than a review.
- Project initialization and module generation tooling (`init:project`,
  `gen:module`), plus a removable example module (`remove:example`) that preflights
  every marker before mutating anything.
- CI, Docker delivery, and the documentation set under `docs/`.

## Resulting behavior

- A repository created from this template starts product-neutral; `pnpm init:project`
  renames it and `pnpm remove:example` removes the example module without
  leaving dangling references.
- Request params, query, body, and external data are validated with Zod, and
  serialized responses are validated before being sent.
- `openapi.json` is generated from the same schemas; `pnpm openapi:check` fails
  when it no longer matches the executable contract.
- A module importing another module, or `src/shared` importing an application
  layer, fails `pnpm test:architecture`.
- Logs contain no bodies, credentials, cookies, authorization headers, tokens, or
  personal data; internal errors and stack traces are not exposed to clients.
- The production container builds and answers its health check.

## Impact

This change created the repository, so it has no external consumers to break and
no backward compatibility to preserve. Its impact is forward-looking: it
establishes the layer boundaries, the validation strategy, and the gate set that
every later change in this repository must satisfy.

Out of scope, and explicitly non-goals at the time: authentication, Redis, object
storage, email, provider-specific deployment, and migrating the existing BPV
product.

## Validations executed

Re-run on 2026-09-16 while writing this document. See the notice at the top.

| Command                  | Result                                     |
| ------------------------ | ------------------------------------------ |
| `pnpm format:check`      | passed                                     |
| `pnpm typecheck`         | passed                                     |
| `pnpm lint`              | passed                                     |
| `pnpm test`              | passed — 10 test files, 24 tests           |
| `pnpm test:architecture` | passed — 1 test file, 3 tests              |
| `pnpm spec:validate`     | passed — `spec/backend-foundation`, 1 item |
| `pnpm openapi:check`     | passed                                     |
| `pnpm test:coverage`     | passed — 10 test files, 24 tests           |
| `pnpm build`             | passed                                     |
| `pnpm skills:check`      | passed                                     |
| `pnpm test:integration`  | not run — requires a PostgreSQL instance   |
| `pnpm test:container`    | not run — requires a Docker daemon         |

The last two are not claimed as passing. They run in CI, in the `integration` and
`container` jobs.

## Related artifacts

- Proposal: `openspec/changes/archive/2026-08-13-create-backend-foundation/proposal.md`
- Specification delta: `openspec/changes/archive/2026-08-13-create-backend-foundation/specs/backend-foundation/spec.md`
- Design: `openspec/changes/archive/2026-08-13-create-backend-foundation/design.md`
- Tasks: `openspec/changes/archive/2026-08-13-create-backend-foundation/tasks.md`
- Consolidated specification: `openspec/specs/backend-foundation/spec.md`
- ADR: pending evaluation. This change introduced Express and Prisma as
  infrastructure providers and established the `app → modules → shared` boundary —
  decisions that meet the criteria in `docs/adr/README.md`. No ADR was written at
  the time and none is created here, because writing the founding architectural
  decisions of the repository is a call for the team rather than a retroactive
  reconstruction. Recorded as an open item, not as `Not applicable`.

## Usage

Not applicable. This change created the repository itself; day-to-day usage is
covered by `README.md` and `docs/boilerplate-guide.md`.

## Implementation notes

- `pnpm db:generate` must run before `typecheck`, `test`, or `build` in a fresh
  clone; the generated Prisma client lives in `src/shared/database/generated` and
  is not committed.
- The example module carries explicit begin and end markers consumed by
  `scripts/remove-example.mjs`. Editing those markers by hand breaks removal,
  which preflights every expected marker before mutating anything.
