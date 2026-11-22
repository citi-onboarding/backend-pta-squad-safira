# Node Boilerplate

A production-oriented foundation for TypeScript REST APIs. It keeps product decisions out of the core while making architecture, validation, tests, API contracts, documentation, and delivery verifiable.

## Included

- Node.js 22, TypeScript ESM, Express 5, PostgreSQL, and Prisma 7
- Zod runtime validation and generated OpenAPI 3.1 with Swagger UI
- RFC 9457 Problem Details, Helmet, CORS allowlist, rate limiting, and request IDs
- Structured Pino logs with credential redaction and no request-body logging
- Vitest, Supertest, Testcontainers, V8 coverage, and architecture tests
- OpenSpec workflow, ADRs, Prettier, ESLint, Husky, and a basic GitHub Actions check
- Non-root Docker image, local Compose stack, liveness, and database readiness
- Project initializer, module generator, and a removable database-backed example

Authentication, Redis, object storage, email, queues, and vendor-specific deployment are intentionally optional. Add them only when a product defines ownership and requirements.

## Requirements

- Node.js 22.12 or later
- pnpm 12 or later (enable it with `corepack enable`)
- Docker for PostgreSQL integration and container tests

## Start a project

After creating a repository from this template:

```bash
pnpm install --frozen-lockfile
pnpm init:project --name "Operations API"
docker compose up -d postgres
pnpm db:migrate --name initial
pnpm dev
```

The initializer updates project metadata, creates `.env`, removes the example module and its template-only migration, and refuses to run twice. When maintaining this boilerplate itself, copy `.env.example` to `.env` instead of running the initializer.

## Architecture

```text
src/app       HTTP composition and application wiring
    ↓
src/modules   Independent business capabilities
    ↓
src/shared    Domain-independent infrastructure
```

ESLint enforces the direction. A module cannot import another module, and shared code cannot import modules or application composition. Import concrete files directly; barrel files are prohibited.

## Development workflow directories

```text
openspec/
  specs/            Current executable specifications, grouped by business capability
  changes/          OpenSpec changes in progress
    archive/         Completed OpenSpec changes
docs/
  changes/          Change summaries created before an OpenSpec archive
  adr/              Architecture Decision Records
  templates/        Required templates for change summaries and ADRs
```

OpenSpec capabilities are named after business behavior, such as
`team-member-retrieval`; they are never named after routes, controllers, or
database tables.

## API and documentation

| Endpoint                | Meaning                                    |
| ----------------------- | ------------------------------------------ |
| `GET /health/live`      | Process liveness; no dependency check      |
| `GET /health/ready`     | Readiness based on a real PostgreSQL query |
| `GET /openapi.json`     | Generated OpenAPI 3.1 contract             |
| `GET /docs`             | Interactive Swagger UI                     |
| `/api/v1/example-items` | Removable example CRUD                     |

Zod schemas validate inputs and serialized responses and generate OpenAPI. Never maintain a second handwritten API contract. Run `pnpm openapi:generate` after changing a route contract; `pnpm verify` (and CI) fails if `openapi.json` is stale.

## Commands

| Command                           | Purpose                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                        | Start the API in watch mode                                  |
| `pnpm build`                      | Type-check and compile production JavaScript                 |
| `pnpm start`                      | Run the compiled server                                      |
| `pnpm verify`                     | Run static, unit, architecture, OpenSpec, and contract gates |
| `pnpm test:coverage`              | Enforce inherited-core coverage                              |
| `pnpm test:integration`           | Run PostgreSQL integration tests with Testcontainers         |
| `pnpm test:container`             | Build and smoke-test the production image                    |
| `pnpm spec:validate`              | Validate every OpenSpec artifact strictly                    |
| `pnpm skills:sync`                | Regenerate the Claude Code mirror of the CITi agent skills   |
| `pnpm gen:module team-members`    | Generate a module starter                                    |
| `pnpm remove:example`             | Safely remove the demonstration module                       |
| `pnpm init:project --name "Name"` | Customize a new project once                                 |

## SDD and TDD workflow

1. Read the current OpenSpec specifications for the affected business capability.
2. Create an OpenSpec change for every feature, behavior change, or relevant decision.
3. Obtain OpenSpec instructions for each required artifact, then review the proposal, specification delta, design, and tasks before writing code.
4. Define observable requirements and testable scenarios; update the specification before continuing if development exposes an ambiguity or missing edge case.
5. Follow Red-Green-Refactor: write a failing automated test for each applicable scenario, implement the minimum passing behavior, then improve the structure while keeping tests green.
6. Update Zod contracts, generated OpenAPI, and applicable unit, HTTP, integration, and architecture tests.
7. Create `docs/changes/<change-id>.md` from `docs/templates/change.md`. Create an ADR from `docs/templates/adr.md` for a cross-cutting, hard-to-reverse, or trade-off-heavy decision; otherwise record why an ADR is not applicable in the change summary.
8. Run the required verification gates and archive the accepted change only after tests, typecheck, and strict OpenSpec validation pass.

Small formatting and dependency-only changes may skip a specification delta only when the OpenSpec change explicitly declares that no behavior changed.

## Technical documentation

`docs/changes/` preserves the implementation record for each archived change:
its objective, changes made, resulting behavior, impact, validation results,
and links to the OpenSpec artifacts and ADRs. Do not remove template sections;
use `Not applicable` with a reason when a section does not apply.

ADRs capture durable decisions and their alternatives and consequences. Do not
create an ADR for a local, reversible change without a relevant trade-off.

## Agent skills

The CITi workflow skills are authored once, under `.agents/skills/citi-*`. Codex reads that directory directly; Claude Code only discovers skills under `.claude/skills/`, so `.claude/skills/citi-*` is a generated, git-ignored mirror of the same content. `pnpm install` and `pnpm install --frozen-lockfile` regenerate it through the `prepare` lifecycle script — by symlink where the filesystem allows it, by copy otherwise.

A clone where dependencies were never installed shows no CITi skills in Claude Code. Run `pnpm install` (or `pnpm skills:sync` on demand) to fix it. `pnpm skills:check` verifies both agent trees and fails with the exact command to run when the mirror is missing, stale, or was edited by hand. Never edit `.claude/skills/citi-*` directly — edit the source in `.agents/skills/` instead.

## Environment and secrets

Configuration is validated at startup. Keep real values in ignored `.env` files and secret stores. Do not commit credentials, log request bodies, or return stack traces and database errors to clients.

## Docker

```bash
docker compose up --build
curl --fail http://localhost:3001/health/live
curl --fail http://localhost:3001/health/ready
```

The image is provider-neutral. Deployment credentials, infrastructure creation, and production migrations belong to an environment-specific delivery repository or workflow.

See [Architecture](docs/architecture.md), [Contributing](CONTRIBUTING.md), and the [Boilerplate Guide](docs/boilerplate-guide.md).
