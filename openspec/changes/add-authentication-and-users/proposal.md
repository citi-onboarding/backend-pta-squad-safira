# Proposal: Add authentication and user management

## Why

Almost every route of the DistriLux order portal needs to know who is signed in and what that person may do (PRD 4.2). Without authentication, FRONT-01, BACK-05, and every authenticated endpoint of sprints 2 and 3 are blocked.

## What changes

- Add sign-in with email and password, sign-out, and a route that returns the current user (`id`, `nome`, `papel`).
- Keep the session as a signed token in an HttpOnly, SameSite cookie that expires after 8 hours without use and is renewed on every authenticated request.
- On every protected request, load the user from the database by id and use the current active flag, role, and salesperson code from the database, never the values inside the token.
- Store passwords only as argon2id hashes with the default parameters of the `argon2` package. Never return or log a password or a hash.
- Return the same error for an unknown email and a wrong password.
- Add a reusable role guard that answers 401 without a session and 403 with the wrong role.
- Add user management for the Administrator role only: list, create, update name, role and active flag, and reset a password. Inactive users cannot sign in.
- Link a salesperson to the ERP salesperson code that defines the portfolio (RN-08).
- Make the seed hash passwords with the same function as sign-in and read the passwords from the environment only.

## Impact

- API: new `/auth` and `/users` routes, published in `openapi.json` for FRONT-01.
- Database: no migration. The change uses the existing `Usuario` model.
- Security: password hashing, signed HttpOnly cookie, generic credential error, role checks on the server (PRD 8). New environment variables for the session secret and seed passwords. Known limitation: a cookie copied before sign-out stays valid until it expires; the database check on every request still blocks inactive users and applies role changes immediately.
- Observability: sign-in failures are logged without email, password, or cookie values.
- Documentation: an ADR for session storage and password hashing.

## In scope

- `auth` and `users` modules, the role guard, environment variables, and seed changes.

## Non-goals

- A session table or any schema change.
- The sign-in screen and the users screen (FRONT-01 and FRONT-12).
- Filtering clients and orders by portfolio in their own endpoints (BACK-05 and later). This change only provides the portfolio rule and its test.
- Password recovery by email and self sign-up (PRD 5.4).
