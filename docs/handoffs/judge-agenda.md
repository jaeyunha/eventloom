# Judge Agenda Lane Handoff

> **Paused:** This lane is paused by user request. Do not start new feature work, run
> long-lived lane processes, merge the pull request, or deploy until the user explicitly
> resumes the lane.

## Repository and branch

| Item | Current value |
| --- | --- |
| Canonical GitHub repository | `https://github.com/jaeyunha/eventloom` |
| Configured GitHub remote | `https://github.com/jaeyunha/open-sessionboard.git` (redirects to the canonical repository) |
| Branch | `judge-agenda` |
| Worktree | `/Users/jaeyunha/wt/open-sessionboard/judge-agenda` |
| Last source-bearing implementation HEAD | `5bf6cb6f450ed4cea62aed1d9895e98c4234a064` |
| Remote branch before the handoff checkpoint push | `github/judge-agenda` at `5bf6cb6f450ed4cea62aed1d9895e98c4234a064` |
| Last incorporated `main` / current merge-base | `7d6601961367e3eefb87ddbc1cd3236332cc7ee3` |
| Current fetched `github/main` | `6467ff1f48c73229c5c45dba6b4716df724a3bdd` |
| New `main` commit not yet incorporated | `6823643` — `fix(agenda): make public propagation atomic`, merged by PR #42 |

This document is being delivered as a documentation-only checkpoint commit immediately
after the source-bearing implementation HEAD above. After that push, the current branch
and PR head are the commit containing this file; use `git rev-parse HEAD` to obtain that
checkpoint commit's exact object ID.

The branch is currently behind `github/main`. A read-only merge prediction reports one
content conflict in `apps/api/src/runtime/local.ts`. The seven other overlapping agenda
files currently auto-merge, but they still require semantic review.

## Pull request

- URL: https://github.com/jaeyunha/eventloom/pull/40
- Title: `fix(agenda): require explicit validated publication`
- State: **OPEN**
- Draft: **no**
- Merged: **no** (`mergedAt` is `null`)
- Source-bearing head before the handoff checkpoint push:
  `judge-agenda` at `5bf6cb6f450ed4cea62aed1d9895e98c4234a064`
