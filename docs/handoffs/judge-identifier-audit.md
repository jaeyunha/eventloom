# Lane handoff: judge-identifier-audit

## Paused state

This lane is **paused by user request**. Do not merge or deploy PR #32 from this
checkpoint. Resume only when the user explicitly asks to continue the lane.

## Repository and worktree

- Repository remote: `https://github.com/jaeyunha/open-sessionboard.git`
- GitHub PR repository: `https://github.com/jaeyunha/eventloom`
- Branch: `judge-identifier-audit`
- Worktree: `/Users/jaeyunha/wt/open-sessionboard/judge-identifier-audit`
- Integrated base: `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`
- Pre-checkpoint local HEAD: `79a747ae06fc33b8be6cfa07911f1cd39a650427`
- Current fetched `github/main`: `6467ff1f48c73229c5c45dba6b4716df724a3bdd`
- Current merge base with fetched `github/main`:
  `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`

The pushed checkpoint commit is the commit containing this document. Resolve its
exact SHA with:

```sh
git rev-parse HEAD
```

## Pull request

- PR: https://github.com/jaeyunha/eventloom/pull/32
- State before checkpoint push: open, not draft, merge state `CLEAN`
- Base branch: `main`
- Remote head before checkpoint push:
  `9ca522052fd834a433bacdc12d8f58deb54346fa`
- Required state: leave open and unmerged; do not deploy

## Lane objective and scope

Remove raw submission, assignment, plan, session, version, and actor identifiers
from ordinary organizer and reviewer UI while preserving canonical identifiers
for routing, concurrency, durable audit correlation, and authorized advanced
audit details. Normalize missing or opaque titles to exact `No title`, propagate
validated non-email user names through authentication, sanitize legacy/sync audit
labels, provide unique accessible restore names, and finish assignment UX safety
and responsive behavior.

## Completed implementation in the checkpoint

- Organizer, reviewer, portal, assignment, decision, evaluator, and session
  surfaces use human-facing titles and labels rather than raw identifiers.
- Missing, blank, and canonical-ID-equivalent titles normalize to exact
  `No title`.
- Assignment and decision UI uses **Proposal** terminology consistently.
- Assignment lineage IDs and plan IDs were removed from ordinary messages and
  CSV filenames; the export filename is `evaluation-results.csv`.
- Reviewer and participant labels are trimmed and use distinguishable
  nontechnical ordinal fallbacks.
- Reviewer-pool state is scoped by organization, event, and round, with stale
  async load/save results rejected.
- Explicit zero reviewer selection is distinct from automatic distribution;
  clearing a selection cannot silently assign the whole round pool.
- The assignment layout has a real CSS grid, compact desktop alignment, mobile
  single-column behavior, and computed overflow coverage.
- Auth payload, magic-link, RequestAuthenticator, local runtime, and D1 session
  paths propagate validated non-email `user.name` values.
- Session audit storage retains canonical `actorId`; ordinary history uses a
  validated human label or `Authorized organizer`.
- Legacy history, accepted-session sync, and nested audit snapshots sanitize
  `actorLabel === actorId` and email-like labels at read time.
- Canonical actor references and stored revisions appear only in authorized
  **Advanced audit details**.
- Restore controls have entry-specific accessible names that include action,
  timestamp, and stable history position.
- English-only fixtures replaced the earlier multilingual browser fixture.
- Regression coverage was added across auth, D1, magic link, sessions, legacy
  audit labels, sync history, No-title behavior, assignment/decision surfaces,
  reviewer-pool scope, zero selection, and responsive browser layout.

## Remaining tasks on resume

- [ ] Fetch `github/main` again and record the then-current SHA.
- [ ] Incorporate current main (`6467ff1f48c73229c5c45dba6b4716df724a3bdd`
      or newer) into `judge-identifier-audit`.
- [ ] Resolve only lane-owned conflicts and preserve unrelated work/stashes.
- [ ] Re-review the complete diff against every PR #32 blocking comment.
- [ ] Decide whether mutable/colliding Better Auth display names are acceptable
      ordinary attribution labels or whether all unapproved names must render as
      `Authorized organizer`; canonical `actorId` is already retained.
- [ ] Add or confirm a regression for switching reviewer-pool event/round while
      an earlier save is still pending.
- [ ] Re-run the complete focused identifier/auth/assignment regression command.
- [ ] Re-run `make check` on the post-main-integration candidate.
- [ ] Re-run `make test` on the post-main-integration candidate.
- [ ] Re-run `bun run build` on the post-main-integration candidate.
- [ ] Re-run isolated Playwright on dynamically allocated safe ports; never use
      judge-reserved ports `3115` or `8887`.
- [ ] Reinspect all refreshed desktop/mobile screenshots and repeat visual QA.
- [ ] Update the PR body with the final base SHA, head SHA, commands, results,
      screenshot paths, and remaining limitations.
- [ ] Request PR re-review.
- [ ] Leave PR #32 open and unmerged unless a later explicit instruction changes
      that constraint.

## Known review findings and unresolved risks

- The latest fetched main is newer than the integrated base. Final verification
  must occur after incorporating the newer main revision.
- Security review disagreed on whether a mutable Better Auth `user.name` counts
  as an approved human audit label. The implementation preserves canonical
  actor correlation in advanced details and uses no email fallback, but the
  product policy decision remains worth explicit re-review.
