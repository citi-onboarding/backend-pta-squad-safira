---
title: ADR-0002
status: accepted
date: 2026-11-25
owners: ["Luana Allatta Guerra"]
tags: [security, authentication]
supersedes: null
superseded_by: null
---

# 0002: Signed session token in a cookie and argon2id password hashing

## Context

Task BACK-01 adds sign-in, sign-out, four roles, and user management to the DistriLux order portal. Almost every later endpoint depends on it. The task requires a session in an HttpOnly, SameSite cookie that expires after 8 hours without use, inactive users that cannot get in, and passwords that are never stored or returned in plain text (PRD sections 4.2 and 8). It leaves open how the session is stored and which password hash is used (argon2 or bcrypt).

## Decision

- The session is a JWT signed with HS256 by the `jose` package, using `SESSION_SECRET` (at least 32 characters). It carries only the user id and its issue and expiration times.
- The token travels in the `distrilux_session` cookie: HttpOnly, SameSite=Lax, path `/`, and Secure in production. It expires 8 hours after it is issued, and every authenticated request issues a new one, so the 8 hours count from the last use.
- On every protected request, the authentication middleware loads the user from the database by id. The active flag, role, and salesperson code always come from the database, never from the token, so deactivating a user or changing a role takes effect on the next request.
- Passwords are hashed with argon2id using the default parameters of the `argon2` package. The fallback, if the package cannot be installed, is `bcrypt` with cost 12.
- Password hashing and token signing live in `src/shared/security`; the middleware, role guard, and portfolio rule live in `src/shared/http/require-role.ts`.

The project manager chose the token approach and argon2id for this project.

## Consequences

### Positive

- No new table or migration, so the schema from DATA-01 stays as reviewed and FRONT-01 and BACK-05 are not delayed.
- Role changes and deactivation apply immediately, because every request reads the user from the database.
- argon2id is the first recommendation of OWASP for password storage.

### Negative

- Sign-out only removes the cookie from the browser. A cookie copied before sign-out stays valid until it expires, at most 8 hours after its last use.
- Resetting a password does not end the sessions that are already open. If a password leaks, the administrator must deactivate the user, reset the password, and keep the user inactive for 8 hours before reactivating them, so every copied cookie expires.
- SameSite=Lax means the browser sends the cookie only when the web app and the API are on the same site (the same registrable domain, such as `portal.distrilux.com.br` and `api.distrilux.com.br`). The deployment must follow this; two different `*.vercel.app` or `*.onrender.com` names would break sign-in.
- Behind a reverse proxy, `TRUST_PROXY` must be set to the number of proxies. Otherwise every user shares the proxy's address, and with it the limit of 10 sign-in attempts per minute.
- Every protected request makes one database lookup by primary key.
- `argon2` ships native code. Prebuilt binaries exist for Windows x64, Linux x64, and macOS arm64, so its build script is not approved; a machine without a prebuilt binary, such as an Intel Mac, would need the bcrypt fallback.

## Alternatives considered

### Session table in the database

It gives a real server-side sign-out, but it needs a new migration and an extra schema review that would delay FRONT-01 and BACK-05. Rejected by the project manager.

### Role and salesperson code inside the token

It would avoid the database lookup, but a role change or deactivation would only apply when the token expires.

### bcrypt

Also safe, but older and limited to 72 bytes of password. Kept as the fallback.

## References

- OpenSpec change: `openspec/changes/add-authentication-and-users/`
- PRD sections 4.2 (roles), 8 (security), and RN-08 (portfolio)
- Task BACK-01 in the Squad Safira backlog
