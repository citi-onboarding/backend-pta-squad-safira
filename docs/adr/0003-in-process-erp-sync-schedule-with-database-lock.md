---
title: ADR-0003
status: proposed
date: 2026-11-27
owners: ["Luana Allatta Guerra"]
tags: [erp, sync, scheduling, concurrency]
supersedes: null
superseded_by: null
---

# 0003: In-process ERP sync schedule with a database lock

## Context

BACK-03 must copy clients and products from the ERP to the portal at least every hour, on start-up, and on demand for one client, and two runs must never overlap (PRD 7.2, RN-15). BACK-04 will do the same for receivables. The API may run as more than one process (several containers or a restart overlapping the old one), and the project has no job queue, cron service, or worker process. Each run writes a `RegistroSincronizacao` row (DATA-01), which the status bar and BACK-04 read.

## Decision

- The schedule runs inside the API process: `createApp` starts it only when it receives `syncSchedule`, and `server.ts` passes one hour. It runs once at start-up and then every interval; a failed run is logged and the next interval is the retry.
- Runs never overlap, across processes, through the database: a run starts inside a short transaction that takes a Postgres transaction-level advisory lock (`pg_advisory_xact_lock`), closes runs left `EM_ANDAMENTO` for more than 30 minutes as `FALHA`, and inserts its own `EM_ANDAMENTO` rows only if no other recent run is in progress. While the run lasts, those rows are the lock. The on-demand client sync writes under the same advisory lock and answers 409 when a run is in progress.
- On shutdown, the server waits for the run in progress to finish before closing the database, so a normal stop never leaves a run behind.
- Rules future changes must keep: a new sync type (BACK-04) takes the same advisory lock and records its own `EM_ANDAMENTO` row; a run that cannot finish must never be reported as `SUCESSO`; tests never start the schedule.

## Consequences

### Positive

- No new infrastructure: the database already shared by every API process is the coordination point.
- The lock survives several processes and restarts, and the run rows double as the record the status route and BACK-04 need.
- A short advisory lock cannot leak: it is released when its transaction ends, even if the process dies.

### Negative

- Every API process runs a timer; all but one skip each hour, which costs one short transaction per process per hour.
- A run that really lasts more than 30 minutes would be taken as abandoned and could overlap with the next one. A full load is about five ERP requests, far below that limit, but a much larger catalog or long ERP waits would require revisiting the threshold.
- A process killed without a normal shutdown leaves its rows `EM_ANDAMENTO` for up to 30 minutes, delaying the next run by up to one interval.

## Alternatives considered

### Session-level advisory lock held for the whole run

Prisma's connection pool does not guarantee that the unlock uses the connection that took the lock, so the lock could leak or be released by the wrong session.

### In-memory flag

It prevents overlap only inside one process; a second container or a rolling restart would run in parallel.

### Separate worker or external scheduler (cron container, job queue)

It isolates the schedule from the API, but adds a service to build, deploy, and monitor that the current infrastructure does not have. It can replace the in-process schedule later without changing the lock rules.

## References

- OpenSpec change: `openspec/changes/sync-clients-and-products/` (design, "Lock and run rows" and "Schedule")
- Change summary: `docs/changes/sync-clients-and-products.md`
- ADR-0001 (ERP access through a single shared client)
