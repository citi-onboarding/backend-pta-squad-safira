# DistriLux Portal API

Backend of the DistriLux order portal. It serves customers, products, receivables, and orders to the portal and is the only component that talks to the DistriLux ERP. The ERP key stays on the server (RN-14), and monetary values travel as integer cents (RN-13).

## Stack

- Node.js 22, TypeScript ESM, Express 5, PostgreSQL, and Prisma 7
- Zod runtime validation and generated OpenAPI 3.1 with Swagger UI
- RFC 9457 Problem Details, Helmet, CORS allowlist, rate limiting, and request IDs
- Structured Pino logs with credential redaction and no request-body logging
- Vitest, Supertest, Testcontainers, V8 coverage, and architecture tests
- OpenSpec workflow, ADRs, Prettier, ESLint, Husky, and a basic GitHub Actions check
- Non-root Docker image, local Compose stack, liveness, and database readiness
- Module generator
- Typed, resilient ERP client in `src/shared/erp` (see [ERP integration](#erp-integration))

## Requirements

- Node.js 22.12 or later
- pnpm 12 or later (enable it with `corepack enable`)
- Docker for PostgreSQL integration and container tests

## Local setup

```bash
git clone https://github.com/citi-onboarding/backend-pta-squad-safira.git
cd backend-pta-squad-safira
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres
pnpm dev
```

The default `.env.example` database values work with the Compose PostgreSQL
service, whose database is named `distrilux_portal`. If you used the Compose
database before it was renamed from `node_boilerplate`, update `DATABASE_URL` in
your `.env` and recreate the volume with `docker compose down -v`. A hosted
PostgreSQL, such as Neon, works too: point `DATABASE_URL` at it.

`ERP_API_URL` and `ERP_API_KEY` are required; the server does not start without
them. The ERP and AI credentials are not in the repository; ask the Project
Manager for them through a secure channel and keep them only in your local `.env`.

Before opening a pull request, run `pnpm format:check`, `pnpm verify`,
`pnpm test:coverage`, `pnpm test:integration`, and `pnpm build`.

### Windows notes

- Use pnpm 12 for this repository. If `pnpm --version` prints an older major, or
  a commit hook fails with `pnpm` not recognized, install it once with
  `npm install -g pnpm@12.5.1` (or run `corepack enable` from an administrator
  terminal) and open a new terminal.
- Docker Desktop must be running before `docker compose` or the integration
  tests.

## Architecture

```text
src/app       HTTP composition and application wiring
    ↓
src/modules   Independent business capabilities
    ↓
src/shared    Domain-independent infrastructure
```

ESLint enforces the direction. A module cannot import another module, and shared code cannot import modules or application composition. Import concrete files directly; barrel files are prohibited.

## ERP integration

`src/shared/erp/erp-client.service.ts` is the only code that calls the DistriLux
ERP. Modules depend on the `ErpClient` interface, injected through `createApp`,
and never see HTTP. The client sends the key in `X-Api-Key`, bounds every call
with a 30-second timeout, retries reads on `5xx` and timeouts, honors
`Retry-After` on `429` and `503`, submits orders exactly once with an
`Idempotency-Key`, validates every answer with Zod, and reports failures as
`ErpIndisponivelError`, `ErpLimiteDeUsoError`, or `ErpRecusouError`, which the
Problem Details handler returns to clients. `src/shared/money.ts` converts and
formats ERP cents. The behavior is specified in `openspec/` under the
`erp-integration` and `monetary-values` capabilities.

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

| Endpoint            | Meaning                                    |
| ------------------- | ------------------------------------------ |
| `GET /health/live`  | Process liveness; no dependency check      |
| `GET /health/ready` | Readiness based on a real PostgreSQL query |
| `GET /openapi.json` | Generated OpenAPI 3.1 contract             |
| `GET /docs`         | Interactive Swagger UI                     |

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
