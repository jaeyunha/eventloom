# Reviewer revision schedule handoff

## Checkpoint purpose

This branch contains the committed reviewer revision-lineage implementation plus
a post-rebase migration consolidation checkpoint.

- Branch: `fix/reviewer-revision-schedule`
- Discovery head: `dc203d9d8711`
- Checkpoint type: preserved work in progress; not deployed migration evidence

## Checkpoint correction

- Enables SQLite foreign-key enforcement in migrations `0035` through `0039`
  with `PRAGMA foreign_keys = ON`.
- Consolidates the unshipped candidate-predicate refinements from migrations
  `0040` and `0041` into migrations `0036` and `0037`.
- Deletes the now-redundant `0040` and `0041` migration files.
- Updates the compound compare-and-swap evaluation repository fixture to apply
  migrations `0035`, `0038`, and `0039`.
- Updates the lineage migration test and release runbook to the final
  five-migration sequence.

The retirement diff is limited to:

- `apps/api/migrations/0035_review_plan_revision_lineage.sql`
- `apps/api/migrations/0036_review_plan_lineage_repairs.sql`
- `apps/api/migrations/0037_review_plan_lineage_repair_triggers.sql`
- `apps/api/migrations/0038_review_plan_revision_sync_lock.sql`
- `apps/api/migrations/0039_review_plan_revision_sync_token.sql`
- `apps/api/src/infrastructure/cloudflare/repositories/evaluations.test.ts`
- `apps/api/src/db/review-plan-lineage-migrations.test.ts`
- `docs/release-runbook.md`

## Verification captured at retirement

- `evaluations.test.ts`: 11 tests passed
- `review-plan-lineage-migrations.test.ts`: 3 tests passed

No full repository check, test suite, build, or remote D1 migration validation
was run for this retirement checkpoint.

## Known risks and remaining work

1. Confirm that consolidating unshipped migrations `0040` and `0041` is valid
   for every environment; do not rewrite migrations that were already applied.
2. Run the broader evaluation and migration test set plus repository checks.
3. Apply migrations `0035` through `0039` to the target D1 environment in
   strict order.
4. Inspect and resolve every row in
   `review_plan_lineage_repairs_required`; do not declare migration completion
   while unresolved rows remain.
5. Reconcile each authoritative revision tip with `expectedVersion` and a
   reusable `revisionSyncToken`.
6. Verify reviewer assignments, draft reviews, plan state, and round timestamps
   through the reviewer workspace.

## Resume procedure

1. Recreate a worktree from `fix/reviewer-revision-schedule`.
2. Re-read this handoff and the corresponding GitHub handoff issue.
3. Compare migration numbering and evaluation repository changes with current
   `main`.
4. Complete source validation before any D1 rollout.
5. Follow `docs/release-runbook.md` for migration and repair evidence.
