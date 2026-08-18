# Judge Review AI Lane Handoff

## Checkpoint

- Final code checkpoint pushed:
  `c9d320adb04d42261d8f7a3bf96952a4cdd498e7`
  (`fix(evaluations): align shared triage index name`).
- It follows `65a53dee5cede039108fcf022d38859e407ff1a2`
  (`fix(evaluations): close round-two triage review findings`) and
  `fb115a8cb9477a421708139f3187853f979ab5ba`
  (round-two handoff evidence).
- Earlier lane checkpoints: `0167ec28` (round-one fixes + evidence),
  `46365bc3` (first integrated head), `1b27e215` (initial implementation).
- Latest merged `github/main` (`d7fb71bb` ancestry) is integrated.
- PR #34 must remain open, unmerged, and undeployed.

## Delivered behavior

- Organizers opt a review round into AI triage in the existing round editor.
- One cached advisory scorecard per `(plan, round, submission)` is enforced
  atomically: a partial unique index on the shared scope
  (`assignment_id IS NULL`, active statuses) plus conflict detection with
  reload-and-return of the winning row. Concurrent generation persists exactly
  one row (covered by dedicated race tests in memory and D1).
- Only organizers generate, regenerate, list, or override. The organizer
  results view renders candidates, rationale/provenance, inline override
  values, optional reason, and explicit loading/error feedback in both the
  no-suggestion and existing-suggestion states.
- Reviewers have human-only score controls; the reviewer suggestion API,
  toolbar, resolution controls, state, compatibility types, and advisory
  banner are removed.
- Provider input is the selected projection only: title, abstract, allowed
  answers (non-blind rounds only — blind review sends no custom answers at
  all, fail-closed against deanonymizing custom fields), and attachment
  metadata (`name`, MIME type, byte size) — never attachment contents or
  URLs, never participant data.
- Evaluation AI: GPT-5.6 Sol default, `high` reasoning effort default
  (runtime, both wrangler templates, `.env.example`, and the config renderer
  supports reasoning-effort overrides), `temperature: 0`, `store: false` on
  every OpenAI Responses request, English rationales enforced before
  persistence.
- Blind review is fully fail-closed at the provider boundary: no custom
  answers, no participant data, and projected attachment filenames replaced
  with generic `attachment` metadata (type and size only) — submitter-
  controlled names never reach the external provider.
- Regeneration and revision-driven staleness work in deployed D1: the
  shared-scope unique index covers only active statuses (`pending`,
  `overridden`), so stale history coexists with exactly one fresh scorecard.
  Covered by dedicated stale-then-regenerate regressions at the service and
  D1 migration levels.
- Removed residual reviewer AI contract surface: the web request model no
  longer encodes suggestion generate/resolve variants, and
  `ReviewContext.suggestions` plus its access-layer validation are gone.
- Override inputs impose no client-side numeric floor; server-side rubric
  bounds (including negative ranges) remain authoritative.
- `apps/api/migrations/0051_shared_ai_triage.sql` follows the repository's
  strict snapshot-rebuild protocol and passes the destructive-migration
  validator; it preserves existing suggestion/candidate/history data, adds
  nullable shared scope plus `override_json`, and installs the shared-scope
  uniqueness index. Its deployed index name now exactly matches the Drizzle
  declaration: `evaluation_suggestions_shared_active_scope_unique`.

## Verified evidence through `39251bae`

- Full focused matrix (API features, D1 repository, AI integrations, web
  review UI): 81 files, 881 passed, 2 intentional live-provider skips.
- After the final index-name alignment: migration-validator 8/8 passed;
  fresh isolated-D1 application ran `0051`; focused D1 repository plus
  evaluation-service suites passed 192 tests.
- Includes new regressions: concurrent shared-scorecard generation (memory
  and D1), stale-then-regenerate lifecycle (service and migrated D1),
  duplicate active-scope rejection, blind-review filename redaction,
  non-blind projected answers, English-only rationale rejection, and
  desktop column-order/loading/error accessibility.
- Repository typecheck: API and web both pass (web after the inherited
  integrations/layout drift was resolved by merged main).
- Repository lint: no errors; lane-owned files formatter-clean.
- `make test` at `39251bae` ran 2,438 tests: 2,438 passed, 3 skipped, and
  one failed. The sole failure is the inherited
  `workspace-surface-tokens.test.ts` speaker-CSS contract from
  `github/main`; its last-changing commit is an ancestor of `github/main`,
  and this lane has no diff in that web-CSS path.
- Formatter: every lane-owned changed file is clean. Four remaining drift
  files (`file-upload.tsx`, `cfp-wizard-sections.tsx`,
  `portal-task-upload.tsx`, `file-upload-dropzone-qa.spec.ts`) are inherited
  committed drift from main, untouched by this lane.
- Focused Chromium fixture QA passed at desktop and mobile widths: reviewers
  see human-only score controls with no AI triage surfaces.
- Local D1 migration applied cleanly to a fresh isolated state via
  `make db-local`.

## Final review evidence

Five independent review lanes inspected exact code-review head
`39251baea66e3981826245b99f402d4dbe36ed53`; all returned PASS with no
blocker or high findings:

- Security: verified fail-closed blind provider input, organizer-only
  suggestion operations, tenant scoping, `store: false`, and temperature 0.
- Code quality: verified the migration/schema partial-index name and
  predicate align; stale-to-regenerate regressions cover the deployed D1
  lifecycle; no residual reviewer-suggestion contract or invalid UI floor.
- Integration/deployability: verified snapshot-rebuild ordering, `0051`
  fixture wiring, conflict reload behavior, config rendering, and deleted
  reviewer request variants.
- Compliance: verified human-controlled advisory behavior, backend-only
  OpenAI integration, English rationale enforcement, audit vocabulary, and
  D1 authority.
- Functional/UX: verified accessible status/error feedback and desktop/mobile
  parity. The exact-head Chromium reviewer scenario passed (1 test, desktop
  and mobile human-only controls with no AI surfaces).

`make check` reaches format verification after typecheck and lint, then
reports only the four inherited formatter-drift files named above; they are
outside this lane and remain untouched. PR #34 evidence must record the
final documentation-only head created from this update and its
`github/main` merge-base.

Round one (at `46365bc3`) and round two (at `0167ec28`) produced FAIL
verdicts; every finding from both rounds is addressed in `65a53dee`:
shared-scope race, blind-review answer and filename leakage, OpenAI
retention, deployed reasoning default, migration stale-row predicate,
desktop column order, loading/error accessibility, English enforcement,
Drizzle enum drift, dropdown audit values, `.env.example` default, override
input bounds, and reviewer contract residue. An independent integration
review found and the lane fixed one additional non-behavioral drift:
migration `0051` created the same shared active-scope unique index under a
different name than its Drizzle declaration. Do not merge or deploy until
the inherited main failures have an explicit release decision.
