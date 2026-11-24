## ADDED Requirements

### Requirement: Domain tables

The database SHALL contain one table for each entity in PRD section 7.1 after the initial migration runs on an empty database.

#### Scenario: Migration on an empty database

- **WHEN** the initial migration runs on an empty PostgreSQL database
- **THEN** it completes without errors and creates the 13 domain tables

### Requirement: No duplicated ERP records

The database MUST reject a second client or product with the same ERP code and a second receivable with the same number and installment.

#### Scenario: Duplicated client code

- **WHEN** a client is inserted with a `codigoErp` that already exists
- **THEN** the database rejects the insert with a unique constraint violation

#### Scenario: Duplicated receivable installment

- **WHEN** a receivable is inserted with a `numero` and `parcela` that already exist
- **THEN** the database rejects the insert with a unique constraint violation

### Requirement: One ERP order per portal order

The database MUST store a unique send key for each portal order.

#### Scenario: Reused send key

- **WHEN** an order is inserted with a `chaveEnvio` that already exists
- **THEN** the database rejects the insert with a unique constraint violation

### Requirement: Money as integer cents

Every monetary column SHALL be an integer amount in cents.

#### Scenario: Monetary column type

- **WHEN** the schema is inspected
- **THEN** no monetary column uses a decimal or floating-point type

### Requirement: Idempotent development seed

The development seed SHALL create one user per role and sample clients and products without duplicating data when it runs more than once.

#### Scenario: Seed runs twice

- **WHEN** the seed runs twice on the same database
- **THEN** both runs succeed and each seeded user, client, and product exists exactly once
