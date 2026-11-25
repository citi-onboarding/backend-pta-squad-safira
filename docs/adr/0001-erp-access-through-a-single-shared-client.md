---
title: ADR-0001
status: proposed
date: 2026-11-25
owners: []
tags: [erp, integration, security, architecture]
supersedes: null
superseded_by: null
---

# 0001: ERP access through a single shared client

## Context

The DistriLux portal depends on the DistriLux ERP (API v3.3.0) for customers,
products, receivables, and order submission. Several upcoming features need it:
the customer, product, and receivables synchronizers and the order submission
flow (BACK-08). The ERP key must never leave the server (RN-14), ERP rate limits
and outages must not lose or duplicate work (RN-15), monetary values are integer
cents (RN-13), and order submission is idempotent (RN-07).

The architecture rules forbid a module from importing another module, and
require external data to be validated with Zod. Without a shared decision, each
feature would implement its own HTTP calls, key handling, retries, and error
mapping, and the security and resilience invariants would be re-proven in every
module.

## Decision

All ERP communication goes through one client in `src/shared/erp`:

- `erp-client.service.ts` is the only code that sends HTTP requests to the ERP.
  No module, route, or script may call the ERP directly.
- Consumers depend on the `ErpClient` interface, which exposes typed business
  operations and no HTTP concepts. The instance is built in `src/server.ts` and
  injected through `createApp`.
- The key is read only from the validated server environment and sent only in
  `X-Api-Key`; it is never logged or returned.
- Every ERP answer is validated with Zod against the ERP contract; a mismatch is
  a failure, never data.
- Failures are three typed errors extending `HttpProblem`
  (`ErpIndisponivelError`, `ErpLimiteDeUsoError`, `ErpRecusouError`), so the
  existing Problem Details handler renders them without per-feature mapping.
- Reads may be retried by the client; order submission is attempted once and its
  retry policy belongs to the submission flow.
- `fetch` is injected, so tests fake the ERP without an HTTP mocking library.

Future changes must preserve the single entry point, the interface boundary,
key confidentiality, and response validation. New ERP operations are added to
this client, not to modules.

## Consequences

### Positive

- RN-14 and RN-15 are enforced in one place and covered by one test suite.
- Synchronizers and submission can be written and tested against the interface
  with a double, without knowing HTTP.
- ERP contract changes are absorbed by one schemas file.

### Negative

- `src/shared` now holds domain-aware code (ERP terms in Portuguese), an
  exception to its domain-independent role.
- Every new ERP operation needs a change to the shared client and its tests,
  which becomes a review hotspot.
- The retry policy is shared; a feature that needs a different policy must
  extend the client rather than tune it locally.

## Alternatives considered

### ERP module under `src/modules/erp`

Keeps domain code out of `src/shared`, but modules cannot import other modules,
so synchronizers and submission could not reuse it.

### Direct HTTP calls in each module

Lets every feature choose its own policy, but duplicates key handling, retries,
validation, and error mapping, and multiplies the places where the key could
leak.

### HTTP mocking library (MSW or nock) instead of an injected `fetch`

Would let the client call the global `fetch` directly, but adds a dependency
and hides the seam that the architecture rules ask to be explicit.

## References

- OpenSpec change: `openspec/changes/integrate-distrilux-erp/`
- Change summary: `docs/changes/integrate-distrilux-erp.md`
- ERP contract: <https://pta-erp-api.onrender.com/openapi.json>
