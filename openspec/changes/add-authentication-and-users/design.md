# Design: Authentication and user management

The decisions below follow task BACK-01, PRD section 4.2, RN-08, RN-14, and section 8, and the project manager's guidance on session storage and password hashing.

## Decisions

### Session

- The session is a signed token (JWT with HS256) created with the `jose` package and signed with `SESSION_SECRET`. The token carries only the user id and its expiration time. It never carries the role, the active flag, or the salesperson code.
- The token travels in an HttpOnly, SameSite=Lax cookie with path `/`. The cookie is `Secure` in production.
- The token and the cookie expire 8 hours after they are issued. Every authenticated request issues a new token and sets the cookie again, so the 8 hours count from the last use (sliding expiration).
- Sign-out clears the cookie on the client.
- On every protected request, the authentication middleware verifies the token, loads the user from the database by id, and rejects the request with 401 if the user does not exist or is inactive. The role, active flag, and salesperson code used by the request always come from the database.
- Cookies are read with the `cookie-parser` package.

### Passwords

- Passwords are hashed with argon2id using the default parameters of the `argon2` package. If the package fails to install on a team machine, the fallback is `bcrypt` with cost 12, reported in the pull request.
- Sign-in with an unknown email still runs a hash verification against a fixed dummy hash, so the response time does not reveal whether the email exists.
- Unknown email, wrong password, and inactive user return the same 401 problem response.

### Code organization

- Password hashing and token signing live in `src/shared/security`, because the `auth` module, the `users` module, and the seed all use them, and modules must not import each other.
- The authentication middleware, the role guard `requireRole(...roles)`, and the portfolio rule live in `src/shared/http/require-role.ts`. The user lookup is injected into the middleware, so it can be tested without a database.
- The `auth` module owns sign-in, sign-out, and the current user route. The `users` module owns user management.
- Errors use the existing `HttpProblem` and RFC 9457 problem responses. The users service checks for a repeated email or salesperson code before writing and the router answers 409.
- Besides the files listed in the task, each module has a Prisma repository and a `*.router.test.ts` file for the HTTP tests, and the auth module has PostgreSQL integration tests for sign-in, user management, and the seed.

### Environment

- `SESSION_SECRET` is required and must have at least 32 characters.
- The seed reads the development password from `SEED_PASSWORD` and fails when it is missing. Both variables are documented in `.env.example` with placeholder values only.

### Adjustments from the review of pull request #13

The project manager asked for the salesperson-code validation on update and for the ADR number to be settled by merge order; the developer also accepted the reviewer's suggestions, with the values below.

- Salesperson code on update: `PATCH /users/:id` accepts `codigoVendedor`. The service merges the request with the stored user and applies the create rule to the result: a salesperson without a code answers 400, and a code linked to another user answers 409. A user who leaves the salesperson role keeps the code, which is no longer used.
- Last administrator: before deactivating or changing the role of an active administrator, the service counts the other active administrators; when there are none, it answers 409 ("At least one active administrator is required.").
- Emails: the request schemas trim and lowercase the email before validating it, on create and on sign-in, so the stored value and the lookup always match. `PATCH` does not change emails.
- Simultaneous creation: the repository maps Prisma's unique-constraint error (`P2002`) to the same conflict error the service already raises, so the router answers 409 instead of 500.
- Passwords: the create and reset schemas require at least 8 characters. Sign-in keeps accepting any non-empty password, so existing passwords still work.
- Sign-in limit: a dedicated `express-rate-limit` instance on `POST /auth/login` allows 10 attempts per minute per IP address and answers 429. Unlike the global limit, it also runs in tests, so the limit itself is tested; tests that sign in many times receive a higher limit through the application options.
- The ADR already records that a copied cookie stays valid until it expires (Consequences, Negative), so it does not change.

### Adjustments from the second review of pull request #13

- Trusted proxies: `TRUST_PROXY` (a whole number, default `0`) is passed to Express's `trust proxy` setting. With `0`, the sign-in limit counts the address of the connection and ignores `X-Forwarded-For`, so a client cannot dodge the limit by sending the header. Behind a reverse proxy in production, it must be set to the number of proxies; otherwise every user shares the proxy's address and the same 10 attempts per minute.
- Portfolio filter for listings: `clientPortfolioFilter(user)` in `src/shared/http/require-role.ts` returns the client filter for a user: `{}` for the sales manager and the finance role, `{ codigoVendedor }` for a salesperson, and `null` (no client) for a salesperson without a code and for the administrator. It applies the same rule as `canAccessClient` to lists and searches (BACK-05).
- Last administrator under concurrency: the check and the update run in one database transaction that first locks the rows of the active administrators (`SELECT ... FOR UPDATE`). Two administrators who deactivate each other at the same time are serialized, and the second change sees only one active administrator left and answers 409.
- The OpenAPI summary of `PATCH /users/{id}` mentions the salesperson code.

## Rejected alternatives

- Session table in the database: it gives a real server-side sign-out, but it needs a new migration and an extra schema review that would delay FRONT-01 and BACK-05. Rejected by the project manager.
- Role and salesperson code inside the token: they would stay outdated until the token expires after an administrator changes them.
- `express-session`: it needs a session store, which brings back the session table.
- `bcryptjs`: much slower than the native packages.

## Known limitations

- A cookie copied before sign-out stays valid until it expires, at most 8 hours after its last use. The database check on every request limits the impact, because deactivating the user blocks it immediately.
- Resetting a password does not end the sessions that are already open. If a password leaks, the administrator must deactivate the user, reset the password, and keep the user inactive for 8 hours before reactivating them, so every copied cookie expires.
- The cookie is SameSite=Lax, so the browser sends it only when the web app and the API are on the same site (the same registrable domain, such as `portal.distrilux.com.br` and `api.distrilux.com.br`). Hosting them on different sites, such as two different `*.vercel.app` or `*.onrender.com` names, breaks sign-in.

## Open points for the team

- A salesperson must have a salesperson code when created (kickoff answer: "the ideal is to have the code at registration"); since the review of pull request #13, the same rule applies on update.
- ADR number: BACK-02 (#12) also adds an ADR numbered 0001, so this change's ADR is numbered 0002 (`docs/adr/0002-signed-session-token-and-argon2id.md`), following the project manager's rule for the clash.
- The first administrator in production: the kickoff mentioned an initial administrator account, but today it only exists through the development seed.
