# Lane handoff: judge-public-widgets

## Paused state

This lane is **paused by user request**. Do not merge, deploy, discard the worktree, delete the
branch, drop the autostash, or continue feature work until the lane is explicitly resumed.

## Repository and worktree

- Repository: `jaeyunha/open-sessionboard`
- GitHub remote: `https://github.com/jaeyunha/open-sessionboard.git`
- Branch: `judge-public-widgets`
- Worktree: `/Users/jaeyunha/wt/open-sessionboard/judge-public-widgets`
- Integration base: `6467ff1f48c73229c5c45dba6b4716df724a3bdd`
- Working-tree HEAD before the checkpoint commit: `6467ff1f48c73229c5c45dba6b4716df724a3bdd`
- PR #42 feature head already incorporated by the base:
  `682364323a66e79585cfb040181c3353acf4bbfa`
- PR for this lane: none at pause time

The pushed checkpoint commit and branch URL are recorded in the GitHub issue titled
`[Lane handoff] judge-public-widgets`.

## Lane objective and scope

The lane combines two related public-integrity tracks:

1. Public widgets:
   - cover public session title/speaker search, empty state, clear, and responsive rendering;
   - publish only ready, approved, explicitly released speaker headshots;
   - serve the released headshot across speakers list, gallery, detail dialog, and byte route;
   - preserve the immutable published projection and local/production parity.
2. Event-retirement follow-up after merged PR #35:
   - deny anonymous CFP slug and explicit-form resolution for `legacy_retired_at` events while
     preserving organizer canonical-ID access;
   - synchronize rollback-only `events.status` and `events.legacy_retired_at` for older Worker
     archive/reactivate/create transitions;
   - revalidate event retirement before public agenda JSON, ICS, and embed-feed cache return;
   - remove stale organizer-facing `Draft event` lifecycle copy.

The latest base also includes merged PR #42, which changed atomic publication propagation,
publication reservation/completion, agenda invalidation, published-speaker cache handling, and
overlapping runtime files.

## Completed implementation preserved in the checkpoint

- [x] Added released-headshot selection shared by D1/Airtable and local publication.
- [x] Added canonical D1 tests for task-uploaded released headshots and approved-but-unreleased
  privacy.
- [x] Added D1 persistence-time headshot release revalidation.
- [x] Seeded the local public headshot through the real upload capability, finalize, organizer
  approval, and release lifecycle rather than direct repository/object injection.
- [x] Added public session-search and public speaker-headshot Playwright coverage.
- [x] Added exact API `photoUrl` linkage, dialog focus/scroll/Escape/focus-return assertions, and
  responsive navigation affordance coverage.
- [x] Improved speaker-detail contrast and the local browser fixture image quality.
- [x] Added `legacy_retired_at IS NULL` to D1 CFP public slug resolution while leaving organizer
  canonical event reads available.
- [x] Added migration `0034_event_retirement_compatibility.sql` with reconciliation plus guarded
  insert/status/marker synchronization triggers.
- [x] Added archive/reactivate rollback and old-Worker drift migration scenarios.
- [x] Moved served-manifest retirement authority ahead of public agenda memory and Cache API
  returns, with `404`/`Cache-Control: no-store` regressions for `/agenda`, `/agenda.json`, and
  `/agenda.ics`.
- [x] Replaced the stale organizer label `Draft event` with `Event record`.
- [x] Rebased the working tree onto GitHub main
  `6467ff1f48c73229c5c45dba6b4716df724a3bdd`.
- [x] Resolved the `apps/api/src/runtime/local.ts` autostash conflict without dropping PR #42's
  reservation/completion path or the lane's published-headshot bindings.
- [x] Repaired the immediate post-conflict TypeScript break and adapted the local published
  headshot byte response to PR #42's `ArrayBuffer` route contract.
- [x] Removed generated `.next*`, `.wrangler`, and `test-results` artifacts before checkpointing.

## Remaining tasks

### Immediate correctness and integration

- [ ] Re-open the integrated `apps/api/src/runtime/local.ts` diff and verify the merged publication
  flow preserves all PR #42 atomic semantics:
  reservation, pending revision/release IDs, `completeRebuild`, cache invalidation, and rollback.
- [ ] Verify speaker projection and speaker-headshot maps are installed and rolled back together on
  local publication failure.
- [ ] Compare `apps/api/src/runtime/airtable.ts` and local publication behavior after PR #42.
- [ ] Confirm the retained `stash@{0}: autostash` contains no unique lane work before dropping it.
  Do not drop it merely to clean the stash list.

### Blocking review finding

- [ ] Bind agenda memory and Cache API entries to the served manifest, not only to the pathname.
  The independent code review proved that a still-served manifest can advance from agenda revision
  N to N+1 while a pathname-keyed N response remains cache-eligible.
- [ ] Carry and validate at least agenda revision, program publication revision, and cache revision
  on both isolate-memory and Cache API entries.
- [ ] Add failing/passing memory and cross-isolate Cache API regressions for a served-manifest
  revision advance, not only retirement-to-null.
- [ ] Preserve the single manifest lookup by passing the prevalidated manifest through the cache
  miss path.

### Migration validation

- [ ] Re-run the migration test after the latest `6467ff1` integration.
- [ ] Exercise migration `0034` with `PRAGMA recursive_triggers = ON`.
- [ ] Confirm the one-time reconciliation repairs both deployment-window states:
  `status='archived'/legacy_retired_at IS NULL` and
  `status<>'archived'/legacy_retired_at IS NOT NULL`.
