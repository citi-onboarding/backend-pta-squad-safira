## Purpose

Defines how the DistriLux portal reads customers, products, receivables, and
orders from the DistriLux ERP and submits orders to it — safely, resiliently,
and without letting malformed ERP data or the ERP key escape the server.

## ADDED Requirements

### Requirement: ERP configuration

The service MUST require the ERP base URL and the ERP key from the server
environment at startup and MUST refuse to start when either is missing or
invalid.

#### Scenario: ERP key is missing

- **WHEN** the service starts without `ERP_API_KEY` or with an empty value
- **THEN** environment validation fails and the service does not start

#### Scenario: ERP URL is invalid

- **WHEN** the service starts with an `ERP_API_URL` that is not an absolute URL
- **THEN** environment validation fails and the service does not start

#### Scenario: ERP configuration is valid

- **WHEN** the service starts with an absolute `ERP_API_URL` and a non-empty `ERP_API_KEY`
- **THEN** environment validation succeeds and exposes both values to the server

### Requirement: ERP key confidentiality

The service SHALL send the ERP key only in the `X-Api-Key` header of requests
to the ERP and MUST NOT write the key to logs or include it in any client
response, including error responses (RN-14).

#### Scenario: Every ERP request is authenticated

- **WHEN** the portal performs any ERP operation
- **THEN** the ERP request carries the configured key in the `X-Api-Key` header

#### Scenario: ERP failure is logged and returned

- **WHEN** an ERP operation fails for any reason and the failure is logged and returned to a client
- **THEN** neither the log output nor the client response contains the ERP key

### Requirement: Paginated ERP reads

The service SHALL read customers, products, and receivables from the ERP one
page at a time, accepting a page number, a page size from 1 to 50, and an
optional "updated since" instant, and SHALL return the page items together
with `pagina`, `tamanho`, `total`, and `totalPaginas`. Monetary values MUST be
returned as the ERP integer cents (RN-13).

#### Scenario: Customers page is read with an updated-since filter

- **WHEN** customers are requested with page `2`, size `50`, and updated since `2026-11-01T00:00:00-03:00`
- **THEN** the ERP receives `GET /v1/clientes` with `pagina=2`, `tamanho=50`, and that `atualizadoDesde`
- **AND** the returned page contains the validated customers and pagination metadata

#### Scenario: Products and receivables pages are read

- **WHEN** products or receivables are requested with a page and size
- **THEN** the ERP receives `GET /v1/produtos` or `GET /v1/titulos` with those parameters and the validated page is returned

#### Scenario: Page size is out of range

- **WHEN** a page size lower than 1 or greater than 50 is requested
- **THEN** the operation fails before any ERP request is sent

### Requirement: Single-record ERP reads

The service SHALL read one customer by its code and one order by its number.

#### Scenario: Customer exists

- **WHEN** customer `C0001` is requested
- **THEN** the ERP receives `GET /v1/clientes/C0001` and the validated customer is returned

#### Scenario: Order exists

- **WHEN** order `70001` is requested
- **THEN** the ERP receives `GET /v1/pedidos/70001` and the validated order is returned

#### Scenario: Record does not exist

- **WHEN** the ERP answers `404` for a customer or order
- **THEN** the operation fails with an ERP refusal carrying status `404`

### Requirement: Order submission

The service SHALL submit an order to the ERP exactly once per call, always
sending the caller-provided submission key in the `Idempotency-Key` header, and
MUST NOT retry automatically, whatever the failure (RN-07). An empty submission
key MUST be rejected before any ERP request.

#### Scenario: Order is accepted

- **WHEN** an order with a customer and at least one item is submitted with submission key `pedido-123`
- **THEN** the ERP receives exactly one `POST /v1/pedidos` with `Idempotency-Key: pedido-123`
- **AND** the validated ERP order, including its number and total in cents, is returned

#### Scenario: ERP is unavailable during submission

- **WHEN** the ERP answers `503`, `5xx`, `429`, or does not answer before the timeout during submission
- **THEN** exactly one ERP request was sent and the operation fails with the matching typed failure

#### Scenario: Order payload is invalid

- **WHEN** an order without items, with more than 50 items, or with a quantity outside 1–9999 is submitted
- **THEN** the operation fails before any ERP request is sent

#### Scenario: Submission key is empty

- **WHEN** an order is submitted with an empty submission key
- **THEN** the operation fails with a validation error before any ERP request is sent

### Requirement: Bounded ERP calls

Every ERP request MUST be aborted when the ERP does not answer within the
configured timeout (30 seconds by default).

#### Scenario: ERP does not answer

- **WHEN** the ERP does not answer a request within the timeout
- **THEN** the request is aborted and treated as an ERP unavailability

#### Scenario: ERP answers slowly within the default timeout

- **WHEN** the ERP takes 25 seconds to answer a request and no timeout was configured
- **THEN** the request is not aborted and its answer is used

### Requirement: Resilient reads

