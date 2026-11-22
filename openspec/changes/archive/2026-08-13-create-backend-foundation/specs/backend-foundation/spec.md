## ADDED Requirements

### Requirement: Operational health

The service SHALL expose liveness independently from dependencies and readiness based on a real PostgreSQL query.

#### Scenario: Process is alive

- **WHEN** a client requests `GET /health/live`
- **THEN** the service responds with status `200` and `{ "status": "ok" }`

#### Scenario: Database is unavailable

- **WHEN** PostgreSQL cannot answer the readiness query
- **THEN** `GET /health/ready` responds with status `503`

### Requirement: Executable HTTP contract

The service SHALL validate requests and responses with Zod schemas that also generate OpenAPI 3.1.

#### Scenario: Invalid input

- **WHEN** a request violates its Zod contract
- **THEN** the response uses RFC 9457 Problem Details with status `400`
