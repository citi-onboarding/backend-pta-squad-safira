# Tasks

## SDD

- [x] Write the proposal, the access-control and user-management specs, and the design.
- [ ] Confirm the open points with the project manager and update the specs and the design.

## Red

- [x] Developer writes unit tests for password hashing: a hash never equals the password, the right password verifies, and a wrong one does not.
- [x] Developer writes unit tests for the session token: a valid token returns the user id, and a tampered or expired token is rejected.
- [x] Developer writes unit tests for the authentication middleware and the role guard: no session (401), inactive user (401), wrong role (403), allowed role, role read from the database, and cookie renewal.
- [x] Developer writes unit tests for the portfolio rule: own portfolio, another portfolio, manager or finance, and salesperson without a code.
- [x] Developer writes integration tests for sign-in, current user, sign-out, and a tampered cookie.
- [x] Developer writes integration tests for user management: administrator only, list without hashes, create (201, 409, 400, salesperson without code, duplicated salesperson code), update (deactivate, change role, 404), and password reset.
- [x] Developer writes tests for the seed: seeded users sign in, and the seed stops without `SEED_PASSWORD`.
- [x] Run the tests and confirm that they fail for the expected reason.

## Green

- [x] Add `argon2`, `jose`, and `cookie-parser`, and record the `argon2` build script decision in `pnpm-workspace.yaml`.
- [x] Add `SESSION_SECRET` to `src/shared/config/env.ts`, and `SESSION_SECRET` and `SEED_PASSWORD` to `.env.example` with placeholder values.
- [x] Implement password hashing in `src/shared/security`.
- [x] Implement the session token in `src/shared/security`.
- [x] Implement the authentication middleware, the role guard, and the portfolio rule in `src/shared/http/require-role.ts`.
- [x] Generate and implement the `auth` module: sign-in, sign-out, and current user.
- [x] Generate and implement the `users` module: list, create, update, and password reset.
- [x] Register `cookie-parser` and the new routes in `src/app/create-app.ts`.
- [x] Make the seed use the shared password hashing and require `SEED_PASSWORD`.
- [x] Regenerate `openapi.json`.

## Refactor

- [x] Review names, duplication, and logs, keeping emails, passwords, hashes, and cookies out of every log line.
- [x] Run the tests again after refactoring.

## Consolidation

- [x] Write the ADR for session storage and password hashing in `docs/adr/`, using `docs/templates/adr.md`.
- [x] Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, `pnpm test:integration`, and `pnpm build`.
- [x] Run `openspec validate add-authentication-and-users --strict`.
- [x] Open the pull request to `develop`, noting the dependency on `feat/prismaSchema`, the new `src/shared/security` folder, and the open points.

## Review of pull request #13

- [x] Update the specs and the design with the review adjustments: salesperson code on update, last active administrator, emails trimmed and lowercased, 409 for simultaneous creation, 8-character passwords, and 10 sign-in attempts per minute.
- [x] Red: developer writes the failing tests for each new scenario and runs them.
- [x] Green: implement the minimal code and regenerate `openapi.json`.
- [x] Refactor: keep every test green.
- [x] Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, `pnpm test:integration`, and `pnpm build`, and `openspec validate add-authentication-and-users --strict`.
- [x] Rename the ADR to 0002 to avoid the clash with the BACK-02 ADR 0001.

## Second review of pull request #13

- [x] Rebase the branch on `develop`, after DATA-01 was merged.
- [x] Update the specs and the design: trusted proxies for the sign-in limit, portfolio filter for listings, last administrator under concurrency, and the known limitations of password reset and SameSite.
- [x] Red: developer writes the failing tests for each new scenario and runs them.
- [x] Green: implement the minimal code and regenerate `openapi.json`.
- [x] Refactor: keep every test green.
- [x] Record the known limitations in the ADR.
- [x] Run `pnpm format:check`, `pnpm verify`, `pnpm test:coverage`, `pnpm test:integration`, and `pnpm build`, and `openspec validate add-authentication-and-users --strict`.