ERP read operations SHALL make up to 3 attempts when the ERP answers with a
`5xx` status, does not answer before the timeout, or cannot be reached, waiting
a growing delay between attempts. When a `503` carries `Retry-After`, the
service SHALL wait that delay instead, and MUST fail immediately when that delay
exceeds 60 seconds. `Retry-After` on any other `5xx` (for example `500`, `502`,
or `504`) MUST be ignored: those answers use the growing backoff and the 3
attempts. When all attempts fail, the operation
MUST fail with an ERP unavailability and the server MUST keep serving other
requests.

#### Scenario: ERP recovers after a 5xx

- **WHEN** a read receives `500` and then `200`
- **THEN** the read succeeds with the data of the second answer after waiting the first backoff delay

#### Scenario: ERP stays unavailable

- **WHEN** a read receives `503` three times
- **THEN** exactly 3 ERP requests are sent and the read fails with an ERP unavailability

#### Scenario: Requested 503 delay is too long

- **WHEN** a read receives `503` with `Retry-After: 120`
- **THEN** exactly one ERP request is sent and the read fails immediately with an ERP unavailability carrying a retry-after of 120 seconds

#### Scenario: Retry-After on a non-503 5xx is ignored

- **WHEN** a read receives `502` with `Retry-After: 120` three times
- **THEN** exactly 3 ERP requests are sent, 500 ms and 1 000 ms apart, and the read fails with an ERP unavailability without a retry-after

#### Scenario: ERP times out and then answers

- **WHEN** the first attempt of a read times out and the second answers `200`
- **THEN** the read succeeds with the data of the second answer

#### Scenario: Unavailability reaches a client

- **WHEN** a portal request fails because the ERP is unavailable
- **THEN** the client receives Problem Details with status `503`
- **AND** the server keeps answering subsequent requests

### Requirement: ERP rate limits

When the ERP answers a read with `429`, the service SHALL wait the delay given
by `Retry-After` (seconds or HTTP date, or the backoff delay when absent) and
repeat the same request — same page and filters — without restarting or
skipping work (RN-15). It SHALL wait at most 3 times per read and MUST fail
immediately with an ERP usage-limit failure when the requested delay exceeds
60 seconds or the waits are exhausted.

#### Scenario: Rate limit clears

- **WHEN** a read receives `429` with `Retry-After: 2` and then `200`
- **THEN** the same request is repeated after 2 seconds and the read succeeds with the second answer

#### Scenario: Rate limit persists

- **WHEN** a read receives `429` four times in a row
- **THEN** the read fails with an ERP usage-limit failure after 3 waits

#### Scenario: Rate limit waits do not spend 5xx attempts

- **WHEN** a read receives `429` with `Retry-After: 1`, then `500` twice, then `200`
- **THEN** exactly 4 ERP requests are sent and the read succeeds with the last answer

#### Scenario: Requested delay is too long

- **WHEN** a read receives `429` with `Retry-After: 120`
- **THEN** the read fails immediately with an ERP usage-limit failure carrying a retry-after of 120 seconds

#### Scenario: Usage limit reaches a client

- **WHEN** a portal request fails with an ERP usage-limit failure
- **THEN** the client receives Problem Details with status `503` and `retryAfterSeconds`

### Requirement: ERP refusals

When the ERP refuses a request with `400`, `404`, `409`, or `422`, the service
MUST fail without retrying and carry the ERP status, `detail`, and field errors
on the failure for server use only. The service SHALL log the ERP status and the
names of the fields in error, never the ERP `detail` or field messages. A client
SHALL receive Problem Details with status `404` for `404`, `409` for `409`, and
`422` otherwise, with the fixed detail `The ERP refused the request.`, and MUST
NOT receive the ERP `detail` or field errors.

#### Scenario: ERP rejects an order

- **WHEN** order submission receives `422` Problem Details with field errors
- **THEN** the operation fails with an ERP refusal carrying status `422`, the ERP detail, and the field errors

#### Scenario: Refusal reaches a client

- **WHEN** a portal request fails with an ERP refusal of status `409`
- **THEN** the client receives Problem Details with status `409`
- **AND** the response contains neither the ERP detail nor its field errors

#### Scenario: Refusal is logged without ERP text

- **WHEN** a request receives `422` Problem Details with a detail and a field error on `itens.0.produto`
- **THEN** the log records the ERP status and `itens.0.produto`
- **AND** the log contains neither the ERP detail nor the field message

### Requirement: ERP misconfiguration

When the ERP answers `401` or `403`, the service MUST fail with an ERP
unavailability without retrying and without exposing the key.

#### Scenario: ERP rejects the key

- **WHEN** a read receives `401`
- **THEN** exactly one ERP request is sent and the operation fails with an ERP unavailability

### Requirement: Validated ERP responses

The service MUST validate every successful ERP response against the ERP
contract and MUST fail with an ERP unavailability instead of returning data
that does not match it.

#### Scenario: ERP returns a malformed record

- **WHEN** a customers page arrives with a customer whose `limiteCreditoCentavos` is not an integer
- **THEN** the read fails with an ERP unavailability and no customer data is returned

#### Scenario: ERP returns a non-JSON body

- **WHEN** a successful ERP answer has a body that is not valid JSON
- **THEN** the operation fails with an ERP unavailability
