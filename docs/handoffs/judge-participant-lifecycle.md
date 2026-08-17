# Lane handoff: judge-participant-lifecycle

## Pause status

**This lane is paused by user request.**

Do not continue feature implementation, merge PR #38, deploy, delete the branch,
or delete the worktree until the lane is explicitly resumed.

## Repository and working state

- GitHub repository: `https://github.com/jaeyunha/eventloom`
- Local repository lineage: `open-sessionboard` (GitHub redirects to
  `jaeyunha/eventloom`)
- Branch: `judge-participant-lifecycle`
- Worktree:
  `/Users/jaeyunha/wt/open-sessionboard/judge-participant-lifecycle`
- Pull request: https://github.com/jaeyunha/eventloom/pull/38
- PR state at checkpoint preparation: open, non-draft, held for quality
  re-review
- Current GitHub main/base:
  `6467ff1f48c73229c5c45dba6b4716df724a3bdd`
- Local pre-checkpoint HEAD:
  `d0eaafde195ba94650249e4c723fb836bab0885f`
- Pushed PR head before this checkpoint:
  `1eca0fb840c8bb43c077752d7d898b2926f70dd2`
- Final checkpoint commit: use `git rev-parse HEAD` after fetching this branch;
  the GitHub handoff issue links the exact pushed commit.

## Lane objective and narrow scope

PR #38 must remain limited to the independently valid CFP/session corrections:

1. Preserve a submitted proposal as the active record when the applicant uses
   `Edit submission`, navigates Back to Account, and moves forward again.
2. Keep submitted-record hydration separate from per-step draft-save
   permission so Account traversal cannot clear the submission pointer and
   create a new draft.
3. Cover real submitted participant editing through the composed local Worker:
   proposal `PATCH`, participants `PUT`, reload/review, lifecycle-field
   preservation, and same-key replay.
4. Encode `organizationId` and `eventId` in the organizer speaker-operations
   link and cover reserved characters.
5. Preserve the previously accepted CFP-09 edit-state correction and canonical
   organizer route copy/tests.

The invalid accepted co-speaker implementation must remain absent. In
particular, do not restore runtime `speaker_roster` authority, the removed
speaker repository/service writes, grant/invitation/session projection changes,
or the removed generic organizer-speaker E2E.

The deferred canonical accepted-participant redesign is documented privately
at:

`/Users/jaeyunha/dev/open-sessionboard/evidence/private/judge-fix-prompts/participant-lifecycle-canonical-handoff.md`

## Completed implementation

- Rebased the local lane onto GitHub main
  `6467ff1f48c73229c5c45dba6b4716df724a3bdd`.
- Kept the PR diff free of the rejected roster implementation.
- Changed submitted-proposal resumability so hydration is not gated by the
  Account/Welcome save-draft affordance.
- Prevented a previously submitted draft from being persisted on a
  non-saveable traversal step, retaining the active submission ID/version on
  Back/forward navigation.
- Added failing-first model coverage for hydration versus per-step save
  permission.
- Added a composed local-Worker regression that performs submitted proposal
  `PATCH`, participant `PUT`, exact-key retries, draft reload, and review.
- Added a fixture participant custom field so the real Worker regression
  verifies participant custom-answer persistence.
- Added reserved-character route coverage and encoded both route segments with
  `encodeURIComponent`.
- Added a fixture-backed browser regression for completion -> Edit submission
  -> Back -> forward -> participants reload -> review reload.
- Repaired the partial browser test callback so `testInfo.outputPath(...)` is
  syntactically and type-wise available.
- Removed lane-generated `test-results`, `apps/web/.next`, and
  `apps/api/.wrangler/tmp` artifacts before checkpointing.

## Quality review findings

The held PR was rejected at `1eca0fb840c8bb43c077752d7d898b2926f70dd2`
for these narrow findings:

1. Back from submitted proposal editing routes to Account. The previous
   `canResume` policy rejected submitted records there, startup cleared the
   pointer, and forward navigation could create a new draft.
2. The PR lacked a real submitted participant edit covering proposal `PATCH`,
   participants `PUT`, participants/review reload, submitted lifecycle
   preservation, participant IDs/custom answers/version, and exact-key retry
   safety.
3. The organizer speaker-operations link did not encode reserved characters in
   `organizationId` and `eventId`.

## Known unresolved risks

- The final fixture-backed isolated browser suite passed. Earlier failed runs
  remain diagnostic-only and are not release evidence:
  - one was contaminated by shared-disk `ENOSPC` and a truncated trace;
  - one proved the mocked dynamic CFP cannot survive reload because its mocked
    sign-in has no durable session cookie;
  - two fixture-backed attempts used nonexistent custom-field option selectors;
  - one attempt reached the post-edit review successfully but needed to return
    to the completion route before exercising the pre-existing portal handoff.
- `tests/e2e/cfp.spec.ts` has an existing language-server diagnostic at the
  unrelated DOM cleanup helper: `Property 'remove' does not exist on type
  'Node'`. All other changed-file diagnostics are clean, and project typecheck
  passes.
- The local branch was rebased while the pushed PR still points to
  `1eca0fb...`. The user prohibited force-push. Reconcile the remote branch
  history with a non-force merge that preserves the current tree before the
  final push.

## Verification ledger

Update this ledger before pushing the checkpoint.

- [x] Failing-first focused regression observed:
  `bun run test:unit -- apps/web/src/features/cfp/flow.test.ts apps/web/src/features/sessions/session-workspace.component.test.tsx`
  - Expected failures: submitted Account resumability and reserved-character
    route encoding.
