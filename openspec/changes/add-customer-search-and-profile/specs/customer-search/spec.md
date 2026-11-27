## Purpose

Lets salespeople, the sales manager, and the finance team find clients of the portfolios they may see by name, ERP code, or CNPJ, page by page.

## ADDED Requirements

### Requirement: Portfolio scope of the client search

The system SHALL return to a salesperson only the clients whose salesperson code is the salesperson's own code (RN-08). The system SHALL return clients of every portfolio to the sales manager and the finance role. The portfolio MUST come from the signed-in user and MUST NOT be chosen by the request. A request without a session MUST be rejected, and a user whose role gives no access to clients MUST be rejected.

#### Scenario: Salesperson searches

- **WHEN** salesperson V01 lists clients and there are clients of V01 and V02
- **THEN** the system responds 200 with only the clients of V01

#### Scenario: Sales manager or finance searches

- **WHEN** a sales manager or a finance user lists clients and there are clients of V01 and V02
- **THEN** the system responds 200 with the clients of both portfolios

#### Scenario: Request without a session

- **WHEN** a request without a session lists clients
- **THEN** the system responds 401

#### Scenario: Role without access to clients

- **WHEN** an administrator, or a salesperson without a salesperson code, lists clients
- **THEN** the system responds 403

### Requirement: Search by name, code, or CNPJ

The system SHALL match a search term against part of the company name and part of the ERP code, ignoring letter case and surrounding spaces. When the term contains only digits and CNPJ punctuation (dots, slash, hyphen, spaces) and at least 3 digits, the system SHALL also match its digits against part of the CNPJ, so a CNPJ typed with or without punctuation finds the same client. An empty or missing term SHALL return the whole portfolio.

#### Scenario: Partial name in different letter case

- **WHEN** a user searches for "exemplo" and the client "Construtora Exemplo Ltda" is in the portfolio
- **THEN** the result contains that client

#### Scenario: ERP code

- **WHEN** a user searches for "c9001" and the client with code "C9001" is in the portfolio
- **THEN** the result contains that client

#### Scenario: CNPJ with punctuation

- **WHEN** a user searches for "11.222.333/0001-81" and a client has the CNPJ "11222333000181"
- **THEN** the result contains that client

#### Scenario: CNPJ without punctuation

- **WHEN** a user searches for "11222333000181"
- **THEN** the result contains the same client as the search with punctuation

#### Scenario: Partial CNPJ

- **WHEN** a user searches for "112" and a client's CNPJ contains those digits
- **THEN** the result contains that client

#### Scenario: Empty search

- **WHEN** a salesperson lists clients without a search term
- **THEN** the system responds 200 with every client of the salesperson's portfolio

#### Scenario: Nothing found

- **WHEN** a user searches for a term that matches no client of the portfolio
- **THEN** the system responds 200 with an empty list and a total of 0

#### Scenario: Client of another portfolio matches the term

- **WHEN** salesperson V01 searches for the exact CNPJ of a client of V02
- **THEN** the system responds 200 with an empty list

### Requirement: Search results page by page

The system SHALL return at most 60 clients per page, ordered by company name, together with the page number, the page size, and the total number of matching clients. Pages SHALL start at 1. Each client in the list SHALL carry its id, ERP code, company name, CNPJ, city, state, status, salesperson code, salesperson name when a portal user has that code, and its available credit in cents. An invalid page number or a term longer than 100 characters MUST be rejected.

#### Scenario: More clients than one page

- **WHEN** 61 clients match the search
- **THEN** the first page has 60 clients and the total is 61

#### Scenario: Second page

- **WHEN** a user asks for page 2 of a search with 61 matches
- **THEN** the page has the 61st client in company name order

#### Scenario: Available credit in the list

- **WHEN** a client with a credit limit of 1,000,000 cents has 300,000 cents of unpaid ERP receivables
- **THEN** that client appears in the list with an available credit of 700,000 cents

#### Scenario: Invalid page

- **WHEN** a user asks for page 0 or a page that is not a whole number
- **THEN** the system responds 400

#### Scenario: Term too long

- **WHEN** a user searches with a term of 101 characters
- **THEN** the system responds 400