- [ ] Confirm migration ordering and discovery include `0034` on an already-migrated database.

### Verification still required

- [ ] Run the focused retirement/public-widget Vitest suite on the integrated tree.
- [ ] Run `make check`.
- [ ] Run `make test` serially with no Playwright process active.
- [ ] Build both `@eventloom/api` and `@eventloom/web`.
- [ ] Run isolated browser QA on unique safe ports for:
  public session search, public speaker headshot, and organizer `Event record` copy.
- [ ] Regenerate and inspect the final screenshots; generated evidence must remain uncommitted.
- [ ] Repeat the full independent implementation/security/context/QA/visual review against the
  integrated diff.
- [ ] Fetch GitHub main again immediately before final delivery, record the exact base SHA, and
  incorporate it if it advanced.
- [ ] Open an unmerged PR only after the final integrated gates and review pass.

## Known review findings and unresolved risks

### Blocking

- Agenda cache entries are currently retirement-aware but not served-revision-aware. A pathname
  cache entry from agenda revision N can be returned after the served manifest advances to N+1.
  This was reported as a high-confidence release blocker by the independent code-quality review.
- The final independent review was cancelled when the user paused the lane and therefore does not
  approve the integrated `6467ff1` checkpoint.

### Integration risks

- PR #42 overlaps agenda, publication service, published-speaker cache, Airtable/local runtime, and
  related tests. The local conflict was made syntactically coherent for checkpointing, but the
  integrated semantics require focused verification before feature work resumes.
- `stash@{0}` is the rebase autostash retained for safety. It may duplicate applied work; compare it
  before any cleanup.
- No deployed/staging evidence exists. All browser evidence was local fixture evidence only.

### Non-blocking/stale reviewer note

- A reviewer reported Biome import ordering in
  `scripts/db/event-status-migration.test.mjs`. Re-run the current repository check after resume;
  do not suppress or bypass it.

## Verification ledger

### Current post-`6467ff1` checkpoint

- `git diff --check` and `git diff --cached --check` — passed before final staging; rerun once more
  before committing.
- `bun run --filter @eventloom/api typecheck` — passed.
- `bunx vitest run apps/api/src/runtime/composition.test.ts -t "seeds a mutable draft and immutable
  public agenda projection" --reporter=dot --silent` — passed, 1 test passed and 49 skipped.
- Full test/build/browser/review gates — **unrun after the final `6467ff1` integration**.

### Historical evidence before the final `6467ff1` integration

This evidence is useful context but is not final evidence for the checkpoint:

- Focused retirement/public-widget Vitest: 14 files, 215 tests passed.
- `node --test scripts/db/event-status-migration.test.mjs`: passed.
- `make check`: passed.
- `make test`: passed, including 244 unit/integration files and 10 local Worker tests.
- API build: passed.
- Web build: passed.
- Isolated Playwright on dedicated ports: three specs passed:
  public sessions search, public speaker headshot, organizer event-record copy.
- Final browser artifacts were removed before checkpointing as requested.

## Dependencies and merge order

- The lane is based on merged PR #42 at
  `6467ff1f48c73229c5c45dba6b4716df724a3bdd`.
- The final implementation must preserve PR #42's atomic publication propagation and cache
  invalidation semantics.
- There is no lane PR to merge.
- Do not merge or deploy this checkpoint.
- On resume, fetch GitHub main first; if main advanced, integrate it before relying on any
  verification evidence.

## Dirty, generated, and untracked disposition

- Lane-owned source and test edits are included in the checkpoint commit.
- `docs/handoffs/judge-public-widgets.md` is included in the checkpoint.
- The three Playwright specs are intentional lane-owned source files, not generated artifacts.
- Generated `.next*`, `.wrangler`, and `test-results` directories were removed.
- No screenshot, trace, build output, or Wrangler runtime state should be staged.
- `stash@{0}: autostash` remains intentionally preserved pending comparison.

## Precise resume instructions

```sh
cd /Users/jaeyunha/wt/open-sessionboard/judge-public-widgets

git status --short --branch
git fetch github main
git rev-parse HEAD
git rev-parse refs/remotes/github/main
git merge-base HEAD refs/remotes/github/main
git stash list --max-count=3

# Read this handoff and the issue before editing.
git show HEAD:docs/handoffs/judge-public-widgets.md

# Inspect the integrated overlap first.
git diff 6467ff1f48c73229c5c45dba6b4716df724a3bdd..HEAD
git diff refs/remotes/github/main...HEAD -- apps/api/src/routes/agenda.ts
git diff refs/remotes/github/main...HEAD -- apps/api/src/runtime/local.ts
git diff refs/remotes/github/main...HEAD -- apps/api/src/runtime/airtable.ts

# Restore test-first work at the manifest-revision cache seam.
bunx vitest run apps/api/src/routes/agenda.test.ts --reporter=dot --silent
node --test scripts/db/event-status-migration.test.mjs
bun run --filter @eventloom/api typecheck

# After the blocker is fixed, run the full required gates.
make check
make test
bun run --filter @eventloom/api build
bun run --filter @eventloom/web build
node scripts/run-isolated-playwright.mjs \
  tests/e2e/public-sessions-search.spec.ts \
  tests/e2e/public-speaker-headshot.spec.ts \
  tests/e2e/organizer-event-record-copy.spec.ts
```

After the full integrated review passes, fetch GitHub main again, record the exact base/head, open an
unmerged PR, and update the handoff issue with the PR URL and final evidence.