- [x] Focused unit regressions after correction:
  `bun run test:unit -- apps/api/src/features/cfp/service.test.ts apps/web/src/features/cfp/api.test.ts apps/web/src/features/cfp/flow.test.ts apps/web/src/features/sessions/session-workspace.component.test.tsx`
  - Passed: 89 tests.
- [x] Real composed-Worker participant lifecycle:
  `bunx vitest run --config tests/runtime/vitest.config.ts tests/runtime/local-worker.test.ts --maxWorkers=1`
  - Passed: 10 tests, including submitted PATCH/PUT/replay/reload/review.
- [x] Typecheck/Biome before the final callback repair:
  `make check`
  - Passed after formatting corrections.
- [x] Changed-file diagnostics after the final callback repair.
  - Clean for all changed files except the unrelated pre-existing
    `tests/e2e/cfp.spec.ts:825` `Node.remove` diagnostic.
- [x] `git diff --check`.
  - Passed with no output.
- [x] Focused CFP/session regressions after the final callback repair.
  - Unit command passed: 4 files, 89 tests.
  - Composed runtime command passed: 1 file, 10 tests.
- [x] `make check` after the final callback repair.
  - Passed typecheck, lint, and format checks across 1,253 files.
- [x] `make test`.
  - Passed with exit code 0, including script, unit, API, and runtime suites.
- [x] Isolated fixture-backed browser QA:
  `node scripts/run-isolated-playwright.mjs tests/e2e/cfp.spec.ts`.
  - Passed: 13 Chromium tests in 4.1 minutes.
- [x] Manual review of the generated `submitted-edit-review.png` screenshot.
  - Passed: the review surface shows the same submitted flow with the updated
    title and all progress steps complete.

## Remaining tasks

### Checkpoint completion

- [x] Run changed-file diagnostics and record lane-caused versus pre-existing
  findings.
- [x] Run `git diff --check`.
- [x] Run the focused CFP/session unit and composed-runtime regressions.
- [x] Run `make check`.
- [x] Run `make test` without weakening or skipping failures.
- [x] Run isolated CFP browser QA and inspect the submitted-edit screenshot.
- [x] Repair only an immediate failure caused by the current partial patch; do
  not expand feature scope.
- [x] Update this verification ledger with exact results.
- [ ] Stage only lane-owned source, test, and this handoff document.
- [ ] Commit with the repository checkpoint/handoff convention.
- [ ] Reconcile the old remote branch into the rebased local history without a
  force-push and without changing the verified tree.
- [ ] Push `judge-participant-lifecycle` to the `github` remote.
- [ ] Update PR #38 metadata and verify its exact head/base/file scope.
- [ ] Create or update exactly one open GitHub issue titled
  `[Lane handoff] judge-participant-lifecycle`.

### Work after explicit resume

- [ ] Obtain quality re-review of the pushed narrow PR.
- [ ] Address only newly proven CFP/session findings in PR #38.
- [ ] Merge PR #38 only after review approval; do not deploy from this lane.
- [ ] Wait for PRs #31, #32, and #33 to merge.
- [ ] After those dependencies merge, create a fresh worktree and branch from
  then-current GitHub main for the canonical accepted-participant lifecycle.
- [ ] Use `submission_participants`, `session_speakers`, verified account
  binding, atomic session CAS/history, effective decisions, idempotency, local
  parity, and a real accepted-primary-speaker E2E as specified in the private
  handoff.
- [ ] Never implement that deferred lifecycle on runtime `speaker_roster`.

## Dependencies and merge order

1. Finish and re-review the narrow PR #38 checkpoint.
2. Do not merge or deploy from this paused lane without explicit instruction.
3. PRs #31, #32, and #33 must merge before starting the separate canonical
   accepted-participant lifecycle branch.
4. Start that future work from then-current `github/main`, not from this
   branch.

## Dirty/generated/untracked-file disposition

- Lane-owned source/test changes are intentionally preserved for checkpoint.
- Generated browser/build/runtime artifacts were removed:
  - `test-results/`
  - `apps/web/.next/`
  - `apps/api/.wrangler/tmp/`
- Do not stage unrelated files or regenerated outputs.
- Before commit, confirm `git status --short` contains only the expected
  lane-owned source/tests and this document.

## Precise resume instructions

```bash
cd /Users/jaeyunha/wt/open-sessionboard/judge-participant-lifecycle
git status --short --branch
git fetch github main judge-participant-lifecycle
git rev-parse HEAD github/main github/judge-participant-lifecycle
gh pr view 38 --json url,state,headRefOid,baseRefName,mergeStateStatus,title

bun run test:unit -- \
  apps/api/src/features/cfp/service.test.ts \
  apps/web/src/features/cfp/api.test.ts \
  apps/web/src/features/cfp/flow.test.ts \
  apps/web/src/features/sessions/session-workspace.component.test.tsx
bunx vitest run --config tests/runtime/vitest.config.ts \
  tests/runtime/local-worker.test.ts --maxWorkers=1
make check
make test
node scripts/run-isolated-playwright.mjs tests/e2e/cfp.spec.ts
```

After verification, compare the PR strictly against current main and confirm
that no speaker-roster files or removed participant-lifecycle E2E returned:

```bash
git diff --name-status github/main...HEAD
git diff --check github/main...HEAD
```

When resuming the deferred canonical lifecycle, do not reuse this worktree or
branch. Follow the private handoff and create a fresh worktree after the
dependency PRs merge.
