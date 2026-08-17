# Lane handoff: judge-decisions-session

> **Paused by user request on 2026-08-17.** Do not merge or deploy this lane. Resume only after reading this document and the linked GitHub issue.

## Repository, branch, and worktree

- Repository: `jaeyunha/eventloom`
- Branch: [`judge-decisions-session`](https://github.com/jaeyunha/eventloom/tree/judge-decisions-session)
- Worktree: `/Users/jaeyunha/wt/open-sessionboard/judge-decisions-session`
- Pull request: [PR #33](https://github.com/jaeyunha/eventloom/pull/33), open and not merged
- Requested incorporated base: `7d6601967bc8d2b56348166804d5185ad8a467ae`
- Committed HEAD before this checkpoint commit: `3203f8f545c1fb55bf16b78be35cc6891ba73922`
- Merge base with the requested PR #36 revision: `7d6601967bc8d2b56348166804d5185ad8a467ae`
- Latest observed `github/main` at pause time: `6467ff12c75d31119aa7aa4b261d5b783507d9f8`
- The checkpoint commit containing this document is linked from the handoff issue because a commit cannot contain its own final SHA.

## Lane objective and scope

The lane owns the non-AI organizer evaluation decision lifecycle:

1. Keep proposal-specific decision editors isolated.
2. Keep authoritative saved decision status, reason, and version in parent state.
3. Preserve decision-plan identity and existing decision versions when optional review-detail loading fails.
4. Maintain optimistic concurrency, replay idempotency, applicant outcome projection, accepted-session cardinality, and exactly one canonical decision communication.
5. Enforce an explicit CFP lifecycle allowlist for reviewable submissions and filter organizer/reviewer evaluation artifacts consistently.
6. Deny evaluation reads and writes for draft, withdrawn, missing, and unknown submission statuses, including a final status recheck immediately before mutations.

This lane must not merge or deploy while paused.

## Completed implementation in the checkpoint

- Retained the original keyed `DecisionEditor` remount between submissions.
- Added parent-owned per-submission decision overrides carrying the complete saved `{status, reason, version}`.
- Updated table/filter derivation from the effective parent decision state.
- Added local-override reconciliation against newer authoritative seed versions.
- Included the decision version in editor identity so newer server state remounts the editor.
- Added the mounted return-to-A and amend-A regression alongside the original accept-A/reject-B regression.
- Added an independent fallback plan lookup when optional organizer workspace details fail.
- Added fallback loading of the existing decision record and its history/version.
- Initialized the submission-detail decision reason from the current decision history.
- Removed the separate acceptance-handoff email so the versioned decision projection remains the canonical decision-communication owner.
- Added production-shaped decision communication, acceptance handoff, replay, stale-write, concurrent-writer, and accepted-session assertions.
- Prevented historical idempotency-key replay from rerunning older projection side effects after a newer decision exists.
- Added a true concurrent decision amendment regression.
- Merged the requested PR #36 main revision `7d6601967bc8d2b56348166804d5185ad8a467ae`.
- Added the explicit reviewable submission allowlist: `submitted` and `reopened`.
- Added or partially added lifecycle filtering for organizer submissions/workspace data, assignments, reviews, aggregates, progress, and decisions.
- Added lifecycle checks to decision reads and writes and final mutation-boundary rechecks.
- Added direct HTTP regressions for draft, withdrawn, unknown, submitted, and reopened decision paths.
- Added an orphan-decision workspace regression.
- Removed generated Playwright `test-results` and `.next-playwright-*` directories before checkpointing.

## Remaining tasks

### Parent decision state and degraded-plan path

- [ ] Add or finish a deterministic regression proving a newer authoritative seed version supersedes a local override without reload.
- [ ] Re-review the controller override reconciliation and version-key remount after the PR #36 merge.
- [ ] Rerun the original accept-A/reject-B mounted browser regression on current main.
- [ ] Rerun the return-to-A/amend-A mounted browser regression on current main.
- [ ] Finish the degraded create-decision browser regression after lifecycle filtering changed fixture visibility.
- [ ] Finish the degraded existing-decision amendment browser regression and verify the loaded reason/version.
- [ ] Replace or explicitly seed the current E2E submission IDs so all four decision tests use `submitted` or `reopened` fixture submissions.

### Lifecycle boundary

- [ ] Audit every production `SubmissionReviewMaterial` producer to confirm it supplies authoritative CFP lifecycle status.
- [ ] Confirm `isReviewableSubmission` remains an explicit allowlist and does not admit undefined or legacy statuses.
- [ ] Verify organizer submission lists return only `submitted` and `reopened` records.
- [ ] Verify organizer workspace submissions filter draft, withdrawn, terminal, missing, and unknown statuses.
- [ ] Finalize the distinction between reviewable submissions and active reviewer queues after an evaluation decision exists.
- [ ] Verify organizer and reviewer assignment endpoints filter lifecycle-orphaned assignments consistently.
- [ ] Verify submitted-review endpoints hide lifecycle-orphaned reviews while retaining valid historical evidence.
- [ ] Verify aggregate and progress endpoints exclude lifecycle-orphaned data consistently.
- [ ] Verify organizer workspace decisions exclude orphan decisions.
- [ ] Verify `getDecision` and `recordDecision` deny draft, withdrawn, missing, and unknown statuses.
- [ ] Verify decision amendments remain allowed for `submitted` and `reopened` submissions that already have a decision.
- [ ] Verify assignment, replacement, unassignment, save-review, submit-review, conflict, and decision mutation paths recheck status immediately before their final repository write.
- [ ] Rerun and stabilize the direct lifecycle HTTP regression added to `routes.test.ts`.
- [ ] Rerun the orphan-decision and final-boundary service regressions in the full evaluation suite.

### Session, applicant, replay, and outbox behavior

- [ ] Decide and implement the required behavior when an accepted decision is later amended to rejected or waitlisted; current accepted-session revocation/demotion is unresolved.
- [ ] Verify exactly one schedulable accepted session and zero rejected sessions through production adapters.
- [ ] Verify accepted and rejected applicant-facing statuses through the production-shaped adapter path.
- [ ] Verify same-key replay remains idempotent before and after a newer decision version.
- [ ] Verify one accepted and one rejected canonical decision outbox intent, with no duplicate acceptance-handoff email.
- [ ] Run one integrated production-shaped scenario combining persistence, projection, acceptance handoff, replay, stale concurrency, session cardinality, and exact outbox rows.

### Review and verification

- [ ] Incorporate current `github/main` (`6467ff12c75d31119aa7aa4b261d5b783507d9f8` at pause time) before final verification, resolving only lane conflicts.
- [ ] Run `make check`.
- [ ] Run `make test`.
- [ ] Run the focused evaluation service/routes/repository/runtime/web suites sequentially.
- [ ] Run all four decision Playwright regressions on unused safe ports.
- [ ] Run the complete `redesign-workspaces.spec.ts` isolated-port file.
- [ ] Run `make test-e2e` and separate lane failures from pre-existing unrelated failures.
- [ ] Repeat manual browser QA for table/filter/editor persistence, degraded-plan usability, and post-reload outcomes.
- [ ] Repeat visual QA for accepted/rejected badges and the restored editor.
- [ ] Rerun the five-part post-implementation review; goal and quality reviews must pass.
- [ ] Update PR #33 body and comments with the final base SHA and verification evidence.
- [ ] Keep PR #33 open; do not merge or deploy.

## Review findings and unresolved risks

### Goal review

The last goal review failed before the latest patches because:

- Degraded plan fallback did not load an existing decision/version. A loader and test were added, but the post-PR #36 browser regression is not green.
- Historical replay could rerun old projection side effects. The service now returns the current decision without rerunning older side effects; a focused regression was added.
- The concurrent-writer test was not a genuine same-version race. A true concurrent amendment test was added.
- Accepted-to-rejected amendments do not revoke or demote the accepted session. This remains unresolved.
- No single integrated production-service test yet proves all applicant/session/outbox invariants together.

### Code-quality review

The last quality review failed because local decision overrides could permanently shadow a newer authoritative seed. The controller now ignores local overrides whose version is not newer than the server seed, and the editor key includes the decision version. This has not been re-reviewed after the PR #36 merge.

### Security review

The lane-specific security reassessment passed. It classified these as pre-existing repository-wide residual risks, not introduced by this patch:

- Decision persistence occurs before some projection/handoff side effects.
- Communication recipient IDs are globally keyed rather than tenant/event namespaced.
- Multi-submission participant audience replacement can be last-write-wins.
- A shared multi-recipient `to` array depends on provider fanout/privacy semantics.

Do not silently expand this lane to address those risks without a new explicit scope decision.

### Context review

The context/history review passed against the earlier mainline and found the PR #30/#36 overlaps independent. It is stale because `github/main` advanced to `6467ff12c75d31119aa7aa4b261d5b783507d9f8` after the requested `7d66019` incorporation.

## Verification ledger

### Current checkpoint checks

- **PASS** — `git diff --check`
- **PASS** — `bun run --filter @eventloom/api typecheck`
- **PASS** — `bun run --filter @eventloom/web typecheck`
- **PASS on exact JSON rerun (5/5)** — focused Vitest command:

  ```sh
  bunx vitest run \
    apps/api/src/features/evaluations/service.test.ts \
    apps/api/src/features/evaluations/routes.test.ts \
    apps/web/src/features/admin/submission-workspace.test.tsx \
    --maxWorkers=1 \
    --testNamePattern='rechecks the reviewable lifecycle status at the final decision boundary|does not replay historical projection side effects after a newer decision|allows exactly one concurrent amendment for the current version|filters non-reviewable lifecycle statuses and denies their decision APIs|keeps canonical detail content when optional evaluation data has no plan or is unavailable' \
    --reporter=json
  ```

- **UNSTABLE / requires rerun** — the immediately preceding `--reporter=basic` run of the same focused selection reported `1 failed, 3 passed` with truncated failure output; the exact JSON rerun then reported `5 passed, 0 failed`. Treat this as a testing reliability gap, not as a clean final gate.

### Current broader checks after PR #36

- **FAIL, not rerun after the last immediate repairs** — combined focused integration run across evaluation service/routes/repository/runtime/speaker/web reported `14 failed, 171 passed`.
- **FAIL (4/4)** — the four decision Playwright regressions on ports `3038/8808/9265`. The PR #36 lifecycle filter removed the selected fixture submissions or disabled their decision controls. No post-repair browser rerun was performed because the user paused the lane.
- **UNRUN at checkpoint** — `make check`
- **UNRUN at checkpoint** — `make test`
- **UNRUN at checkpoint** — complete current-main Playwright gate
- **UNRUN at checkpoint** — current-main manual and visual QA

### Earlier evidence on the pre-PR #36 base

- `make check` passed.
- `make test` passed.
- The original accept/reject decision Playwright regression passed.
- The return-and-amend and missing-plan focused browser regressions passed before the later lifecycle merge.
- The complete `redesign-workspaces.spec.ts` had the decision tests green but unrelated dark-mode/drawer/speaker failures.
- The complete E2E gate had unrelated CFP and redesign failures.

Earlier green evidence must not be treated as final evidence for the current checkpoint.

## Dependencies and merge order

1. The requested PR #36 base `7d6601967bc8d2b56348166804d5185ad8a467ae` is incorporated in committed HEAD `3203f8f545c1fb55bf16b78be35cc6891ba73922`.
2. `github/main` subsequently advanced to `6467ff12c75d31119aa7aa4b261d5b783507d9f8`; incorporate the latest main before final validation.
3. Preserve changes from other judge lanes. The touched high-overlap files are:
   - `apps/api/src/features/evaluations/service.ts`
   - `apps/api/src/features/evaluations/service.test.ts`
   - `apps/api/src/features/evaluations/routes.test.ts`
   - `apps/api/src/runtime/airtable.ts`
   - `apps/api/src/runtime/composition.test.ts`
   - `tests/e2e/redesign-workspaces.spec.ts`
4. Do not merge PR #33 until the goal and quality reviews pass and the current-main verification ledger is clean or explicitly explained.

## Dirty, generated, untracked, and stash disposition

Before the checkpoint commit, the worktree contained only lane-owned tracked modifications in:

- `apps/api/src/features/evaluations/routes.test.ts`
- `apps/api/src/features/evaluations/service.test.ts`
- `apps/api/src/features/evaluations/service.ts`
- `apps/api/src/infrastructure/cloudflare/repositories/speaker-lifecycle.test.ts`
- `apps/api/src/runtime/airtable.ts`
- `apps/api/src/runtime/composition.test.ts`
- `apps/web/src/features/admin/submission-workspace-model.ts`
- `apps/web/src/features/admin/submission-workspace-views.tsx`
- `apps/web/src/features/admin/submission-workspace.test.tsx`
- `apps/web/src/features/reviews/workspace/organizer-decision-editor.tsx`
- `apps/web/src/features/reviews/workspace/organizer-view-controller.ts`
- `apps/web/src/features/reviews/workspace/organizer-view-decisions-panel.tsx`
- `tests/e2e/redesign-workspaces.spec.ts`
- this handoff document

Generated `test-results`, Playwright report directories, and `.next-playwright-*` builds were removed.

The shared repository stash namespace still contains `On judge-decisions-session: pr33-review-fixes` from 2026-08-17 13:09:33. The patch is already applied in this worktree. **Do not apply that stash again and do not delete shared stashes without coordinating with the owning lanes.**

## Precise resume instructions

```sh
cd /Users/jaeyunha/wt/open-sessionboard/judge-decisions-session
git status --short
git log -5 --oneline --decorate
git fetch github main
git rev-parse HEAD github/main
git diff github/main...HEAD --stat
```

Then:

1. Read this handoff and the GitHub issue titled `[Lane handoff] judge-decisions-session`.
2. Confirm the worktree is clean at the pushed checkpoint.
3. Incorporate the latest `github/main` without force-pushing and resolve only lane conflicts.
4. Re-open the lifecycle and decision diffs before editing:

   ```sh
   git diff github/main...HEAD -- \
     apps/api/src/features/evaluations \
     apps/api/src/runtime/airtable.ts \
     apps/web/src/features/admin \
     apps/web/src/features/reviews/workspace \
     tests/e2e/redesign-workspaces.spec.ts
   ```

5. Start with the failing four decision E2E scenarios: seed or select authoritative `submitted`/`reopened` fixture submissions.
6. Stabilize and rerun the five focused Vitest regressions.
7. Complete the lifecycle filtering and final-boundary audit using the checkbox list above.
8. Resolve the accepted-session amendment decision before claiming session cardinality complete.
9. Run the full current-main verification and five-part review.
10. Update PR #33; keep it open and do not merge or deploy until explicitly authorized.
