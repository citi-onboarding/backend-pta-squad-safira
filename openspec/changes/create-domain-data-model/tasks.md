# Tasks

## SDD

- [x] Specify the domain tables, unique keys, money type, and seed outcomes.

## Red

- [x] Developer writes the verification steps: migration on an empty database, seed run twice, and unique key checks.

## Green

- [x] Write the 13 models and 10 enums in `prisma/schema.prisma`.
- [x] Generate the initial migration `20261124000000_init`.
- [x] Write the idempotent seed and add the `db:seed` script.

## Refactor

- [x] Format with Prettier and review relation names and indexes.

## Consolidation

- [x] Run `pnpm db:migrate` on an empty database.
- [x] Run `pnpm db:seed` twice without errors.
- [x] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `openspec validate create-domain-data-model --strict`.
- [ ] Get schema review from Luana and Beatriz and approval from the Project Manager.
