## ADDED Requirements

### Requirement: Full load on the first run

When there is no successful run of a type yet, the synchronization SHALL read every page of clients (or products) from the ERP without a change filter and write them all. A client or product that exists in the portal but is not in that full load SHALL become inactive (client status `INATIVO`, product `ativo = false`) and MUST NOT be deleted. Items SHALL be made inactive only when the full load read at least one item and exactly as many distinct items as the ERP's total, and that total did not change between pages; otherwise nothing is made inactive and the run is recorded as `FALHA`, so the next run repeats the full load.

#### Scenario: Empty portal

- **WHEN** the first run reads 3 pages of clients and 2 pages of products from the ERP
- **THEN** every client and product of those pages exists in the portal with the ERP values

#### Scenario: Item missing from the full load

- **WHEN** the portal has a product that the full load does not bring
- **THEN** that product stays in the portal with `ativo = false`

#### Scenario: Incomplete full load

- **WHEN** a full load reads no item, or the ERP's total changes between pages
- **THEN** no client or product is made inactive, and the run is recorded as `FALHA`

### Requirement: Incremental runs

After a successful run of a type, the next run of that type SHALL ask the ERP only for what changed since the start of the last successful run (`atualizadoDesde`), 50 items per page, and SHALL read every page of the answer.

#### Scenario: Only changes are requested

- **WHEN** the last successful client run started at 2026-11-27T10:00:00Z
- **THEN** the next client run asks the ERP for clients changed since 2026-11-27T10:00:00Z, page by page with 50 items per page

#### Scenario: Change reaches the portal

- **WHEN** a client's credit limit, a product's description, or a product's table price changes in the ERP before a run
- **THEN** after that run the portal shows the new value

### Requirement: Upsert by ERP code

Clients and products SHALL be written by their ERP code, so that running the synchronization again never creates a second row for the same code, and a row whose ERP values did not change is not rewritten. The client keeps code, company name, CNPJ, city, state, segment, ERP salesperson code, credit limit in cents, status (Ativo, Bloqueado, Inativo), and ERP update time; the product keeps code, description, category, unit, table price in cents, active flag, and ERP update time.

#### Scenario: Running twice

- **WHEN** the same full load runs twice in a row
- **THEN** the number of clients and products is the same after both runs, and the second run reports 0 changed items

#### Scenario: Blocked client keeps its status

- **WHEN** the ERP sends a client with status `BLOQUEADO`
- **THEN** the portal stores that client with status `BLOQUEADO`

### Requirement: An item that cannot be written does not block the others

When a page cannot be written as a whole because of an item's own data (a value already used by another row, such as the CNPJ; a text longer than its column; a number out of its column's range), the synchronization SHALL write its items one by one, skip only the items that fail for one of those reasons, and go on with the next pages. The run SHALL be recorded as `PARCIAL`, with the number of skipped items in `erros` and `pendencias` and each skipped ERP code with the reason in the report, without personal data. A `PARCIAL` run moves the incremental start like a successful one, so later changes keep arriving; a skipped item is tried again when it changes in the ERP. Any other write failure, including a temporary database failure (no free connection, transaction timeout, write conflict or deadlock) or an unknown one, SHALL stop the run as `FALHA` without skipping items, so the next run asks for the same changes again.

#### Scenario: Two clients with the same CNPJ

- **WHEN** the first page has two clients with the same CNPJ and the run is repeated on later hours
- **THEN** every other client of every page is written, the second of the two is skipped and recorded with its ERP code, each run is `PARCIAL`, and the next run asks for changes since the start of the previous one

#### Scenario: Temporary database failure while writing

- **WHEN** writing a page fails because of a temporary database failure, such as a write conflict
- **THEN** no item is skipped, the run is recorded as `FALHA`, and the next run asks for changes since the same start time as before

### Requirement: Data stays available when the ERP fails

Each page SHALL be written in its own transaction. When the ERP is unavailable or its usage limit persists after the ERP client's waits, the run SHALL stop, keep the pages already written and the data the portal had before, record the failure, and leave the next run to start from the same point.

#### Scenario: ERP down

- **WHEN** the ERP is unavailable during a run
- **THEN** the clients and products already in the portal can still be read, the run is recorded with result `FALHA`, and the next run asks for changes since the same start time as before

#### Scenario: Usage limit reached

- **WHEN** the ERP answers a page with `429` and `Retry-After`, and then with the page
- **THEN** the run waits, completes with result `SUCESSO`, and every item of that page is written exactly once

#### Scenario: Usage limit exhausted in the middle of a run

- **WHEN** the ERP keeps answering `429` on the second page until the ERP client gives up, and a later run finds the limit released
- **THEN** the first run is recorded as `FALHA` with the first page kept, and the later run completes with the same number of rows as an uninterrupted run, without duplicates

