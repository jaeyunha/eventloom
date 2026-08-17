# Lane Handoff: judge-crm-concurrency

## Paused state

**This lane is paused by user request.**

Do not continue feature work, merge PR #37, deploy, delete the branch, or delete the
worktree until the user explicitly resumes the lane.

## Repository, branch, and worktree

- Repository remote: `https://github.com/jaeyunha/open-sessionboard.git`
- Existing PR repository URL: `https://github.com/jaeyunha/eventloom`
- Branch: `judge-crm-concurrency`
- Pushed branch:
  https://github.com/jaeyunha/eventloom/tree/judge-crm-concurrency
- Pushed pre-checkpoint commit:
  https://github.com/jaeyunha/eventloom/commit/ca6dd6b35df620b415099d3bef9b37bd11b88e4b
- Handoff document on the pushed branch:
  https://github.com/jaeyunha/eventloom/blob/judge-crm-concurrency/docs/handoffs/judge-crm-concurrency.md
- Worktree:
  `/Users/jaeyunha/wt/open-sessionboard/judge-crm-concurrency`
- PR: https://github.com/jaeyunha/eventloom/pull/37
- PR state at pause: `OPEN`, not draft, `mergedAt: null`

## Exact Git state at handoff authoring

- Latest GitHub main incorporated into the lane:
  `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Pre-checkpoint committed HEAD:
  `7b076b428779a90d83e3ccbd6bd8bfee5411a3ca`
- Pre-checkpoint HEAD parents:
  - Lane parent: `ca6dd6b35df620b415099d3bef9b37bd11b88e4b`
  - Incorporated main parent:
    `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Remote branch before this checkpoint:
  `ca6dd6b35df620b415099d3bef9b37bd11b88e4b`
- PR base reference recorded by GitHub:
  `e1d91309fbbd4ae22516dd6cdf060feec373d6ee`
- The pushed checkpoint commit is the commit containing this document. The handoff
  GitHub issue links its exact SHA after push.

## Lane objective and scope

The lane owns optimistic concurrency and atomicity for the built-in organization-scoped
Speaker CRM. Its scope is:

1. Require and validate authoritative contact/pipeline versions at public and service
   boundaries.
2. Prevent stale collection/detail reads from overwriting newer local contact state.
3. Preserve explicit nullable pipeline score/rationale clearing.
4. Keep contact CAS, pipeline history, general CRM history, audits, tags, and optional
   projection work atomic in D1.
5. Return HTTP `409` with refresh guidance only for genuine optimistic-concurrency
   misses; keep storage/history/audit/constraint failures as internal failures.
6. Keep active contact filters authoritative after contact, pipeline, and event-membership
   mutations.

This lane does not add an external CRM product integration, merge the PR, or deploy.

## Completed implementation in the checkpoint

- Public contact PATCH and pipeline mutation schemas require a positive
  `expectedVersion`.
- Service mutation input types require `expectedVersion`, and runtime validation rejects
  omitted, zero, negative, and fractional values.
- Contact PATCH rejects create-only `idempotencyKey` and parses recursive `CrmValue`
  custom fields.
- Selected-contact and contact-collection reads preserve newer contact versions.
- Collection reads capture a contact mutation generation. A read invalidated by a local
  mutation performs a fresh authoritative read using the same active filter.
- Contact create/update and all pipeline mutations mark the generation and reload the
  filtered collection.
- Event-membership mutations refresh history, analytics, and the active event-filtered
  contact collection.
- Pipeline serialization preserves explicit `score: null` and `rationale: null`.
- `ConsequentialWrite` supports an optional SQL condition while remaining compatible
  with existing callers.
- D1 contact save now uses two unique transient, tenant/action/resource-scoped audit
  markers:
  - the primary marker authorizes all consequential statements;
  - the secondary marker distinguishes a true CAS miss from a primary marker collision.
- Both transient markers are deleted inside the successful atomic batch.
- A completed batch becomes `CrmRepositoryConflictError` only when the primary marker
  changed zero rows and the secondary CAS probe also changed zero rows.
- Primary-marker collision while the CAS predicate still matches remains an internal
  repository failure, not a retry-oriented conflict.