- Real-browser `No title` evidence is captured on the organizer submission list.
  Assignment and decision missing-title paths are covered by component tests
  because a newly submitted proposal does not enter an already-materialized
  review plan.
- Reviewer email addresses remain visible in the authorized reviewer assignment
  directory as human contact labels. Raw reviewer IDs are not rendered.
- Advanced audit details intentionally expose canonical actor references and
  stored revisions to authorized organizers; ordinary UI does not.
- A full build passed before the last CSS alignment and formatting-only edits.
  Re-run the build after main integration before treating the PR as final.

## Verification evidence

| Command or review | Status at pause |
| --- | --- |
| Focused auth/session/title/assignment Vitest suite | **PASS**: 15 files, 165 tests |
| `node scripts/run-isolated-playwright.mjs tests/e2e/identifier-audit-ui.spec.ts` | **PASS**: 3 tests on dynamically allocated non-reserved ports |
| Desktop/mobile visual design review | **PASS** |
| Identifier/privacy screenshot review | **PASS** |
| `make check` | Earlier candidate passed; a later run found 12 formatting differences, all manually corrected. Checkpoint minimum check is recorded below after it runs. |
| `make test` | **PASS** on the latest full behavioral candidate before formatting-only cleanup; rerun after new-main integration |
| `bun run build` | **PASS** before the final CSS alignment/format-only cleanup; rerun after new-main integration |
| `git diff --check && git diff --cached --check` | **PASS** |
| `bun run --filter @eventloom/api typecheck && bun run --filter @eventloom/web typecheck` | **PASS** |
| Focused checkpoint Vitest command covering auth, session audit, titles, assignments, and session UI | **PASS**: 20 suites, 124 tests |

Private screenshot evidence is intentionally outside the repository:

- `/Users/jaeyunha/dev/open-sessionboard/evidence/private/judge-fix-screenshots/identifier-audit-ui/identifier-audit-ui-no-title-desktop.png`
- `/Users/jaeyunha/dev/open-sessionboard/evidence/private/judge-fix-screenshots/identifier-audit-ui/identifier-audit-ui-reviews-assignments-desktop.png`
- `/Users/jaeyunha/dev/open-sessionboard/evidence/private/judge-fix-screenshots/identifier-audit-ui/identifier-audit-ui-reviews-assignments-mobile.png`
- `/Users/jaeyunha/dev/open-sessionboard/evidence/private/judge-fix-screenshots/identifier-audit-ui/identifier-audit-ui-sync-history.png`

## Dependencies and merge order

1. Keep PR #32 open and unmerged while paused.
2. On resume, fetch GitHub main first.
3. Merge current main into this lane before any final verification.
4. Resolve only identifier/audit and assignment-UX conflicts owned by this lane.
5. Run focused tests, full checks/tests/build, and isolated browser/visual QA.
6. Update PR evidence and request re-review.
7. Do not merge or deploy without a later explicit instruction.

## Dirty, generated, untracked, and stash disposition

- All lane-owned source, test, and this handoff document must be staged into the
  checkpoint commit.
- Generated `test-results`, Next build directories, Playwright isolated build
  directories, Wrangler state, coverage, and debug-journal artifacts were
  removed before checkpointing.
- Private screenshot evidence remains outside the repository and must not be
  committed.
- New source/test files in this lane are intentional and must be committed.
- Preserve all stashes. In particular:
  - `preserve-unrelated-post-main-pop-identifier-audit`
  - `identifier-audit-pr32-pre-main-7d66019`
  - all autostashes and other lanes' named stashes
- Do not drop, apply, or rewrite unrelated stashes during resume unless their
  owner explicitly requests it.

## Precise resume instructions

```sh
cd /Users/jaeyunha/wt/open-sessionboard/judge-identifier-audit
git status --short --branch
git fetch github main
git rev-parse HEAD github/main
git log --oneline HEAD..github/main
git merge --no-edit github/main
```

Resolve only lane-owned conflicts, then run:

```sh
bunx vitest run \
  apps/api/src/features/auth/auth.test.ts \
  apps/api/src/features/auth/runtime.test.ts \
  apps/api/src/runtime/composition.test.ts \
  apps/api/src/features/sessions/routes.test.ts \
  apps/web/src/features/sessions/api.test.ts \
  apps/web/src/features/sessions/session-workspace.component.test.tsx \
  apps/web/src/features/admin/submission-workspace.test.tsx \
  apps/web/src/features/portal/portal-submissions.test.tsx \
  apps/web/src/features/reviews/review-workspace.test.tsx \
  apps/web/src/features/reviews/review-workspace.evaluator.test.tsx \
  apps/web/src/features/reviews/workspace/assignment-ux-audit.test.ts \
  apps/web/src/features/reviews/workspace/identifier-audit-ui.test.tsx \
  apps/web/src/features/reviews/workspace/model-normalize-api-submission.test.ts \
  apps/web/src/features/reviews/workspace/model-submission-select-option.test.ts \
  apps/web/src/features/reviews/organizer-reviewer-pool-panel.test.tsx
make check
make test
bun run build
IDENTIFIER_AUDIT_SCREENSHOT_DIR=/Users/jaeyunha/dev/open-sessionboard/evidence/private/judge-fix-screenshots/identifier-audit-ui \
  node scripts/run-isolated-playwright.mjs tests/e2e/identifier-audit-ui.spec.ts
git diff --check
git status --short --branch
```

Then update PR #32 with the exact base/head and verification evidence. Do not
merge or deploy unless explicitly instructed.
