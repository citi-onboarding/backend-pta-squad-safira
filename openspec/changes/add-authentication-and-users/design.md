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

## Rejected alternatives

- Session table in the database: it gives a real server-side sign-out, but it needs a new migration and an extra schema review that would delay FRONT-01 and BACK-05. Rejected by the project manager.
- Role and salesperson code inside the token: they would stay outdated until the token expires after an administrator changes them.
- `express-session`: it needs a session store, which brings back the session table.
- `bcryptjs`: much slower than the native packages.

## Known limitations

- A cookie copied before sign-out stays valid until it expires, at most 8 hours after its last use. The database check on every request limits the impact, because deactivating the user blocks it immediately.

## Open points for the team

- A salesperson must have a salesperson code when created (kickoff answer: "the ideal is to have the code at registration"). `PATCH /users/:id` follows the task and does not change the code, so a user whose role changes to salesperson has no portfolio until a decision is made about linking a code after creation.
- The first administrator in production: the kickoff mentioned an initial administrator account, but today it only exists through the development seed.
