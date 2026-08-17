# Lane handoff: judge-participant-lifecycle

## Retained-lane status

**This is an active retained lane. Do not pause or exit it while the narrowed
CFP edit-state objective remains under review.**

PR #38 remains open, clean, unmerged, and undeployed. Do not expand feature
scope, delete the branch, or delete the worktree.

This repository handoff is an explicit lane-coordination deliverable requested
by the user. It records delivery evidence and deferred work; it is not a
product-architecture source.

## Repository and working state

- GitHub repository: `https://github.com/jaeyunha/eventloom`
- Local repository lineage: `open-sessionboard` (GitHub redirects to
  `jaeyunha/eventloom`)
- Branch: `judge-participant-lifecycle`
- Worktree:
  `/Users/jaeyunha/wt/open-sessionboard/judge-participant-lifecycle`
- Pull request: https://github.com/jaeyunha/eventloom/pull/38
- PR state: open, non-draft, merge status `CLEAN`
- Current GitHub main/base:
  `a9d0019eac57aa90503a6623011e570e22620fcf`
- Exact reviewed implementation/source checkpoint:
  `4bbf3407882fdda13aace4c74b7795a4a76c4ac7`
- Subsequent handoff-only commits do not change that reviewed source tree. The
  current branch head is linked from issue #56 and PR #38 because a committed
  document cannot embed its own commit identity.

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

- Rebased the local lane during implementation and then merged the newly
  advanced GitHub main
  `a9d0019eac57aa90503a6623011e570e22620fcf` without rewriting pushed
  history.
- Kept the PR diff free of the rejected roster implementation.
- Changed submitted-proposal resumability so hydration is not gated by the
  Account/Welcome save-draft affordance.
- Prevented a previously submitted draft from being persisted on a
  non-saveable traversal step, retaining the active submission ID/version on
  Back/forward navigation.
- Added failing-first model coverage for hydration versus per-step save
  permission.
- Added a composed local-Worker regression that performs submitted proposal
  `PATCH`, participant `PUT`, participants/review reloads, resubmission, final
  reconciliation, and exact-key retries for every consequential operation.
- Added a fixture participant custom field so the real Worker regression
  verifies participant custom-answer persistence.
- Added reserved-character route coverage and encoded both route segments with
  `encodeURIComponent`; the component regression exercises space, `#`, `%`,
  and `/` in both organization and event IDs.
- Preserved the fixture-backed completion -> participation-portal handoff test
  unchanged.
- Added an isolated controller/browser regression for completion -> Edit
  submission -> Back -> forward that retains the same submitted ID/version,
  creates no replacement draft, and leaves proposal fields hydrated.
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

- The submitted-edit P1 is now isolated in the dynamic controller/browser
  scenario, while the original fixture-backed completion/portal handoff test
  remains unchanged. The final isolated CFP suite passes 13/13. Earlier failed
  runs remain diagnostic-only:
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
- `tests/runtime/local-worker.test.ts` has an unrelated existing language-server
  deprecation hint for `describe.sequential`; project typecheck passes.
- PRs #31, #32, and #33 remain open. Their deferred canonical participant
  lifecycle work must not be pulled into this narrow PR.

## Verification ledger

This ledger records the commands executed against the reviewed source tree.

- [x] Failing-first focused regression observed:
  `bun run test:unit -- apps/web/src/features/cfp/flow.test.ts apps/web/src/features/sessions/session-workspace.component.test.tsx`
  - Expected failures: submitted Account resumability and reserved-character
    route encoding.
- [x] Focused unit regressions after correction:
  `bun run test:unit -- apps/api/src/features/cfp/service.test.ts apps/web/src/features/cfp/api.test.ts apps/web/src/features/cfp/flow.test.ts apps/web/src/features/sessions/session-workspace.component.test.tsx`
  - Retained-lane run passed: 4 files, 76 tests.
- [x] Real composed-Worker participant lifecycle:
  `bunx vitest run --config tests/runtime/vitest.config.ts tests/runtime/local-worker.test.ts --maxWorkers=1`
  - Passed: 10 tests, including submitted PATCH/PUT, participants and review
    reloads, review/resubmit replay, lifecycle preservation, and final
    reconciliation.
- [x] Typecheck/Biome before the final callback repair:
  `make check`
  - Passed after formatting corrections.
