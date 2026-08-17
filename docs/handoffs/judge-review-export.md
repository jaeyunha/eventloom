# Lane handoff: judge-review-export

## Paused state

This lane is **paused by user request**. Do not merge, deploy, delete the branch, or
delete the worktree. Resume only after an explicit user instruction.

## Repository and worktree

- GitHub repository: [`jaeyunha/open-sessionboard`](https://github.com/jaeyunha/open-sessionboard)
- GitHub remote: `github` (`https://github.com/jaeyunha/open-sessionboard.git`)
- Branch: `judge-review-export`
- Worktree:
  `/Users/jaeyunha/wt/open-sessionboard/judge-review-export`
- Base incorporated before the checkpoint:
  `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Pre-checkpoint `HEAD` inspected for this handoff:
  `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Current fetched `github/main` at pause time:
  `6467ff9aa0fe41918b0a010de33f984bac8f43e2`
- The pushed checkpoint commit is the commit containing this document. Its exact
  URL is recorded in the GitHub handoff issue.
- Pull request: none exists at pause time. No PR was opened, merged, or deployed.

## Lane objective and scope

Implement the judge review-export lane end to end:

- replace the synchronous organizer CSV export with a durable export run;
- persist run and outbox state in authoritative D1;
- process typed `reports` work through the shared Cloudflare Queue;
- store private CSV artifacts in R2;
- expose organizer-authorized create, status, and download routes;
- provide explicit organizer UI states for queued, running, failed, retry, ready,
  and download;
- preserve submitted-review, score, comment, decision, and human-confirmed
  semantics from the merged review lanes;
- keep retries idempotent and recovery safe across Worker interruption;
- verify the real browser surface without merging or deploying.

Accelevents, social OAuth, provider deployment, and release verification are out
of scope.

## Completed implementation

- [x] Added migration `0034_evaluation_export_jobs.sql` for durable export runs
      and the typed `reports` outbox topic.
- [x] Added D1-backed and in-memory export stores with queued, running, ready,
      and failed states.
- [x] Added processor-attempt fencing, compare-and-set completion, and
      attempt-specific private R2 artifact keys.
- [x] Added generic outbox attempt/lease-owner fencing and lease-expiry-aware
      Queue retries.
- [x] Added bounded scheduled recovery for pending, queued, expired processing,
      failed, dead-letter, and delivered-while-running report work.
- [x] Fenced scheduled recovery to the exact selected outbox state, attempt,
      lease owner, lease expiry, export status, and processor attempt.
- [x] Added deterministic recovery-race coverage proving a fresh successor claim
      cannot be reset or republished.
- [x] Added organizer-only export create, status, and download routes and removed
      the prior synchronous `/export.csv` route.
- [x] Added fixed public failure messages while retaining detailed server-side
      error logging.
- [x] Added safe bounded filenames and authorized private artifact downloads.
- [x] Added plan-scoped D1 export hydration using one `first-primary` session
      batch with fixed query count and a post-hydration plan-version check.
- [x] Excluded draft and withdrawn submissions in line with the merged organizer
      review semantics.
- [x] Preserved submitted reviewer comments, human-confirmed score semantics,
      authoritative free-text values, decisions, and aggregates.
- [x] Added CSV formula protection and final serialized-header uniqueness,
      including adversarial duplicate labels and formula-prefix normalization.
- [x] Added organizer UI request, polling, retry, ready, and download controls.
- [x] Added synchronous same-tick single-flight protection.
- [x] Retained the same idempotency key across ambiguous create/status failures
      and used a new key only for an intentional retry after terminal failure.
- [x] Added five-minute export recovery in staging and production while
      preserving the existing hourly automatic-reminder cadence.
- [x] Added focused API, infrastructure, web, migration/configuration, and
      browser regression coverage.
- [x] Added
      `tests/e2e/review-export-durable.spec.ts`, which exercises same-tick
      activation, idempotent retry, ready state, authorized download, CSV
      contents, desktop rendering, and mobile overflow in a real Chromium
      fixture.
- [x] Completed five independent implementation-review lanes. The final
      security, correctness, goal, context, and focused-QA verdicts were PASS.

## Remaining tasks

- [ ] Fetch and incorporate the latest `github/main`
      (`6467ff9aa0fe41918b0a010de33f984bac8f43e2` at pause time) before any PR.
      Resolve only conflicts owned by this lane.
- [ ] Re-check migration numbering after latest-main integration. Migration
      `0034_evaluation_export_jobs.sql` was unique on base `7d660196...`, but
      upstream advanced after the final integration.
- [ ] Fix or explicitly redesign the mobile Results layout so the fixed bottom
      navigation does not overlap the `Review round` select. Both independent
      screenshot reviewers marked this as blocking.
- [ ] Re-run the durable-export Chromium E2E after the mobile overlap fix and
      inspect fresh desktop and mobile screenshots.
- [ ] Re-run `make check`.
- [ ] Re-run the focused durable-export Vitest set.
- [ ] Re-run `make test`.
- [ ] Re-run `bun run build`.
- [ ] Re-run `make test-e2e` after latest-main integration.
- [ ] Classify the three existing full-matrix Playwright failures against the
      latest main and fix only failures caused by this lane:
  - [ ] `tests/e2e/calendar-date-timezone.spec.ts` - isolated rerun expected a
        publish response `200` but received `400`.
  - [ ] `tests/e2e/organizer-redesign-qa.spec.ts` - isolated rerun could not
        find the expected `Progress Overview` heading.
  - [ ] `tests/e2e/redesign-workspaces.spec.ts` - failed in the full matrix and
        was not isolated again because the lane was paused.
- [ ] Re-run the five-lane implementation review if source or behavior changes
      after resume.
- [ ] Decide and document the private export artifact retention policy. The
      reviewers treated retention as a non-blocking follow-up because no
      repository policy currently specifies a TTL.
- [ ] Open a PR against `main` only after the refreshed base and required gates
      are green. State the exact updated base SHA in the PR.
- [ ] Do not merge or deploy from this checkpoint without a new explicit user
      instruction.

## Known review findings and unresolved risks

### Blocking

- Mobile visual QA found that the fixed bottom navigation overlaps the lower
  portion of the `Review round` select in the ready-state Results card. The
  desktop screenshot passed.
- The branch is based on `7d660196...`, while fetched `github/main` advanced to
  `6467ff9a...` after final implementation review. Compatibility with that newer
  base is unverified.

### Verification gaps and non-blocking follow-up

- The complete existing Playwright matrix is not green on this checkpoint. The
  three failures above were not hidden or weakened.
- The new durable-export E2E passed independently, but it was added after the
  19-file full-matrix run and therefore was not part of that matrix execution.
- Private R2 export retention and cleanup remain policy work, not a proven
  correctness or authorization defect.
- The worktree retains lane-related safety stashes. Do not drop them until the
  resumed lane is re-integrated and verified:
  - `stash@{3}` / `427ed58554020a0ca406b311bce5bb2a0285bae6`
    (`judge-review-export-main-7d660196-integration`)
  - `stash@{6}` / `228dd3b728e35337f5ac9c4888286778c08b82b0`
    (`restored-unrelated-participant-lifecycle-655587df`)
  - `stash@{7}` / `ddf3fec537feead1f2a839e5441dfd8d36888892`
    (`judge-review-export-main-integration`)

## Verification evidence

### Passed

- `git diff --check`
  - Passed before pause; checkpoint rerun is recorded below.
- Focused durable-export Vitest set:
  - 14 files / 206 tests passed.
- `make check`
  - Passed: all package typechecks, Biome lint, and Biome format.
- `make test`
  - Passed: 249 test files, 2,152 tests passed, 3 skipped.
- `bun run build`
  - Passed for contracts, CLI, API, and web.
- `bun test scripts/cloudflare/config.test.mjs`
  - Passed, including the split five-minute export and hourly reminder crons.
- `bun scripts/run-isolated-playwright.mjs tests/e2e/review-export-durable.spec.ts`
  - Passed: 1 Chromium test.
  - Observed one initial POST from same-tick double activation.
  - Observed an idempotent POST replay with the same key after an injected
    transient status failure.
  - Observed ready state and authorized CSV download containing the expected
    header and submitted lifecycle data.
- Five-lane implementation review:
  - Security: PASS.
  - Correctness/quality: PASS.
  - Goal/architecture: PASS.
  - Git/scope/context: PASS.
  - Focused hands-on QA: PASS.

### Failed

- `make test-e2e`
  - Failed after 16 of 19 existing spec files passed.
  - Failing files:
    `calendar-date-timezone.spec.ts`, `organizer-redesign-qa.spec.ts`, and
    `redesign-workspaces.spec.ts`.
- Visual screenshot review
  - Desktop: PASS.
  - Mobile: FAIL because the fixed bottom navigation overlaps the
    `Review round` select.

### Checkpoint verification

- `git diff --check`
  - Passed.
- `bun run --filter @eventloom/api typecheck`
  - Passed.
- `bun run --filter @eventloom/web typecheck`
  - Passed.
- Focused checkpoint Vitest set
  - Passed: 9 files, 78 tests.

## Dependencies and merge order

1. Resume this exact worktree and inspect the handoff issue.
2. Fetch `github/main`.
3. Incorporate latest main into `judge-review-export` before further feature
   changes.
4. Resolve only lane-owned conflicts. Preserve merged review-comment,
   organizer-workspace, form-alignment, reminder, and calendar changes.
5. Re-check migration ordering and run focused tests.
6. Fix the mobile overlap.
7. Run the complete required gates and reviews.
8. Open or update the lane PR.
9. Do not merge or deploy until separately authorized.

## Dirty, generated, and untracked file disposition

- All lane-owned source, migration, test, configuration, and this handoff
  document are intended for the single checkpoint commit.
- Generated browser/build artifacts were removed before checkpointing:
  `apps/web/.next`, `apps/web/.next-playwright-*`, `apps/api/.wrangler`,
  `test-results`, `playwright-report`, and `blob-report`.
- No secrets, runtime databases, browser recordings, build output, or Wrangler
  state are intended for the commit.
- The lane-owned stashes listed above are intentionally preserved.
- After the checkpoint commit, the worktree should be clean and remain at this
  path for resume.

## Precise resume instructions

```bash
cd /Users/jaeyunha/wt/open-sessionboard/judge-review-export
git status --short --branch
git fetch github main
git rev-parse HEAD
git rev-parse github/main
git merge github/main
```

Resolve only conflicts in lane-owned files. Then run the smallest focused set:

```bash
bunx vitest run \
  apps/api/src/features/evaluations/export-jobs.test.ts \
  apps/api/src/features/evaluations/export-job-recovery.test.ts \
  apps/api/src/features/evaluations/routes.test.ts \
  apps/api/src/infrastructure/cloudflare/evaluation-export-jobs.test.ts \
  apps/api/src/infrastructure/cloudflare/evaluation-export-queue.test.ts \
  apps/api/src/infrastructure/cloudflare/outbox-consumer.test.ts \
  apps/web/src/features/reviews/workspace/organizer-results-export.test.ts \
  apps/web/src/features/reviews/workspace/organizer-results-export-attempt.test.ts \
  apps/web/src/features/reviews/workspace/organizer-results-export-controls.test.tsx

bun scripts/run-isolated-playwright.mjs \
  tests/e2e/review-export-durable.spec.ts
```

After fixing the mobile overlap, run:

```bash
make check
make test
bun run build
make test-e2e
```

Then rerun implementation review, open the PR against the refreshed main base,
record the exact base SHA, and wait for explicit merge/deploy authorization.
