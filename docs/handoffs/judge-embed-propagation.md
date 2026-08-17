# Judge Embed Propagation Lane Handoff

> **Lane status: PAUSED BY USER REQUEST.**
>
> Do not start new feature work, run long-lived validation, merge, or deploy from
> this lane until the user explicitly resumes it.

## Repository and branch

| Item | Current value |
| --- | --- |
| Product/repository | Eventloom, local repository name `open-sessionboard` |
| Canonical GitHub repository | `https://github.com/jaeyunha/eventloom` |
| Configured `github` remote | `https://github.com/jaeyunha/open-sessionboard.git` (GitHub redirects this moved repository to `jaeyunha/eventloom`) |
| Branch | `judge-embed-propagation` |
| Worktree | `/Users/jaeyunha/wt/open-sessionboard/judge-embed-propagation` |
| Lane head | `682364323a66e79585cfb040181c3353acf4bbfa` |
| Original integrated GitHub main base | `7d6601961367e3eefb87ddbc1cd3236332cc7ee3` |
| Current fetched GitHub main | `6467ff1f48c73229c5c45dba6b4716df724a3bdd` |
| Current merge-base of lane head and GitHub main | `682364323a66e79585cfb040181c3353acf4bbfa` |

`6467ff1f48c73229c5c45dba6b4716df724a3bdd` is the merge commit for this
lane. Its parents, in order, are:

1. `7d6601961367e3eefb87ddbc1cd3236332cc7ee3` - the final GitHub main
   revision incorporated before the lane's final verification and push.
2. `682364323a66e79585cfb040181c3353acf4bbfa` - the lane commit.

The lane head is therefore already an ancestor of current GitHub main.

## Pull request