- Rejected history/audit/constraint/storage batches are not caught and relabeled as
  conflicts.
- Real `SqliteD1` tests query contacts, tags, pipeline history, general history, and
  audit state after:
  - a stale retry following a prior successful write with matching product audit state;
  - a cross-tenant primary-marker ID collision;
  - a deliberate late general-history trigger failure.
- Route/service tests distinguish `409 CONFLICT` from generic `500` internal failure.

## Known review findings and current risk

### Resolved findings

- Earlier collection generation logic retained returned newer IDs but dropped locally
  created IDs absent from stale responses. The current code reloads authoritatively.
- Discarding invalidated reads without a post-mutation reload left active filters stale.
  Contact, pipeline, and event-membership paths now reload.
- The original D1 catch converted every rejected batch into
  `CrmRepositoryConflictError`. The catch was removed.
- A deterministic persisted product-audit ID was unsafe as a CAS marker because a stale
  replay could reuse it and commit tags/history. The marker is now unique and transient.
- A guard existence check lacking tenant/resource scope could be satisfied by a
  cross-tenant collision. The predicate now includes tenant, action, resource type, and
  resource ID.
- A zero-row primary marker insert could mean a marker-ID collision rather than a real
  CAS miss. The current partial patch adds a second conditional transient marker to
  classify that case as internal.

### Unresolved review status

- The last independent review round ran before the secondary CAS-probe marker was added.
- In that round, goal/code/QA/context reviewers passed, but security failed because a
  primary marker collision was still mapped to `409`.
- The current patch addresses that failure and its focused regression passes, but no
  fresh complete five-lane review has evaluated the secondary-marker design.
- The complete focused suite, full repository gate, and browser QA have not been rerun
  after the final secondary-marker change.
- Treat the checkpoint as safely resumable, not release-ready.

## Verification evidence

| Command / check | Status | Exact evidence |
| --- | --- | --- |
| `git diff --check` | **PASS — current checkpoint** | Exit 0 after pause cleanup. |
| `bun run --cwd apps/api typecheck` | **PASS — current checkpoint** | `tsc --noEmit`, exit 0 after the secondary-marker change. |
| `bun run --cwd apps/web typecheck` | **PASS — current checkpoint** | `tsc --noEmit`, exit 0 after pause. |
| Targeted pause checkpoint Vitest command shown below | **PASS — current checkpoint** | 4 files passed; 7 tests passed, 72 skipped. |
| Changed-file Biome check for repository marker files | **PASS — current checkpoint** | No fixes applied. |
| Four-file focused CRM suite | **PASS, but stale for final patch** | 79/79 passed before the secondary-marker classification change. Rerun required. |
| `make check && make test && bun run build` | **PASS, but stale for final patch** | 247 files passed; 2127 tests passed, 3 skipped; builds exited 0 before the secondary-marker change. Rerun required. |
| `bun run test:e2e -- tests/e2e/crm-concurrency.spec.ts` | **PASS, but stale for final patch** | 1 Chromium test passed on web `55399`, API `55400`, inspector `55401` before the secondary-marker change. Rerun required. |
| Final five-lane review | **FAIL / superseded** | Security found primary marker collision mapped to 409. Current patch addresses it; fresh review is unrun. |
| Old background `bash_64` full test process | **KILLED, unrelated/stale** | It had been running for over seven hours and was stuck at `member-activation-security.test.ts`; it was terminated under the pause directive. It is not evidence for this patch. |

Current checkpoint test command:

```sh
bunx vitest run \
  apps/api/src/infrastructure/cloudflare/repositories/repositories.test.ts \
  apps/api/src/features/crm/service.test.ts \
  apps/api/src/features/crm/routes.test.ts \
  apps/web/src/features/crm/crm-workspace.test.tsx \
  -t "real SQLite CAS is stale|cross-tenant guard collision|late history failure|does not translate repository storage failures|returns 409 only|drop a contact created after the read began|reloads filtered contacts after event membership changes" \
  --reporter=dot
```

## Every remaining task

- [ ] Confirm GitHub main has not advanced beyond
      `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`.
- [ ] If main advanced, incorporate the newest `github/main` without overwriting unrelated
      merged work and resolve only lane conflicts.