- [x] Changed-file diagnostics after the final callback repair.
  - Clean for all changed files except the unrelated pre-existing
    `tests/e2e/cfp.spec.ts:742` `Node.remove` diagnostic.
- [x] `git diff --check`.
  - Passed with no output.
- [x] Focused CFP/session regressions after the final callback repair.
  - Before the final main merge: 4 files, 89 tests.
  - After the final main merge: 4 files, 76 tests.
  - Composed runtime command passed: 1 file, 10 tests.
- [x] `make check` after the final callback repair.
  - Retained-lane run passed typecheck, lint, and format checks across
    1,256 files.
- [x] `make test`.
  - Passed with exit code 0 on the retained-lane head.
  - Unit/integration: 248 files passed, 2,114 tests passed, 3 skipped.
  - Script tests: 123 passed.
  - API tests: 22 passed.
  - Composed runtime: 10 passed.
- [x] Isolated CFP browser QA:
  `node scripts/run-isolated-playwright.mjs tests/e2e/cfp.spec.ts`.
  - Retained-lane run passed: 13 Chromium tests.
  - The focused screenshot shows the same submitted proposal active after
    `Edit submission -> Back -> forward`, with the original fields hydrated.
- [x] Manual review of the generated `submitted-edit-back-forward.png`
  screenshot.
  - Passed: Proposal is active after Back/forward and the original title and
    abstract remain hydrated.
- [x] Five independent retained-lane reviews.
  - Goal/constraint: PASS, confidence 0.92, no blockers.
  - Code quality: PASS, confidence 0.92, no blockers.
  - Security: PASS, no blockers.
  - Hands-on QA: PASS; 76 focused tests, 10 composed-runtime tests, and
    13 isolated Chromium tests passed, and the screenshot was inspected.
  - Context/history: PASS; the narrow scope matches architecture, specification,
    PR/issue history, and the dependency ordering.
  - All five terminal verdicts are PASS.
  - Nonblocking observations were accepted without source churn: the `_step`
    parameter preserves the existing helper signature, skipped persistence
    still reports the stable saved state, and machine-local private handoff
    paths are intentional.
- [x] Explicitly requested repeat five-review source and behavior checks.
  - Goal/constraint: PASS, no blockers.
  - Security: PASS, no blockers.
  - Context/history: PASS, no blockers.
  - Hands-on QA: PASS; 76 focused, 10 composed-runtime, and 13 isolated
    Chromium tests passed, and the submitted-edit screenshot was inspected.
  - Code-quality inspection found no source/test defect.

## Delivery readiness

- [x] Current GitHub main is incorporated at
  `a9d0019eac57aa90503a6623011e570e22620fcf`.
- [x] The narrow CFP/session source and test scope is complete.
- [x] The completion/participation-portal handoff coverage is preserved.
- [x] Focused, composed-runtime, `make check`, `make test`, and isolated browser
  gates pass.
- [x] The first five-review cycle returned PASS from goal/constraint,
  code-quality, security, hands-on QA, and context/history reviewers.
- [x] Complete the explicitly requested repeat source, security, QA, context,
  and goal checks.
- The current branch identity and post-commit delivery verdict are recorded in
  issue #56 and PR #38; this file records the reviewed source identity.
- [x] PR #38 remains unmerged and undeployed pending explicit instruction.

## Deferred canonical lifecycle work

- [ ] Wait for PRs #31, #32, and #33 to merge.
- [ ] Create a fresh worktree and branch from then-current GitHub main.
- [ ] Use `submission_participants`, `session_speakers`, verified account
  binding, atomic session CAS/history, effective decisions, idempotency, local
  parity, and a real accepted-primary-speaker E2E as specified in the private
  handoff.
- [ ] Never implement that deferred lifecycle on runtime `speaker_roster`.

## Dependencies and merge order

1. The narrow PR #38 source checkpoint is complete and reviewed.
2. Do not merge or deploy from this retained lane without explicit instruction.
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
- The handoff-only checkpoint was prepared with no unrelated tracked changes.

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

Keep this retained worktree active for explicit follow-up instruction. The
narrow CFP source objective has no remaining blocker. When starting the
deferred canonical lifecycle later, do not reuse this worktree or branch;
follow the private handoff and create a fresh worktree after the dependency PRs
merge.
