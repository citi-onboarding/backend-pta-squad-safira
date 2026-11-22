# Backend Foundation Specification

## Purpose

Define the reusable operational, contract, observability, and initialization behavior every backend created from this template inherits.

## Requirements

### Requirement: Operational health

The service SHALL expose liveness independently from dependencies and readiness based on a real PostgreSQL query.

#### Scenario: Process is alive

- **WHEN** a client requests `GET /health/live`
- **THEN** the service responds with status `200` and `{ "status": "ok" }`

#### Scenario: Database is unavailable

- **WHEN** PostgreSQL cannot answer the readiness query
- **THEN** `GET /health/ready` responds with status `503`

### Requirement: Executable HTTP contract

The service SHALL validate requests and responses with Zod schemas that also generate the OpenAPI 3.1 contract.

#### Scenario: Request violates the contract

- **WHEN** a request body, parameter, or query is invalid
- **THEN** the service responds with RFC 9457 Problem Details and status `400`

### Requirement: Safe observability

The service SHALL emit structured request logs without request bodies and redact credentials.

#### Scenario: Credentials are logged accidentally

- **WHEN** a structured log includes a password, token, authorization header, or cookie
- **THEN** the value is replaced with `[REDACTED]`

### Requirement: Removable example

The template SHALL demonstrate a complete database-backed module and remove it safely during initialization.

#### Scenario: Project is initialized

- **WHEN** a consumer runs the initializer with a valid project name
- **THEN** project metadata is updated and the example module and its migration are removed only after every expected marker is validated