- [ ] Inspect the secondary transient CAS-probe marker and its cleanup ordering.
- [ ] Rerun the complete four-file focused CRM suite and require all tests to pass.
- [ ] Rerun API and web typechecks.
- [ ] Rerun changed-file Biome and `git diff --check`.
- [ ] Rerun `make check && make test && bun run build`.
- [ ] Rerun isolated safe-port CRM Playwright.
- [ ] Run a fresh five-lane goal/code/security/QA/context review against the exact final
      source.
- [ ] Require every fresh reviewer to return `PASS` with no blockers.
- [ ] If a reviewer identifies a real blocker, add one deterministic regression first and
      fix only that blocker.
- [ ] Update PR #37 with the final post-resume commit and exact verification evidence.
- [ ] Verify the PR head equals the pushed branch head.
- [ ] Verify PR #37 remains open and unmerged.
- [ ] Do not deploy.

## Dependencies and merge order

1. This lane already contains GitHub main
   `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`, which included PR #35 and PR #36.
2. On resume, fetch `github/main` before further verification. If it advanced, integrate it
   first.
3. Run focused tests and typechecks before the full gate.
4. Run the full gate before browser QA.
5. Run final independent reviews only after the exact source has passed focused, full,
   and browser verification.
6. Update PR #37 only after all reviews pass.
7. Do not merge or deploy without a new user instruction.

## Dirty, generated, and untracked-file disposition

- Lane-owned checkpoint files:
  - `apps/api/src/features/crm/routes.test.ts`
  - `apps/api/src/features/crm/service.test.ts`
  - `apps/api/src/infrastructure/cloudflare/repositories/crm.ts`
  - `apps/api/src/infrastructure/cloudflare/repositories/repositories.test.ts`
  - `apps/api/src/infrastructure/cloudflare/repositories/shared.ts`
  - `apps/web/src/features/crm/crm-workspace-model.ts`
  - `apps/web/src/features/crm/crm-workspace-views.tsx`
  - `apps/web/src/features/crm/crm-workspace.test.tsx`
  - `docs/handoffs/judge-crm-concurrency.md`
- Generated `.next`, API `dist`, Playwright/test-results, report, and Turbo artifacts were
  removed before checkpointing.
- The debugging journal and its Git exclude entry were removed.
- No migration was added or modified by this checkpoint.
- No unrelated user edits were reverted.
- No force-push, amend, merge, deploy, branch deletion, or worktree deletion was performed.

## Precise resume instructions

```sh
cd /Users/jaeyunha/wt/open-sessionboard/judge-crm-concurrency

git status --short --branch
git fetch github main
git rev-parse github/main
git merge-base --is-ancestor \
  7d6601961367e3eefb87ddbc1cd3236332cc7ee3 HEAD

# If github/main advanced, incorporate it before verification.
# Do not force-push and resolve only this lane's conflicts.

bunx vitest run \
  apps/api/src/features/crm/service.test.ts \
  apps/api/src/features/crm/routes.test.ts \
  apps/api/src/infrastructure/cloudflare/repositories/repositories.test.ts \
  apps/web/src/features/crm/crm-workspace.test.tsx \
  --reporter=dot

bun run --cwd apps/api typecheck
bun run --cwd apps/web typecheck

bunx biome check \
  apps/api/src/features/crm/routes.test.ts \
  apps/api/src/features/crm/service.test.ts \
  apps/api/src/infrastructure/cloudflare/repositories/shared.ts \
  apps/api/src/infrastructure/cloudflare/repositories/crm.ts \
  apps/api/src/infrastructure/cloudflare/repositories/repositories.test.ts \
  apps/web/src/features/crm/crm-workspace-model.ts \
  apps/web/src/features/crm/crm-workspace-views.tsx \
  apps/web/src/features/crm/crm-workspace.test.tsx

git diff --check
make check && make test && bun run build
bun run test:e2e -- tests/e2e/crm-concurrency.spec.ts

gh pr view 37 \
  --repo jaeyunha/eventloom \
  --json url,state,mergedAt,headRefOid,baseRefOid
```

After those commands pass, run a fresh five-lane review. Only then update PR #37. Keep
the lane paused until the user explicitly asks to resume.