| Item | Value |
| --- | --- |
| PR | [#42 - fix(agenda): make public propagation atomic](https://github.com/jaeyunha/eventloom/pull/42) |
| State | `MERGED` |
| Head | `judge-embed-propagation` at `682364323a66e79585cfb040181c3353acf4bbfa` |
| Base | `main` |
| Merge commit | `6467ff1f48c73229c5c45dba6b4716df724a3bdd` |
| Merged at | `2026-08-17T05:20:29Z` |
| Recorded merger | GitHub user `jaeyunha` |
| Current GitHub checks | PASS: 1 successful, 0 failing, 0 pending, 0 skipped |

The lane agent did not initiate the merge. During the later shutdown directive,
the PR was discovered to have already been merged externally.

## Lane objective and scope

The lane objective was to make approved program changes propagate safely and
immediately to the existing public agenda, embed, JSON, iCalendar, and speaker
surfaces without requiring embed regeneration.

The in-scope work included:

- publication race fencing across local and Cloudflare execution paths;
- approval-gated propagation of session titles, rooms, formats, tracks,
  speakers, speaker display names, and public speaker assets;
- stable track-ID transport and filtering in public embeds;
- recovery from abandoned or expired publication reservations;
- safe ordering of public projection, cache invalidation, served-state, and
  calendar work;
- D1 persistence and compare-and-swap fencing for publication reservations;
- regression coverage for the domain, repositories, Durable Object
  coordinator, local runtime, web embed component, and real browser workflow.

The lane did not include:

- deployment to staging or production;
- release approval;
- social OAuth, Accelevents, or other product work outside the Eventloom
  program/publication scope;
- a claim of deployed-provider verification.

## Completed implementation

### Approved content and public projection propagation

- Approved session title, room, format, track, speaker, JSON, iCalendar, and
  public-speaker changes rebuild the served public projection.
- Speaker roster and display-name changes require approval before public
  propagation.
- Newly assigned speakers receive only approval-gated name data; private
  biography, profile, and headshot fields are not exposed merely because of an
  assignment.
- Existing served speaker biographies and headshots are preserved while
  speaker-session associations are rebuilt.
- Format and track taxonomy renames propagate through approved content.
- Local speaker track associations refresh after taxonomy changes.
- Public agenda transport includes stable `trackIds`.
- Embed filtering uses stable track IDs instead of mutable display labels.

### Publication concurrency, fencing, and recovery

- Approved refresh, manual publish, rollback, and local lazy manifest
  materialization use the shared agenda mutation lock.
- `AgendaEngine` renews/fences its lease immediately before compare-and-swap and
  again before post-commit work.
- The Cloudflare Durable Object lease is persisted and supports release,
  expiration, replay, renewal, and heartbeat behavior.
- Long-running publication callbacks have deterministic lease-renewal
  regression coverage.
- Pending publication reservations persist owner and expiration data.
- Active foreign-owner reservations are rejected.
- Same-owner retries can resume or supersede their pending reservation.
- Expired identical reservations can transfer to a recovering owner.
- Terminal completion and failure validate reservation ownership.
- Completion rejects an expired reservation.
- Cancellation or a crashed callback leaves a recoverable pending reservation.

### Publication side-effect ordering

- Projection and cache preparation occur before the served-state transition.
- Cache invalidation intent is durable before a revision becomes served.
- Cache dispatch runs after serving and retains durable retry state.
- Calendar reconciliation runs only after publication serves.
- A same-revision retry can finish post-serve cache or calendar work.
- Explicit D1 lease renewals fence the publication phases around durable work.

### D1 persistence and compare-and-swap safety

- Added migration
  `apps/api/migrations/0034_program_publication_reservations.sql`.
- The migration enables `PRAGMA foreign_keys = ON`.
- Added `reservation_owner_id` and `reservation_expires_at` to the Drizzle
  publication schema and repository reads/writes.
- D1 reservation insert, update, clear, and ownership reassignment are covered.
- Each D1 `compareAndSwap` attempt creates a unique UUID-bearing root token.
- Every child insert/update predicate requires that exact root token, preventing
  a losing compare-and-swap attempt from mutating the winning release.

### Regression coverage

Coverage was added or expanded in:

- `apps/api/src/features/agenda/catalog-sync.test.ts`
- `apps/api/src/features/agenda/engine.test.ts`
- `apps/api/src/features/events/routes.test.ts`
- `apps/api/src/infrastructure/cloudflare/agenda-coordinator.test.ts`
- `apps/api/src/infrastructure/cloudflare/cloudflare.test.ts`
- `apps/api/src/infrastructure/cloudflare/repositories/publication.test.ts`
- `apps/api/src/infrastructure/cloudflare/repositories/published-speakers.test.ts`
- `apps/api/src/routes/agenda.test.ts`
- `apps/api/src/runtime/local-event-graph.test.ts`
- `apps/web/src/features/embed/embed.component.test.tsx`
- `tests/e2e/embed-propagation.spec.ts`

## Remaining tasks

There are no known unfinished implementation tasks on the merged lane commit.
The remaining items are pause, evidence, and follow-up controls:

- [ ] Keep the lane paused until the user explicitly requests a resume.
- [ ] Decide whether and where to commit this handoff document. It is
  intentionally left as the only new untracked file by this handoff request.
- [ ] If a follow-up defect is reported, reproduce it from the latest
  `github/main` in a new branch/worktree rather than adding feature work to the
  already merged `judge-embed-propagation` branch.
- [ ] Before any release claim, apply/verify D1 migration `0034` in the target
  environment and execute the applicable deployed workflow from
  `docs/qa-runbook.md` and `docs/release-runbook.md`.
- [ ] Obtain staging/provider evidence for real Cloudflare Durable Object, D1,
  Queue, cache invalidation, calendar, and public-browser behavior if a release
  lane requires it.
- [ ] If any source change is made after resume, repeat focused tests,
  `make check`, `make test`, `bun run build`, and isolated safe-port browser QA
  before committing.
- [ ] Do not merge or deploy any follow-up without the instruction and release
  evidence applicable at that time.

## Review findings

### Resolved findings

The final review lanes all passed after the following findings were addressed:

- speaker roster/display-name changes needed explicit approval gating;
- format and track taxonomy changes needed public propagation;
- publication callbacks could outlive an initial lease without renewal;
- stale or crashed publishers needed owner/expiry-bearing recoverable
  reservations;
- terminal reservation operations needed owner and expiry checks;
- local manual publish, rollback, refresh, and lazy materialization needed the
  same mutation lock;
- cache and calendar work needed ordering around the served transition;
- D1 child writes needed a unique per-CAS token rather than a reusable
  timestamp-only fence;
- speaker reassignment needed to update public associations without leaking
  private profile/headshot data.

The final five review lanes reported PASS for:

1. objective and concurrency correctness;
2. code quality;
3. security;
4. hands-on browser QA;
5. repository context and speaker-assignment behavior.

### Unresolved risks and evidence limits

- No staging or production deployment was performed by this lane.
- No staging/provider run verified the implementation against real Cloudflare
  Durable Objects, D1, Queue delivery, cache infrastructure, or calendar/email
  providers.
- Cross-isolate and crash behavior is covered by deterministic tests and local
  execution, not by a production load or fault-injection run.
- Local and source evidence must not be represented as deployed release
  evidence.
- PR #42 is already merged even though a later user shutdown directive said not
  to merge. The merge was external to the lane agent and is recorded above.
- The configured `github` remote still uses the repository's former URL. GitHub
  currently redirects it, but a future maintainer may choose to update the
  remote explicitly.

## Verification evidence

Statuses below describe the final lane commit. Commands were not rerun merely
to produce this handoff because the user paused the lane and requested that
running work be stopped.

| Command or check | Exact status | Evidence |
| --- | --- | --- |
| Focused Bun test batches covering agenda catalog sync, engine, event routes, coordinator, publication repository, published speakers, agenda routes, local event graph, and embed component | PASS | 128/128 propagation tests at the integrated-base checkpoint; later targeted batches also passed after final fencing changes, and the final full `make test` passed afterward |
| Final publication protocol focused batch | PASS | 105/105 |
| Final owner-fence/publication focused batch | PASS | 100/100 |
| Final recovery/local-lock focused batch | PASS | 91/91 |
| Final D1/service reassignment focused batch | PASS | 21/21 |
| `make check` | PASS | All package typechecks passed; Biome lint and format checks passed over 1,256 files |
| `make test` | PASS | 248 unit files; 2,113 passed and 3 skipped; 123 script tests passed; 22 API tests passed; 10 runtime tests passed |
| `bun run build` | PASS | Contracts, CLI, API Wrangler dry-run, and optimized Next.js web build exited 0 |
| `node --test scripts/cloudflare/validate-config.test.mjs` | PASS | 7/7, including migration `0034` validation |
| Full Wrangler migration-chain test | PASS | 3/3 |
| `bun scripts/run-isolated-playwright.mjs tests/e2e/embed-propagation.spec.ts` | PASS | 1/1 Chromium test passed on isolated ports `51290`, `51291`, and `51292`; the listeners were released afterward |
| `git diff --check` before commit | PASS | No whitespace errors |
| LSP diagnostics for changed API source and embed source | PASS | 0 errors |
| `gh pr checks 42 --repo jaeyunha/eventloom` | PASS | 1 successful, 0 failing, 0 pending, 0 skipped |
| `make clean` after final build/browser evidence | PASS | Build, test, coverage, Playwright, and TypeScript build artifacts were removed |
| `make all` as one combined command | UNRUN | Equivalent relevant source gates were run separately; the repository-wide Playwright suite was not required for this focused lane |
| `make test-e2e` for the entire repository suite | UNRUN | The lane used the isolated focused Chromium command above |
| Deployed staging browser/provider QA | UNRUN | Outside this local/source lane evidence |
| Production deployment | UNRUN / PROHIBITED | The lane was instructed not to deploy |

No verification command has a known unresolved failure on
`682364323a66e79585cfb040181c3353acf4bbfa`.

## Dependencies and merge order

Historical integration order:

1. GitHub main containing PR #29:
   `2353bf4b99d8eedbfe6240e42669a039ec798bcb`.
2. GitHub main containing PR #30:
   `e1d91309fbbd4ae22516dd6cdf060feec373d6ee`.
3. GitHub main after PRs #35 and #36:
   `7d6601961367e3eefb87ddbc1cd3236332cc7ee3`.
4. Lane commit:
   `682364323a66e79585cfb040181c3353acf4bbfa`.
5. PR #42 merge commit/current fetched GitHub main:
   `6467ff1f48c73229c5c45dba6b4716df724a3bdd`.

There is no pending source merge for this lane. Do not attempt to merge the old
branch again.

For deployment sequencing, migration `0034` must be applied in the target D1
environment before or atomically with Worker code that expects
`reservation_owner_id` and `reservation_expires_at`. Follow the repository
deployment and release runbooks; do not infer release readiness from local
configuration or source tests.

Any follow-up source branch must start from current `github/main` (currently
`6467ff1f48c73229c5c45dba6b4716df724a3bdd`, or a newer fetched revision), not
from the original integrated base.

## Dirty, generated, and untracked-file disposition

Before this handoff request, the branch and index were clean at
`682364323a66e79585cfb040181c3353acf4bbfa`.

After this handoff is created:

- `docs/handoffs/judge-embed-propagation.md` is the only intentional new
  untracked source file.
- It is not staged or committed because the user requested document creation,
  not a commit or a new PR.
- No lane implementation file is dirty.
- No lane-owned test, build, browser, reviewer, child task, or terminal session
  is running.
- Final generated artifacts were cleaned. In particular, there should be no
  lane-owned `.next*`, `dist`, `coverage`, `playwright-report`, or
  `test-results` output left by the completed verification.
- Ignored local inputs/dependencies remain in place and must not be committed:
  `.env`, `.omo/`, `apps/web/.env.local`, `apps/web/next-env.d.ts`, and
  repository/package `node_modules/` directories.
- No lane edit was discarded or reverted during the user-requested shutdown.

## Precise resume instructions

1. Obtain an explicit user instruction to resume. Until then, do nothing beyond
   reading this handoff.
2. Enter the existing worktree only to inspect its historical state:

   ```bash
   cd /Users/jaeyunha/wt/open-sessionboard/judge-embed-propagation
   git status --short --branch
   git rev-parse HEAD
   gh pr view 42 --repo jaeyunha/eventloom
   ```

3. Confirm the historical head remains
   `682364323a66e79585cfb040181c3353acf4bbfa` and note that PR #42 is already
   merged.
4. Fetch the latest GitHub main before any follow-up:

   ```bash
   git fetch github main
   git rev-parse github/main
   ```

5. For source follow-up, create a new branch/worktree from the fetched
   `github/main`. Do not add feature commits to the already merged lane branch.
6. Read the current `AGENTS.md`, `spec/eventloom.md`, affected source, migration
   `0034`, PR #42, and this handoff before editing.
7. Reproduce any reported defect first and add a regression at the affected
   seam before changing behavior.
8. After a source change, run focused tests first, then:

   ```bash
   make check
   make test
   bun run build
   bun scripts/run-isolated-playwright.mjs tests/e2e/embed-propagation.spec.ts
   ```

9. Use isolated safe ports for browser QA, verify listeners are released, then
   remove generated artifacts without deleting source evidence.
10. Review the final diff against the new branch base. Commit and push only if
    explicitly in scope. Open a separate follow-up PR; never reuse or re-merge
    PR #42.
11. Do not deploy, claim release evidence, or merge a follow-up without the
    applicable user instruction and deployed verification.
