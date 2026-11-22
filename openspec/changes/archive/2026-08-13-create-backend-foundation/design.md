# Design: Backend foundation

The application composition layer wires independent modules to shared HTTP, database, configuration, and logging infrastructure. Each module owns its route, schema, service, repository, OpenAPI registration, and tests. Zod schemas are the executable contract and generate OpenAPI 3.1. PostgreSQL integration tests run migrations in an isolated container. Production delivery uses a non-root multi-stage Docker image with no provider-specific deployment workflow.
