# Contributing

## Package manager

This repository uses pnpm, pinned in the `packageManager` field. Run
`corepack enable` once; Corepack then resolves the exact pinned version, so
there is no global pnpm to keep in sync. The `preinstall` script refuses any
other package manager, and `pnpm-lock.yaml` is the only lockfile.

Project-level pnpm settings live in `pnpm-workspace.yaml`, not in
`package.json`. That file also carries the dependency
`overrides` block, including the esbuild security pin. Dependency build scripts are disabled by default: when an
install reports ignored build scripts, decide case by case with
`pnpm approve-builds` and leave a comment saying why each one is allowed or
denied.

## Change workflow

The steps below are also available as agent skills, which run the same flow and
read this repository's own rules instead of restating them: `citi-playbook`
routes, `citi-task-spec` bounds the demand, `openspec-propose` creates the
planning artifacts, `citi-tdd-cycle` implements, `citi-verify-scope` runs the
right gates, `citi-close-change` writes the change summary and evaluates the
ADR, `citi-review-change` reviews, `citi-prepare-pr` writes the pull request,
and `openspec-archive-change` archives. They work in Claude Code (`/name`) and
in Codex (`$name`).

The skills live in `.agents/skills/`; `.claude/skills/` mirrors them for Claude
Code. After editing one, run `pnpm skills:sync`. When regenerating the
OpenSpec skills, always pass both targets — the selection is stored in a global
profile, so omitting one produces a different tree for the next person:

```bash
pnpm exec openspec init --tools claude,codex
```

`pnpm skills:check` verifies that both agents can discover every skill; it is
part of `pnpm verify`.

Every feature, behavior change, migration, consequential refactor, or relevant
technical decision starts with an OpenSpec change. Organize specifications by
business capability, never by HTTP route, controller, or database table.

Before writing production code or automated tests:

1. Read the current specification for the affected capability.
2. Create the OpenSpec change and obtain instructions for every required artifact.
3. Complete and review the proposal, specification delta, design when applicable,
   and tasks.
4. Define observable requirements and scenarios that can be converted into tests.

If implementation exposes an ambiguity, missing edge case, or technical
constraint that changes the intended behavior, update the OpenSpec artifacts
before continuing.

Follow Red-Green-Refactor:

1. Write a failing automated test for each applicable specification scenario.
2. Implement the minimum behavior needed to make the test pass.
3. Refactor without changing behavior and rerun the relevant tests.

Do not mock the system under test. Mock or fake external dependencies only when
needed for fast, isolated tests.

## Technical documentation and decisions

Before archiving an OpenSpec change, create or update
`docs/changes/<change-id>.md` using `docs/templates/change.md`. Record the
objective, changes made, resulting behavior, impact, validations, result, and
links to the OpenSpec artifacts.

Create an ADR in `docs/adr/` using `docs/templates/adr.md` when the change
introduces a cross-cutting, hard-to-reverse, or trade-off-heavy decision. Do not
create an ADR for a local, reversible change without a relevant trade-off; state
`Not applicable` and the rationale in the change summary instead.

Do not remove mandatory template sections. Use `Not applicable` with a reason
when a section does not apply.

## Architecture

- Compose modules only in `src/app`.
- Keep business capabilities independent in `src/modules`.
- Put only domain-independent infrastructure in `src/shared`.
- Never import one module from another; coordinate them in the app layer or promote genuinely generic code.
- Use kebab-case and concrete imports; do not create barrel files.

## Contracts and database changes

- Validate request params, query, body, and external data with Zod.
- Validate serialized responses before sending them.
- Generate OpenAPI from the same schemas; do not duplicate it manually.
- Commit every production schema change as a Prisma migration.
- Never edit or delete an applied migration. Create a corrective migration.
- State compatibility, rollout, and rollback considerations in the pull request.

## Security and logging

- Do not log bodies, credentials, cookies, authorization headers, tokens, or personal data.
- Do not expose internal errors or stack traces to clients.
- Keep authentication, authorization, and external credentials product-specific.
- Review every new dependency and environment variable.

## Verification

During development, run the narrowest relevant test. Before opening a pull request, run:

```bash
pnpm format:check
pnpm verify
pnpm test:coverage
pnpm test:integration
pnpm build
```

Run `pnpm test:container` when changing runtime delivery, migrations, health checks, or Docker behavior.

## Merge rules

The protected branches are `main` and `develop`. GitHub enforces most of these rules, so a
pull request cannot be merged until they are met:

- Open a pull request; never push directly to a protected branch.
- At least one approval from another squad member is required. Authors cannot
  approve their own pull request. Developers review each other; the Project
  Manager is not the only reviewer.
- The `CI` workflow (job `Format, verify, and build`) must pass, and the branch must be up to
  date with its target. Do not skip or disable checks.
- Resolve every review conversation before merging. A new commit dismisses
  earlier approvals, so ask for a fresh review.
- Changes to the paths in `.github/CODEOWNERS` (high-risk code, such as
  `.github/` and, in the backend, `prisma/`) also need the listed code owner's
  approval. GitHub requires it, so another developer's approval is not enough
  for those paths.
- Force pushes and branch deletion are blocked.

These rules are agreed by the team, because GitHub does not enforce them:

- Repository admins can bypass the protection. Do not use that to merge your
  own work without a review.
- Prefer squash merge for feature branches. Use a merge commit when syncing
  `main` into `develop`, so both histories stay aligned.