- PR API `baseRefOid`: `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Current fetched `github/main`: `6467ff1f48c73229c5c45dba6b4716df724a3bdd`
- Current GitHub merge state: **DIRTY**

The PR was reviewed and opened when `main` was
`7d6601961367e3eefb87ddbc1cd3236332cc7ee3`. PR #42 subsequently advanced `main` and
introduced the current conflict. Do not describe the old green verification as
current-main verification until `6467ff1` or a newer fetched `main` is incorporated and
the gates are rerun.

## Lane objective and scope

The lane owns agenda validation, conflict diagnostics, session moves, assisted
scheduling, and the publication boundary needed to make those behaviors durable and
safe.

The required behavior is:

1. Agenda preview reads remain non-mutating.
2. Explicit validation persists the exact validated draft version and timestamp.
3. Validation requires an authenticated actor and optimistic expected-version check.
4. Reloading the same draft preserves validation readiness.
5. A later draft mutation invalidates readiness by advancing the draft version.
6. Publishing is blocked unless the exact current draft has persisted validation.
7. Idempotent publication and failed-handoff retries cannot bypass validation or create
   duplicate revisions.
8. Rejected room or participant conflicts remain visible while the authoritative saved
   draft remains unchanged.
9. Session moves persist through reload.
10. Deterministic local assistance proposes and applies one eligible placement without
    moving sessions that were requested to remain fixed.
11. Public and local speaker labels use neutral fallback copy rather than exposing
    participant identifiers.
12. D1 remains authoritative for validation state, optimistic concurrency, publication
    state, and audit history.

Out of scope:

- Accelevents or other unsupported event-platform integrations.
- Social OAuth.
- Autonomous publication without human action.
- Deployment, staging-provider verification, or production release.
- Unrelated redesign-workspace failures and pre-existing agenda visual debt, except where
  a new merge changes their behavior.

## Completed implementation

- Added `POST /agenda/validate` as the authoritative validation mutation.
- Kept `GET /agenda/preview` read-only.
- Required `expectedVersion` and an explicit authenticated actor for persisted
  validation.
- Persisted `validatedDraftVersion` and `validatedAt` as a paired state invariant.
- Added schema, repository, and D1 trigger guards so one validation marker cannot exist
  without the other.
- Added `apps/api/migrations/0029_agenda_validation_revision.sql`.
- Recorded validation actor and draft-version information in audit history.
- Made publication readiness depend on persisted exact-version validation rather than an
  ephemeral preview.
- Moved validation checks before idempotent publication returns and failed-handoff retry
  paths.
- Ensured HTTP publication delegates through `AgendaEngine.publish()`.
- Preserved publication idempotency without duplicate immutable revisions.
- Preserved authoritative saved-draft data while returning rejected candidate conflict
  diagnostics.
- Kept actionable saved-draft warnings from being replaced by rejected-candidate
  warnings.
- Corrected assisted scheduling to use authoritative schedule dates.
- Honored the “keep scheduled sessions fixed” option even when room occupancy is ignored.
- Added a deterministic local suggestion provider for reproducible browser QA.
- Made local and demo publication validate first with an explicit actor.
- Kept demo publication from mutating the draft version and made repeat publication
  idempotent.
- Replaced missing or blank speaker-name fallbacks with neutral `Speaker` copy in the
  lane-owned paths.
- Updated calendar and local-worker flows to follow the explicit-validation publication
  contract.
- Added failing-first and regression coverage across the engine, routes, D1 repository,
  runtime, web adapter/model/demo, API security, calendar, and Playwright surfaces.
- Generated and reviewed six agenda UI states:
  - `agenda-conflict-visible.png`
  - `agenda-validation-persisted.png`
  - `agenda-move-persisted.png`
  - `agenda-assisted-placement-proposed.png`
  - `agenda-assisted-placement-applied.png`
  - `agenda-assisted-placement-entry-persisted.png`
- Committed and pushed the implementation:
  `5bf6cb6f450ed4cea62aed1d9895e98c4234a064`
  (`fix(agenda): require explicit validated publication`).
- Opened PR #40 without merging or deploying.
- Stopped lane-owned background runners and confirmed all known agenda reviewers and child
  tasks had completed before the user-requested pause.

## Remaining tasks

No feature implementation was in flight when the lane was paused. The remaining work is
current-main integration, regression verification, and PR maintenance.

- [ ] **Wait for explicit user resume.** Do not begin any item below while the pause is
      active.
- [ ] **Preserve this handoff file.** It is committed as the paused-lane checkpoint; do
      not discard or rewrite it during integration.
- [ ] **Refresh the base.** From the lane worktree, run `git fetch github main`, record
      the resulting exact `github/main` SHA, and compare it with the currently observed
      `6467ff1f48c73229c5c45dba6b4716df724a3bdd`.
- [ ] **Incorporate current `main`.** Merge the freshly fetched `github/main` into
      `judge-agenda`; do not rebase, force-push, or overwrite unrelated merged work.
- [ ] **Resolve only the predicted lane conflict.** Reconcile
      `apps/api/src/runtime/local.ts` by preserving both:
  - the lane's deterministic local agenda suggestion provider;
  - the lane's explicit `agendaEngine.validate(...)` call before local publication;
  - main's shared `InMemoryAgendaMutationLock`;
  - main's publication reservation ownership, atomic materialization, cleanup, and cache
    invalidation paths;
  - neutral `Speaker` fallback labels instead of the participant-ID fallbacks introduced
    in the new local publication materialization code.
- [ ] **Stop and reassess if additional conflicts appear.** The current read-only
      prediction reports only `apps/api/src/runtime/local.ts`; unexpected conflicts may
      mean `main` advanced again.
- [ ] **Review all overlapping files semantically.** Confirm both validation and
      atomic public propagation in:
  - `apps/api/src/features/agenda/catalog-sync.test.ts`
  - `apps/api/src/features/agenda/engine.test.ts`
  - `apps/api/src/features/agenda/engine.ts`
  - `apps/api/src/features/agenda/types.ts`
  - `apps/api/src/routes/agenda.test.ts`
  - `apps/api/src/routes/agenda.ts`
  - `apps/api/src/runtime/airtable.ts`
  - `apps/api/src/runtime/local.ts`
- [ ] **Recheck publication invariants after the merge.** Validation must still happen
      before idempotent returns, reservations, materialization, retries, or public cache
      changes; failed atomic propagation must not mark an unvalidated draft published.
- [ ] **Recheck speaker privacy after the merge.** New main code currently contains local
      participant-ID display-name fallbacks; replace those with neutral labels in the
      conflict resolution and lock the result with coverage.
- [ ] **Verify migration order on fresh and populated local D1 stores.** The expected
      sequence after integration includes main's `0028_remove_event_status.sql`, the
      lane's `0029_agenda_validation_revision.sql`, main's
      `0033_private_download_capabilities.sql`, and main's
      `0034_program_publication_reservations.sql`.
- [ ] **Run changed-file diagnostics.** Check the merged agenda engine, route, runtime,
      repository, web, and test files with the language server before builds.
- [ ] **Run focused unit and integration tests.** At minimum cover agenda engine,
      catalog synchronization, routes, D1 repository, local worker/runtime, web
      model/API/demo, API security, and the new publication-reservation/propagation tests.
- [ ] **Run `make check`.** It must pass on the newly incorporated main revision.
- [ ] **Run `make test`.** It must pass on the newly incorporated main revision.
- [ ] **Run `make build`.** Confirm the API Wrangler dry-run and Next production build.
- [ ] **Run `bun run --filter @eventloom/web cloudflare:build`.** Confirm the OpenNext
      Cloudflare build.
- [ ] **Run focused isolated Playwright on safe ports.** Include the agenda judge
      regression, calendar consistency/date-timezone/temporal-integrity scenarios, and
      main's embed-propagation scenario.
- [ ] **Run the full local Playwright gate.** If the same two
      `redesign-workspaces.spec.ts` tests fail, reconfirm that the failure surfaces remain
      outside this branch's delta rather than assuming the old classification still
      applies.
- [ ] **Repeat real agenda UI QA.** Capture fresh conflict, validation, move, proposal,
      applied-placement, and persisted-entry screenshots after integration.
- [ ] **Repeat functional, fidelity, and accessibility review** if the merge changes any
      visible agenda behavior.
- [ ] **Run final hygiene checks.** Include `git diff --check`, migration checks, secret
      scanning of added lines, and a clean staged-diff review.
- [ ] **Commit only the verified integration.** Preserve repository commit conventions
      and do not mix unrelated cleanup into the merge resolution.
- [ ] **Push `judge-agenda` normally.** Do not force-push.
- [ ] **Update PR #40.** State the newly incorporated exact base SHA, migration order,
      current verification evidence, and any remaining full-E2E exception.
- [ ] **Verify PR metadata.** Confirm base `main`, head `judge-agenda`, expected head SHA,
      `OPEN` state, and a non-conflicting/mergeable status.
- [ ] **Do not merge or deploy.** Wait for a separate explicit user instruction even
      after the PR becomes green.

## Known review findings and unresolved risks

### Final lane reviews before `main` advanced

- Goal/contract review: **PASS**.
- Security review: **PASS**.
- Code-quality review: **PASS**.
- Hands-on agenda QA review: **PASS**.
- Branch/context and PR-readiness review: **PASS**.
- Final functional and visual-fidelity screenshot reviews: **PASS**.
- GitHub has no submitted human PR review recorded on PR #40.

Those passes apply to head `5bf6cb6f450ed4cea62aed1d9895e98c4234a064` on incorporated
base `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`. They do not cover the
unincorporated atomic-propagation work now on `github/main`.

### Current unresolved risks

1. **PR #40 is conflicted with current main.** GitHub reports `DIRTY`.
2. **The predicted content conflict is in `apps/api/src/runtime/local.ts`.** That file is
   where deterministic assistance, explicit validation, atomic publication reservations,
   speaker projection materialization, and cache invalidation now meet.
3. **Eight agenda/runtime files changed on both sides.** They auto-merge in the current
   prediction, but an auto-merge does not prove that exact-version validation and atomic
   public propagation compose correctly.
4. **New main code includes participant-ID display-name fallbacks in local publication
   materialization.** The lane's security invariant requires neutral fallback copy.
5. **Post-`6467ff1` verification is unrun.** All green evidence below predates the new
   main integration.
6. **The full 20-file Playwright run was not globally green.** Two repeated tests in
   `tests/e2e/redesign-workspaces.spec.ts` failed:
   - the submission dark-mode scenario landed on the submissions list instead of detail;
   - the Speaker Onboarding tab click timed out.
   The file and related feature surfaces were outside the lane delta at the reviewed base,
   but that classification must be reconfirmed after the next integration. This remains
   the only recorded unrelated/pre-existing verification failure; the paused-checkpoint
   validation introduced no new failure.
7. **Pre-existing visual/accessibility debt remains.** Reviewers noted compact conflict
   card clipping/overflow, truncated placement-queue titles, and a weak or absent visible
   keyboard-focus indication on schedule-view tabs. These were not attributed to the
   lane's behavioral fix.
8. **No deployed or provider-backed acceptance was performed.** Evidence is local/source
   only; it is not release verification.
9. **The ignored debug journal is stale.** `.omo/debug/judge-agenda.md` documents useful
   hypotheses and failing-first evidence, but its final “Next action” predates the
   completed implementation and must not be treated as current task state.

## Verification evidence

Statuses below are exact for the reviewed branch head
`5bf6cb6f450ed4cea62aed1d9895e98c4234a064` with merge-base
`7d6601961367e3eefb87ddbc1cd3236332cc7ee3`.

| Command or check | Status | Evidence and limitation |
| --- | --- | --- |
| `make check` | **PASS** | All workspace typechecks passed; Biome checked 1,254 files. Not rerun after `github/main` advanced to `6467ff1`. |
| `make test` | **PASS** | 246 Vitest files passed; 2,105 tests passed and 3 skipped; 123 script tests, 22 API tests, and 10 runtime tests passed. Not rerun after `6467ff1`. |
| `make build` | **PASS** | API Wrangler dry-run and Next production build passed. Not rerun after `6467ff1`. |
| `bun run --filter @eventloom/web cloudflare:build` | **PASS** | OpenNext Cloudflare build passed. Not rerun after `6467ff1`. |
| `bun run test:e2e -- tests/e2e/agenda-judge-regression.spec.ts tests/e2e/calendar-consistency-qa.spec.ts tests/e2e/calendar-date-timezone.spec.ts tests/e2e/calendar-temporal-integrity.spec.ts` | **PASS** | Four isolated files and six browser tests passed. Not rerun after `6467ff1`. |
| `bun run test:e2e -- tests/e2e/agenda-judge-regression.spec.ts` | **PASS** | Final PR-head regeneration passed 1/1 and produced six 1440x1000 screenshots. Not rerun after `6467ff1`. |
| Full `bun run test:e2e` 20-file gate | **FAIL** | 19 of 20 files passed, including the agenda/calendar scenarios; two tests in the remaining `tests/e2e/redesign-workspaces.spec.ts` file failed as described above. Classified as outside the lane delta at base `7d660196`; classification not yet reconfirmed against `6467ff1`. |
| `CI=1 bunx wrangler d1 migrations apply DB --cwd apps/api --local --persist-to <temporary-dir>` | **PASS** | The then-current fresh local migration chain applied and exposed both validation-marker columns. Main's new `0034` migration is not covered by this old run. |
| Focused agenda engine and route tests | **PASS** | 57 tests passed on the reviewed head. |
| Focused migration/script tests | **PASS** | 122 tests passed in the earlier focused run; the final full `make test` subsequently reported 123 script tests passed. |
| `git diff --check` | **PASS** | Passed at the paused checkpoint; `git diff --cached --check` also passed after staging this documentation-only commit. |
| Handoff structure and revision-reference test | **PASS** | Required all 11 sections, balanced fenced blocks, 26 detailed checkboxes, the PR URL, pause statement, and exact head/base/merge-base values. |
| TypeScript typecheck specific to the current partial patch | **UNRUN** | Not applicable: the checkpoint patch is Markdown-only and no `.ts` or `.tsx` file is modified. The last source-bearing `make check` result remains the earlier PASS above. |
| Changed-file LSP diagnostics | **PASS** | No errors in the changed API, runtime, repository, web, or test areas on the reviewed head. |
| Fresh agenda real-surface screenshot QA | **PASS** | Six 1440x1000 PNGs were generated and inspected; functional and final fidelity reviewers passed the lane. |
| Goal, security, quality, QA, and context agent reviews | **PASS** | Final review wave passed before PR creation. |
| `git merge-tree --write-tree --name-only HEAD github/main` | **FAIL** | Current read-only prediction exits nonzero because `apps/api/src/runtime/local.ts` conflicts with `github/main` `6467ff1`. |
| Verification after incorporating current `github/main` | **UNRUN** | Required after resume. |
| Staging/provider/deployed-browser verification | **UNRUN** | Deliberately not performed; no release claim is valid. |
| Deployment | **UNRUN** | Explicitly prohibited for this lane. |
| Merge of PR #40 | **UNRUN** | Explicitly prohibited; PR remains open. |

## Dependencies and merge order

1. PR #42 (`fix(agenda): make public propagation atomic`) is already merged into
   `github/main` at `6467ff1f48c73229c5c45dba6b4716df724a3bdd`.
2. That main revision, or whatever newer revision is fetched after resume, must be merged
   into `judge-agenda` before PR #40 can be considered current or mergeable.
3. Resolve `apps/api/src/runtime/local.ts` first because it combines both lanes'
   publication composition.
4. Review the seven additional auto-merged overlapping files before accepting the merge.
5. Verify migration order. There is no current number collision:
   - main: `0028_remove_event_status.sql`
   - judge-agenda: `0029_agenda_validation_revision.sql`
   - main: `0033_private_download_capabilities.sql`
   - main: `0034_program_publication_reservations.sql`
6. Run focused validation/publication/propagation checks before broad repository gates.
7. Run builds and browser QA only after the focused checks are green.
8. Complete final review, commit the integration, push the branch, and update PR #40.
9. Do not merge PR #40 and do not deploy without a new explicit user instruction.

## Dirty, generated, and untracked-file disposition

Before this handoff was created:

- The tracked worktree and index were clean.
- `judge-agenda` matched `github/judge-agenda` at
  `5bf6cb6f450ed4cea62aed1d9895e98c4234a064`.
- There were no non-ignored untracked files.
- There was no merge in progress.

After this handoff was created:

- `docs/handoffs/judge-agenda.md` was initially the only non-ignored untracked file.
- The user subsequently explicitly requested that the lane-owned handoff be staged,
  committed with a checkpoint/handoff message, and pushed normally.
- This document is the only file in that documentation-only checkpoint commit.
- No tracked implementation file was modified by the handoff operation.
- The user subsequently requested a checkpoint cleanup. The orphaned lane `workerd`
  process was stopped, and generated browser/build artifacts were removed:
  `apps/api/.wrangler/`, `apps/api/dist/`, `apps/web/.next/`,
  `apps/web/.open-next/`, `apps/web/.next-playwright-isolated-*/`,
  `apps/web/next-env.d.ts`, `apps/web/tsconfig.tsbuildinfo`,
  `packages/cli/dist/`, and `test-results/`.
- The six agenda screenshots were therefore removed with `test-results/`. Regenerate them
  after integrating current main.

The remaining ignored local material is intentional and must not be committed or removed
as generated output:

- secrets and local configuration: `.env`, `apps/web/.env.local`;
- agent/debug state: `.omo/`;
- installed dependencies: root and workspace `node_modules/`.

## Precise resume instructions

1. Obtain explicit confirmation from the user that `judge-agenda` is resumed.
2. Open the lane worktree:

   ```sh
   cd /Users/jaeyunha/wt/open-sessionboard/judge-agenda
   ```

3. Confirm the preserved state before changing anything:

   ```sh
   git status --short --branch
   git rev-parse HEAD
   git rev-parse github/judge-agenda
   ```

   Expected source-bearing implementation ancestor:
   `5bf6cb6f450ed4cea62aed1d9895e98c4234a064`. The current branch HEAD should be the
   documentation-only checkpoint commit that contains this file.

4. Fetch and record the actual current base:

   ```sh
   git fetch github main
   git rev-parse github/main
   git merge-base HEAD github/main
   ```

5. Inspect what changed since the last incorporated base:

   ```sh
   git log --oneline 7d6601961367e3eefb87ddbc1cd3236332cc7ee3..github/main
   git diff --name-status 7d6601961367e3eefb87ddbc1cd3236332cc7ee3..github/main
   git merge-tree --write-tree --name-only HEAD github/main
   ```

6. Merge, rather than rebase, the fetched main:

   ```sh
   git merge github/main
   ```

7. Resolve only agenda-owned conflicts. For the currently predicted
   `apps/api/src/runtime/local.ts` conflict, preserve:
   - main's shared mutation lock and atomic publication reservation/handoff;
   - the lane's deterministic local suggestion provider;
   - explicit exact-version validation before publication;
   - neutral `Speaker` fallback copy;
   - cache invalidation only after successful materialization;
   - rollback/failure behavior for an unsuccessful handoff.

8. Review every auto-merged overlapping file listed in the remaining-task checklist.
   If `main` advanced and new conflicts or unrelated changes appear, stop and re-scope
   rather than overwriting them.
9. Run the focused diagnostics, tests, migration checks, repository gates, builds, and
   Playwright/visual QA listed above.
10. Review the final diff and complete the merge commit only after the checks are green.
    Do not include unrelated generated or ignored files.
11. Push normally:

    ```sh
    git push github judge-agenda
    ```

12. Update and verify PR #40:

    ```sh
    gh pr view 40 --repo jaeyunha/eventloom \
      --json url,state,isDraft,mergedAt,headRefName,headRefOid,baseRefName,baseRefOid,mergeStateStatus
    ```

13. Report the new exact base SHA, head SHA, verification results, and any residual
    failures. Keep all evidence labeled local/source-only.
14. Leave PR #40 open. Do not merge or deploy until the user explicitly asks.
