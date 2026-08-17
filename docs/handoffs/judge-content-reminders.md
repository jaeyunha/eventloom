# Lane handoff: judge-content-reminders

## Paused state

This lane is **paused by user request**. Do not continue feature work, merge, or
deploy until the lane is explicitly resumed.

## Repository and branch

- GitHub repository: [jaeyunha/eventloom](https://github.com/jaeyunha/eventloom)
  (the configured `github` remote still uses the previous
  `jaeyunha/open-sessionboard.git` URL and redirects to the canonical repository).
- Branch: `judge-content-reminders`
- Worktree:
  `/Users/jaeyunha/wt/open-sessionboard/judge-content-reminders`
- Pushed branch URL after checkpoint:
  <https://github.com/jaeyunha/eventloom/tree/judge-content-reminders>

## Objective and scope

The lane addresses the content-reminder judge finding by making organizer
reminders use an exact, human-confirmed, event-scoped snapshot of outstanding
speaker deliverables.

In scope:

- Preview at least two recipients and multiple outstanding assignments for one
  recipient.
- Require explicit human confirmation before queueing.
- Bind preview and queue to the same canonical snapshot.
- Make queueing durable, idempotent, retryable, and auditable.
- Keep queue and history responses aligned with actual recipient outcomes.
- Preserve tenant/event authorization and avoid exposing internal outbox job
  identifiers.
- Provide desktop/mobile browser coverage for the reminder dialog.

Out of scope:

- Speaker bulk-email body rendering. This lane intentionally does not alter it.
- Merging, deploying, or claiming deployed/provider verification.
- Accelevents or other unsupported event-platform integrations.

## Exact SHA state at pause capture

- Pre-checkpoint branch `HEAD`:
  `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Last main revision incorporated into the dirty lane patch:
  `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Current merge base with live `github/main`:
  `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Live `github/main` observed during checkpoint preparation:
  `6467ff1f48c73229c5c45dba6b4716df724a3bdd`
- Therefore the paused lane has **not** incorporated the latest main revision.
  Do not treat `7d660196...` as the final PR base.
- The pushed checkpoint commit is the commit containing this document and is
  linked from the GitHub handoff issue.

## Pull request state

- PR URL: none.
- PR state: no PR has been opened.
- The lane must remain unmerged and undeployed while paused.

## Completed implementation

- Added organizer reminder preview and queue route contracts with required
  idempotency keys and a validated 64-character SHA-256 snapshot fingerprint.
- Added canonical snapshot hashing over normalized recipient email, recipient to
  task mapping, task ID, task version, title, due date, and recipient identity.
- Made keyed preview durably reserve the authoritative snapshot before the
  organizer confirms it.
- Made queue reject an unreserved operation key instead of recomputing mutable
  live state between preview and reservation.
- Made retry preview return the stored immutable snapshot for the persisted
  operation key.
- Added durable reminder records containing per-recipient snapshots and
  `pending`, `queued`, or `failed` receipt state.
- Made reminder repository persistence methods mandatory; removed process-memory
  fallback authority from the service.
- Added D1 insert-only reservation and compare-and-swap receipt merging with
  monotonic queued state.
- Kept internal outbox job IDs private; public queue/history `receiptId` values
  are `null`.
- Added deterministic per-recipient delivery keys and stored internal outbox
  identifiers only in durable reminder records.
- Corrected production outbox retry accounting:
  - a previously inserted `pending` row that is successfully sent to the queue
    is reported as newly queued rather than duplicate;
  - `queued`, `processing`, or `delivered` rows are reported as duplicates;
  - terminal failed/dead-letter or otherwise non-queued rows remain failed;
  - service accounting prioritizes a real `queued: true` event over duplicate
    metadata.
- Added a production-adapter regression for queue-send failure, pending-row
  recovery, exact replay, and terminal failure preservation.
- Added web API support for keyed preview and fingerprint-bound queueing.
- Persisted the operation key in `sessionStorage` across dialog close/reopen and
  clear it only after a fully successful result.
- Rendered the authoritative API snapshot in the confirmation dialog, including
  recipients, assignment titles, and due dates.
- Added focused API, repository, web, and browser regressions, including:
  - two recipients with multiple assignments;
  - partial failure and retry of failed recipients only;
  - immutable stored retry snapshot after live title/email changes;
  - same-key different-snapshot conflict;
  - queue rejection without preview reservation;
  - D1 reservation/CAS behavior;
  - durable history and exact replay;
  - changed fingerprint and changed selection returning `409`;
  - missing idempotency key returning `400`;
  - desktop/mobile containment and explicit confirmation.

## Known review findings and unresolved risks

### Addressed findings

- **Optional persistence / process-memory authority:** fixed by making reminder
  repository methods mandatory.
- **Pending recovery recomputed current outstanding work:** fixed by reading the
  existing reservation first and using its stored snapshots.
- **Internal outbox job ID exposure:** fixed by returning `receiptId: null`
  publicly.
- **Browser confirmation could differ from the durable retry snapshot:** fixed
  with canonical fingerprints and stored-key preview.
- **Preview-to-reservation TOCTOU:** fixed by reserving during keyed preview and
  requiring an existing reservation at queue time.
- **Recovered pending outbox send counted as duplicate; terminal failure could
  be promoted to queued:** fixed in the production delivery adapter and service
  receipt ordering, with a regression test.

### Unresolved or not yet re-verified

- The production outbox accounting fix was made after the last complete
  five-reviewer wave. It has focused tests and typechecks, but it has not yet
  received a fresh goal/code/security/QA/context review.
- `github/main` advanced to `6467ff1...` after the lane last incorporated main.
  Conflicts and behavioral changes from that revision are unassessed.
- The full unit/integration suite, production build, and isolated Playwright run
  have not been rerun after the final production outbox accounting fix.
- No deployed staging, Cloudflare D1/Queue, or provider workflow was exercised.
  Local and fake-D1 evidence must not be represented as release evidence.
- A final PR description and exact post-integration base SHA have not been
  produced because no PR exists.

## Verification evidence

The statuses below refer to the current paused source patch unless explicitly
marked as older evidence.

### Current checkpoint gates

- **PASS** — `git diff --check`
- **PASS** — `bun run --filter @eventloom/api typecheck`
- **PASS** — `bun run --filter @eventloom/web typecheck`
- **PASS** —
  `bunx vitest run apps/api/src/features/speaker/speaker.test.ts apps/api/src/features/speaker/private-asset-lifecycle.test.ts apps/api/src/infrastructure/cloudflare/repositories/speaker.test.ts apps/api/src/runtime/communication-delivery-airtable.test.ts apps/web/src/features/deliverables/deliverables-workspace.test.tsx --maxWorkers=1`
  - 5 files passed.
  - 171 tests passed.
- **PASS** —
  `bunx vitest run apps/api/src/features/speaker/speaker.test.ts apps/api/src/runtime/communication-delivery-airtable.test.ts -t "retries only failed content reminder recipients|reports a recovered pending reminder send" --maxWorkers=1`
- **PASS** — `make check` after the final outbox accounting edit.
- **No unrelated/pre-existing failure observed** in the checkpoint gates.

### Required but unrun after the final edit

- **UNRUN** — `make test`
- **UNRUN** — `make build`
- **UNRUN** —
  `env -u PLAYWRIGHT_WEB_PORT -u PLAYWRIGHT_API_PORT -u PLAYWRIGHT_API_INSPECTOR_PORT bun run test:e2e -- tests/e2e/content-collection-reminders.spec.ts`
- **UNRUN** — fresh five-reviewer handoff on the final tree.

### Older, stale evidence that must not replace reruns

- Before the final outbox accounting fix, `make test`, `make build`, and the
  isolated Playwright reminder spec passed.
- The post-TOCTOU reviewer wave returned security PASS, hands-on QA PASS, and
  delivery-context PASS. The goal reviewer then found the production outbox
  accounting defect described above, and the code reviewer was canceled after
  the tree changed.
- Those results are useful history but are not final approval of the paused
  checkpoint.

## Dependencies and merge order

1. Resume only after an explicit user instruction.
2. Fetch live GitHub main and confirm whether `6467ff1...` is still current.
3. Incorporate the latest `github/main` into `judge-content-reminders`.
4. Resolve only conflicts owned by this lane; preserve unrelated merged work.
5. Re-run the current checkpoint gates.
6. Run the full required gates: `make check`, focused reminder tests,
   `make test`, `make build`, and isolated Playwright on safe dynamic ports.
7. Run a fresh five-reviewer handoff; every substantive reviewer must return
   PASS on the final integrated tree.
8. Confirm live main has not advanced again and record the exact final PR base
   SHA.
9. Open a PR against `main` with the finding, root cause, before/after behavior,
   commands, reviewer evidence, limitations, and conflict-resolution notes.
10. Update this handoff document and the handoff issue with the PR URL.
11. Do not merge or deploy from this lane unless separately instructed.

## Dirty, generated, and untracked-file disposition

- Generated Next.js, isolated-browser, Playwright result, and Vite temporary
  directories were removed during checkpoint preparation.
- `.debug-journal.md` was removed and is not part of the checkpoint.
- `tests/e2e/content-collection-reminders.spec.ts` was an intentional untracked
  lane test and must be included in the checkpoint commit.
- This handoff document must be included in the checkpoint commit.
- Ignore-only dependency and environment files are not lane deliverables and
  must not be staged.
- After the checkpoint commit, verify that no lane-owned source/test/docs change
  remains uncommitted.

## Precise resume instructions

```sh
cd /Users/jaeyunha/wt/open-sessionboard/judge-content-reminders
git status --short --branch
git fetch github main
git rev-parse github/main
git log --oneline --decorate HEAD..github/main
git merge --ff-only github/main
```

If the fast-forward is impossible because the checkpoint commit is now ahead,
incorporate latest main without rewriting or discarding the checkpoint, resolve
only lane conflicts, and confirm:

```sh
git diff --check
bun run --filter @eventloom/api typecheck
bun run --filter @eventloom/web typecheck
bunx vitest run \
  apps/api/src/features/speaker/speaker.test.ts \
  apps/api/src/features/speaker/private-asset-lifecycle.test.ts \
  apps/api/src/infrastructure/cloudflare/repositories/speaker.test.ts \
  apps/api/src/runtime/communication-delivery-airtable.test.ts \
  apps/web/src/features/deliverables/deliverables-workspace.test.tsx \
  --maxWorkers=1
make check
make test
make build
env -u PLAYWRIGHT_WEB_PORT \
  -u PLAYWRIGHT_API_PORT \
  -u PLAYWRIGHT_API_INSPECTOR_PORT \
  bun run test:e2e -- tests/e2e/content-collection-reminders.spec.ts
```

Then run a fresh goal, code-quality, security, hands-on QA, and delivery-context
review. Open the PR only after all five pass and after recording the exact live
main SHA used as its base.
