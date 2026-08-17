# Managed organization entitlements handoff

## Checkpoint purpose

This branch is an unmerged implementation checkpoint for provider-neutral
organization entitlements and managed versus self-hosted deployment behavior.
It also moves organization creation out of an existing organization workspace
and makes `/work` the explicit multi-organization chooser.

- Branch: `feature/managed-organization-entitlements`
- Discovery base: `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Checkpoint type: preserved work in progress; not release evidence

## Implemented scope

- Adds versioned organization entitlement contracts with deployment mode,
  state, capabilities, active-event limits, organizer-seat limits, activation,
  expiration, and revision fields.
- Adds D1 persistence and backfill migration for organization entitlements.
- Adds managed-mode authorization for event creation and an active-event
  capacity guard in the in-memory and D1 repository paths.
- Adds authenticated self-hosted bootstrap provisioning and bearer-token
  internal provisioning with idempotency checks.
- Removes organization creation from organization-scoped member settings.
- Adds one explicit organizer workspace destination per authorized
  organization on `/work`.

Important paths:

- `packages/contracts/src/domain/entitlements.ts`
- `apps/api/migrations/0034_organization_entitlements.sql`
- `apps/api/src/features/organizations/`
- `apps/api/src/infrastructure/cloudflare/repositories/organization-entitlements.ts`
- `apps/api/src/features/events/service.ts`
- `apps/web/src/features/work/`
- `apps/web/src/features/members/`
- `docs/setup.md`
- `spec/eventloom.md`

## Verification captured at retirement

A focused test run passed:

- 10 test files
- 87 tests
- Organization policy, provisioning, routes, entitlement contracts, event
  routes/repositories, API composition, work hub, and member workspace coverage

No full `make check`, full test suite, build, migration application, or live
Cloudflare/D1 workflow was run for this retirement checkpoint.

## Known risks and unfinished decisions

1. `organizerSeats` is modeled but not enforced.
2. Capability names are modeled but are not individually enforced.
3. The active-event capacity query currently counts all organization events;
   confirm which lifecycle states should consume capacity.
4. D1 batch failure classification needs validation against real D1 behavior.
5. Internal provisioning currently uses a shared bearer token; review rotation,
   auditability, and provider-bound authorization.
6. Apply migration `0034` against an isolated local D1 database and verify
   backfill, atomic provisioning, and cascade behavior.
7. Exercise bootstrap and internal provisioning through the assembled API,
   including authentication, verification, replay, and mismatch cases.
8. Run full source gates and real browser QA for `/work` and organization
   settings before opening or merging a delivery PR.

## Resume procedure

1. Recreate a worktree from `feature/managed-organization-entitlements`.
2. Re-read this handoff and the corresponding GitHub handoff issue.
3. Rebase or merge current `main` only after reviewing overlapping
   organization, event, Airtable, and work-hub changes.
4. Resolve the policy decisions above, then run focused tests, `make check`,
   `make test`, `make build`, migration QA, and isolated browser QA.

Temporary visual-QA screenshots were intentionally excluded from this
checkpoint.

## Follow-up checkpoint after initial retirement

A second implementation slice landed immediately after the first push:

- Optimistic entitlement replacement with expected-revision concurrency.
- Shared in-memory and D1 command repository path.
- Internal route `PUT /api/internal/organizations/:organizationId/entitlement`.
- Deterministic audit-event IDs derived from organization ID + idempotency key.
- Atomic D1 batch with payload guard and audit insert.

Important paths:

- `apps/api/src/features/organizations/policy.ts`
- `apps/api/src/features/organizations/routes.ts`
- `apps/api/src/infrastructure/cloudflare/repositories/organization-entitlements.ts`
- `apps/api/src/runtime/cloudflare.ts`

This second slice was committed and pushed before worktree deletion. Focused
tests for the new put path may still need expansion before delivery.
