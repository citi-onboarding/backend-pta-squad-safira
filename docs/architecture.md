# Architecture

## Dependency direction

`src/app → src/modules → src/shared`

The app layer owns HTTP composition and dependency wiring. A module owns one business capability and may import itself and shared infrastructure. Shared code owns generic configuration, database, HTTP, logging, and test utilities. ESLint and versioned fixtures enforce these rules.

## Module anatomy

The example demonstrates the expected roles without requiring every module to contain every file:

- schemas define executable request and response contracts;
- routers translate HTTP into service calls;
- services implement use cases and domain errors;
- repositories isolate Prisma queries;
- OpenAPI registration reuses the schemas;
- tests prove scenarios at the lowest useful layer.

Modules do not call one another directly. Cross-capability workflows are composed in `src/app` or through an explicit application service owned by the composition layer.

## HTTP boundaries

Invalid input produces RFC 9457 Problem Details. Expected domain failures use `HttpProblem`; unexpected failures are logged internally and returned as a generic `500`. Request IDs flow in `x-request-id` and are generated when absent.

## Database lifecycle

Prisma Client is constructed with the PostgreSQL driver adapter. Migrations are immutable after deployment. Liveness does not query dependencies; readiness runs a real database query. Shutdown closes the HTTP server before disconnecting Prisma.

## Optional capabilities

Authentication, authorization, Redis, object storage, email, queues, and observability vendors remain outside the core. Introduce them behind shared adapters only after a product defines security, failure, and ownership requirements.
