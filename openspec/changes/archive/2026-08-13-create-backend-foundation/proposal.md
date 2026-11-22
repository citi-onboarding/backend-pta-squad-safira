# Proposal: Create the backend foundation

## Why

The previous backend template is coupled to a product, has almost no meaningful tests, duplicates API documentation, and mixes deployment provisioning with reusable application concerns.

## What changes

- Create a product-neutral Express and Prisma foundation.
- Make validation, OpenAPI, tests, migrations, logging, and documentation executable quality gates.
- Provide a safe, removable example module.

## Non-goals

- Authentication, Redis, object storage, email, or provider-specific deployment.
- Migrating the existing BPV product.
