## Purpose

Shows one client's registration data and credit position (RN-01), with its overdue receivables and how fresh the ERP data is, so the user knows whether and how much the client can buy.

## ADDED Requirements

### Requirement: Client profile within the portfolio

The system SHALL return the profile of a client to a user who may see that client's portfolio (RN-08). The profile SHALL contain the id, ERP code, company name, CNPJ, city, state, segment, status, salesperson code, and salesperson name when a portal user has that code. A client outside the user's portfolio MUST answer the same 404 as a client that does not exist.

#### Scenario: Salesperson opens a client of their portfolio

- **WHEN** salesperson V01 opens a client of V01
- **THEN** the system responds 200 with the client's profile

#### Scenario: Salesperson opens a client of another portfolio

- **WHEN** salesperson V01 opens a client of V02
- **THEN** the system responds 404 with the same response as a client that does not exist

#### Scenario: Sales manager or finance opens any client

- **WHEN** a sales manager or a finance user opens a client of any portfolio
- **THEN** the system responds 200 with the client's profile

#### Scenario: Client that does not exist

- **WHEN** a user opens a client id that is not registered
- **THEN** the system responds 404

#### Scenario: Malformed client id

- **WHEN** a user opens a client with an id that is not a UUID
- **THEN** the system responds 400

#### Scenario: Request without a session

- **WHEN** a request without a session opens a client
- **THEN** the system responds 401

#### Scenario: Role without access to clients

- **WHEN** an administrator opens a client
- **THEN** the system responds 403

#### Scenario: Blocked client

- **WHEN** a user opens a client whose status in the ERP is Blocked
- **THEN** the profile shows the status Blocked

### Requirement: Credit position

The system SHALL show, in cents, the credit limit, the open amount (unpaid ERP receivables not yet due), the overdue amount (unpaid ERP receivables whose due date is before today in the America/Recife time zone), and the available credit, which is the credit limit minus the open amount minus the overdue amount (RN-01, RN-13). Paid receivables and receivables loaded from the old spreadsheet MUST NOT count. The available credit MAY be negative.

#### Scenario: Client without receivables

- **WHEN** a client with a credit limit of 2,000,000 cents has no receivables
- **THEN** the open amount is 0, the overdue amount is 0, and the available credit is 2,000,000 cents

#### Scenario: Client with open and overdue receivables

- **WHEN** a client with a credit limit of 2,000,000 cents has an unpaid receivable of 500,000 cents due tomorrow and an unpaid receivable of 300,000 cents due yesterday
- **THEN** the open amount is 500,000, the overdue amount is 300,000, and the available credit is 1,200,000 cents

#### Scenario: Paid receivable

- **WHEN** a client with a credit limit of 2,000,000 cents has only a paid receivable of 500,000 cents
- **THEN** the available credit is 2,000,000 cents

#### Scenario: Spreadsheet receivable

- **WHEN** a client has an unpaid receivable of 400,000 cents loaded from the old spreadsheet
- **THEN** that receivable does not change the open amount, the overdue amount, or the available credit

#### Scenario: Unpaid receivables above the limit

- **WHEN** a client with a credit limit of 1,000,000 cents has unpaid ERP receivables of 1,250,000 cents
- **THEN** the available credit is -250,000 cents

#### Scenario: Receivable due today

- **WHEN** an unpaid receivable is due today
- **THEN** it counts in the open amount and not in the overdue amount

### Requirement: Overdue receivables

The system SHALL list the client's unpaid ERP receivables whose due date is before today, oldest due date first, each with its number, installment, amount in cents, due date, and days overdue counted from the due date to today in the America/Recife time zone.

#### Scenario: Client with an overdue receivable

- **WHEN** a client has an unpaid ERP receivable of 300,000 cents due 10 days ago
- **THEN** the overdue list contains that receivable with 300,000 cents and 10 days overdue

#### Scenario: Client without overdue receivables

- **WHEN** a client has only receivables that are paid or not yet due
- **THEN** the overdue list is empty

### Requirement: Data freshness and last order

The system SHALL show the end time of the last successful client sync and of the last successful receivables sync, or nothing when no such sync has finished (US-002). The system SHALL show the date of the client's last order, or nothing while orders are not recorded.

#### Scenario: Successful syncs recorded

- **WHEN** a client sync and a receivables sync have finished successfully
- **THEN** the profile shows the end time of the latest successful run of each

#### Scenario: Failed sync after a successful one

- **WHEN** the latest client sync failed and an earlier one finished successfully
- **THEN** the profile shows the end time of the earlier successful run

#### Scenario: No sync yet

- **WHEN** no client or receivables sync has finished successfully
- **THEN** the profile shows no sync time

#### Scenario: Last order not available yet

- **WHEN** a user opens any client
- **THEN** the date of the last order is empty
