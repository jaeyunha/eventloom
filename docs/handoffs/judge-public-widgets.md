# Judge public widgets lane record

## Status

The lane resumed after its checkpoint and is proceeding to an unmerged pull request. Current branch,
commit, review, and PR links are maintained in
[GitHub issue #48](https://github.com/jaeyunha/eventloom/issues/48).

## Repository state

- Repository: `jaeyunha/eventloom`
- Branch: `judge-public-widgets`
- Integrated base before final delivery: `5de02118b194c429bee50bf3eac9acd5ffeecf1e`
- Checkpoint commit:
  `06299a29a52e8706e5951bf35d06bbe1c26963f9`
- The base includes PR #42 feature head:
  `682364323a66e79585cfb040181c3353acf4bbfa`

## Rubric scope

- `EMB-S1`: prove public session search by title and speaker, zero results, clearing, and
  desktop/mobile rendering.
- `EMB-S2`: prove the published session, speakers-list, agenda, itinerary, and speaker-gallery
  widget surfaces remain usable and responsive.
- `SPK-S3`: publish an explicitly released speaker headshot across the anonymous speaker list,
  gallery, detail dialog, and byte route without leaking an approved-but-unreleased image.

The branch also retains the event-retirement public-integrity follow-up required after PR #35:
retired anonymous CFP denial, rollback-safe status/tombstone synchronization, retirement-aware public
agenda caching, and removal of stale `Draft event` copy.

## Root causes and implemented fixes

- Public speaker materialization previously depended on a profile-selected asset and could omit a
  task-uploaded released headshot. A shared selector now resolves only ready, approved, released,
  image-safe assets, with fail-closed explicit selection and a single-family task-upload fallback.
- D1 projection persistence revalidates the exact released asset metadata before binding a stable
  public URL. Local fixture publication uses the same upload, finalize, approve, release, immutable
  projection, and byte-serving lifecycle.
- Session search behavior was already present but lacked direct browser regression coverage for the
  complete rubric path.
- Anonymous agenda cache reads checked retirement but were keyed only by pathname. Memory and Cache
  API entries now carry agenda, program, and cache revisions and are rejected when the served
  manifest advances.
- PR #42 reserved a release before inserting the immutable projection rows referenced by immediate
  foreign keys. Canonical D1 publication now stages those publicly unreachable projections before
  reservation while keeping manifest advancement last. Speaker projection IDs combine the agenda
  revision ID and speaker source hash, and migration
  `0037_immutable_speaker_projection_snapshots.sql` permits multiple immutable snapshots for an
  expired or failed reservation retry without mutating an older orphan.
- PR #61 contributes `0036_evaluation_export_jobs.sql`; the immutable speaker snapshot migration
  is numbered `0037` to keep migration ordinals unique.
- Migration `0035_event_retirement_compatibility.sql` reconciles deployment-window drift and keeps
  rollback-only `events.status` synchronized with `legacy_retired_at`.

## Verification contract

Before final delivery, the unchanged candidate must have:

- migration validation with recursive triggers;
- focused retirement, publication, headshot, public-route, and embed tests;
- `make check`;
- `make test`;
- API and web deployable builds;
- isolated Playwright for session search, public headshots, and organizer `Event record` copy;
- fresh desktop/mobile screenshot inspection;
- independent goal, code-quality, security, hands-on QA, context, and visual reviews.

Generated `.next*`, `.wrangler`, `test-results`, screenshots, traces, and build output are local
evidence only and must not be committed.

## Final local verification

- `make check` — passed after the final agenda-cache and migration repairs.
- `make test` — passed; the final runtime phase completed 10 of 10 tests.
- Focused retirement/public-widget Vitest gate — 5 files and 93 tests passed.
- Migration validation and lifecycle tests — 9 tests passed, including duplicate-ordinal rejection
  and recursive-trigger retirement checks.
- `bun run --filter @eventloom/api build` — passed as a Wrangler dry run.
- `bun run --filter @eventloom/web build` — passed.
- Final Chromium run on dedicated ports `62540`-`62542` — 5 tests passed:
  session search, mobile agenda/itinerary, light/dark refresh tokens, public headshots, and
  organizer `Event record` copy.
- Fresh goal, code-quality, security, hands-on QA, and context reviews passed; visual-system and
  visual-fidelity reviews also passed with the token and mobile-layout repairs.

## Constraints

- Merge the PR only after the final committed candidate is green; do not deploy production.
- Fetch GitHub main again immediately before the final commit and record the exact base/head.
- Preserve PR #42 reservation, completion, failure rollback, and cache invalidation semantics.
- Keep the retained rebase autostash until its contents are explicitly audited; it is not part of
  the source deliverable.