### Requirement: Run record

Every scheduled run SHALL write one `RegistroSincronizacao` row for clients and one for products. The row is created as `EM_ANDAMENTO` when the run starts and ends with the type, start, end, result (`SUCESSO`, `PARCIAL`, or `FALHA`), the items read from the ERP (counted even when their page could not be written), the number of errors, a safe error detail when it fails, and the number of changed items in the row's report. The detail MUST NOT contain the ERP key or response bodies. Each finished type SHALL also be logged with its result, counts, duration, and safe detail.

#### Scenario: Successful run

- **WHEN** a client run reads 120 clients and 4 of them changed
- **THEN** its row has type `SINCRONIZACAO_CLIENTES`, a start and an end, result `SUCESSO`, 120 items read, 0 errors, and 4 changed items in the report

#### Scenario: Failed run

- **WHEN** a product run fails because the ERP is unavailable
- **THEN** its row has type `SINCRONIZACAO_PRODUTOS`, result `FALHA`, 1 error, and a detail naming the failure without the ERP key, and the client run of the same execution is not affected

### Requirement: Hourly schedule without overlap

The synchronization SHALL run when the application starts and then at least every hour. Two runs MUST NOT overlap, even across application processes: a run that finds another one in progress SHALL not start. A run still `EM_ANDAMENTO` 30 minutes after its start is considered abandoned by a stopped process: the next run records it as `FALHA` and proceeds. When the application stops, it SHALL wait for the run in progress to finish before closing the database, so that no run is left behind by a normal shutdown.

#### Scenario: Run in progress

- **WHEN** a run is triggered while another one is still in progress
- **THEN** the second trigger does not read the ERP nor write any row

#### Scenario: Abandoned run

- **WHEN** a run is still `EM_ANDAMENTO` 31 minutes after its start
- **THEN** the next run records it as `FALHA` and runs

#### Scenario: Shutdown during a run

- **WHEN** the application is asked to stop while a run is in progress
- **THEN** the run finishes and records its result before the database is closed

#### Scenario: Retry after a failure

- **WHEN** a run fails because the ERP is down
- **THEN** the next hourly run tries again without any manual action

### Requirement: Synchronization status

`GET /sync/status` SHALL return `{ ultimaSincronizacaoOk, ultimoResultado }` to any signed-in user. `ultimaSincronizacaoOk` is the end time of the older of the last successful (`SUCESSO` or `PARCIAL`) client and product runs, or `null` when either type has never succeeded; `ultimoResultado` is the worse of the latest client and product results (`FALHA` worse than `EM_ANDAMENTO`, worse than `PARCIAL`, worse than `SUCESSO`), or `null` when nothing ran yet.

#### Scenario: Both types succeeded

- **WHEN** the last successful client run ended at 10:05 and the last successful product run ended at 10:03
- **THEN** the route answers 200 with `ultimaSincronizacaoOk` at 10:03 and `ultimoResultado` `SUCESSO`

#### Scenario: Latest product run failed

- **WHEN** the latest client run succeeded and the latest product run failed
- **THEN** `ultimoResultado` is `FALHA`

#### Scenario: Without a session

- **WHEN** a request without a session calls the route
- **THEN** the system answers 401

### Requirement: On-demand client synchronization

`POST /sync/clientes/:codigo` SHALL let an administrator synchronize one client from the ERP at once, writing it by its ERP code. It MUST NOT write a `RegistroSincronizacao` row. When the ERP no longer has that client, the portal client SHALL become inactive and the route SHALL answer 404. When a scheduled run is in progress, either before reading the ERP or when writing, the route SHALL answer 409 and write nothing. An invalid code answers 400, and an ERP refusal other than 404 answers 422.

#### Scenario: Administrator synchronizes a client

- **WHEN** an administrator calls the route for a client the ERP has
- **THEN** the route answers 200 with the client's code and status, and the portal holds the ERP values

#### Scenario: Client no longer in the ERP

- **WHEN** an administrator calls the route for a code the ERP answers with 404, and the portal has that client
- **THEN** the route answers 404 and the portal client has status `INATIVO`

#### Scenario: Other roles

- **WHEN** a salesperson, sales manager, or finance user calls the route
- **THEN** the system answers 403 and reads nothing from the ERP

#### Scenario: Scheduled run in progress

- **WHEN** an administrator calls the route while a scheduled run is in progress
- **THEN** the route answers 409

#### Scenario: Scheduled run starts while the ERP is being read

- **WHEN** a scheduled run starts after the on-demand sync checked for runs but before it writes the client
- **THEN** the on-demand sync writes nothing and answers 409
