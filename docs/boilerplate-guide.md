# Boilerplate Guide

## Implementing a feature

Start every feature, behavior change, or relevant technical decision with an
OpenSpec change. Organize it by business capability, never by route, controller,
or database table.

Before creating production code or automated tests:

1. Read the current specification for the affected capability.
2. Create the OpenSpec change and obtain instructions for its required artifacts.
3. Complete and review the proposal, specification delta, design when applicable,
   and tasks.
4. Convert specification scenarios into automated test cases.

After the OpenSpec artifacts are ready, run:

```bash
pnpm gen:module module-name
```

The generator creates only a structural starting point. Replace its TODO test
with tests derived from the approved specification scenarios.

## Following TDD

Use the Red-Green-Refactor cycle for every applicable behavior:

1. Red: write a failing test derived from an OpenSpec scenario.
2. Green: implement the minimum behavior required to make the test pass.
3. Refactor: improve structure without changing behavior and rerun the tests.

Do not mock the system under test. Replace only injected dependencies, such as
repositories, clocks, queues, or third-party clients, when isolation is needed.

## Dependency injection and testability

The application composition layer in `src/app` wires concrete implementations.
A use case receives ports or interfaces through its constructor and must not
instantiate Prisma, databases, HTTP clients, or third-party SDKs directly.

Keep responsibilities separated:

- Router/controller: parses HTTP input and returns HTTP responses.
- Use case/service: applies business rules and orchestrates dependencies.
- Repository/adapter: persists data or communicates with external systems.

Use cases should not depend on Prisma-specific errors or HTTP error types.
Translate infrastructure errors in adapters and domain errors at the HTTP boundary.

## Defining an endpoint

Create strict Zod schemas for all inputs and for the serialized response. Register the same schemas with the shared OpenAPI registry and mount the router in the app layer. Generate `openapi.json`, add Supertest coverage, and add a PostgreSQL integration test when persistence behavior changes.

Every input, output, error, authorization, and security scenario in the OpenSpec
must have suitable automated coverage. Use the same Zod schemas for runtime
validation, serialized response validation, and generated OpenAPI.

## Adding authentication

Authentication is not part of transport. A product should define credential transport, token/session lifetime, revocation, rotation, CSRF protection, identity-provider failure behavior, and authorization ownership before selecting a library. Inject the authenticated principal into request context without logging credentials or personal data.

## Adding Redis, storage, or email

Create a narrow shared adapter with an injectable interface, validate its environment configuration, define timeout/retry/idempotency behavior, and test failures without contacting a real vendor. A capability-specific module owns business decisions such as cache keys, file visibility, and notification templates.

## Coverage policy

Inherited shared infrastructure has numeric gates: 90% statements, functions, and lines and 85% branches. Feature acceptance depends on risk and scenarios, not a single global percentage. Every bug fix needs a regression test, and critical behavior needs integration coverage.

## Production migrations

Generate migrations during development, review SQL, commit it, and use `prisma migrate deploy` during a controlled release. Never run `migrate dev`, `db push`, reset, or delete migration history in production.

## Selecting the test level

- Use unit tests for business rules in use cases, with fake or mocked injected ports.
- Use HTTP tests for request validation, serialization, status codes, and Problem Details.
- Use PostgreSQL integration tests for persistence behavior, migrations, and complete flows.
- Name or link tests so their relationship to OpenSpec scenarios is clear.

## Documenting completed changes

Before archiving an OpenSpec change, create
`docs/changes/<change-id>.md` from `docs/templates/change.md`.

Create an ADR from `docs/templates/adr.md` for cross-cutting, hard-to-reverse,
or trade-off-heavy decisions. For a local and reversible change, do not create
an ADR; record `Not applicable` and the rationale in the change summary.

## Consolidating a change

Before archiving:

1. Update generated OpenAPI when the HTTP contract changes.
2. Create or update the change summary and evaluate the ADR requirement.
3. Run the narrowest relevant test, then all applicable verification gates.
4. Confirm tests, typecheck, and strict OpenSpec validation pass.
5. Archive the accepted change.
