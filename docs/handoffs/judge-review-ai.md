# Judge Review AI Lane Handoff

## Checkpoint

- Round-two review-fix checkpoint pushed:
  `65a53dee5cede039108fcf022d38859e407ff1a2`
  (`fix(evaluations): close round-two triage review findings`).
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
  uniqueness index.

## Verified evidence at `65a53dee`

- Full focused matrix (API features, D1 repository, AI integrations, web
  review UI): 81 files, 881 passed, 2 intentional live-provider skips.
- Includes new regressions: concurrent shared-scorecard generation (memory
  and D1), stale-then-regenerate lifecycle (service and migrated D1),
  duplicate active-scope rejection, blind-review filename redaction,
  non-blind projected answers, English-only rationale rejection, and
  desktop column-order/loading/error accessibility.
- Repository typecheck: API and web both pass (web after the inherited
  integrations/layout drift was resolved by merged main).
- Repository lint: no errors; lane-owned files formatter-clean.
- `make test`: single remaining failure is the inherited
  `workspace-surface-tokens.test.ts` speaker-CSS contract from merged main
  (`d8e478c5`); this lane has no diff in those paths.
- Formatter: every lane-owned changed file is clean. Four remaining drift
  files (`file-upload.tsx`, `cfp-wizard-sections.tsx`,
  `portal-task-upload.tsx`, `file-upload-dropzone-qa.spec.ts`) are inherited
  committed drift from main, untouched by this lane.
- Focused Chromium fixture QA passed at desktop and mobile widths: reviewers
  see human-only score controls with no AI triage surfaces.
- Local D1 migration applied cleanly to a fresh isolated state via
  `make db-local`.

## Final-review requirement

Five independent reviews must inspect the final pushed documentation head.
Round one (at `46365bc3`) and round two (at `0167ec28`) produced FAIL
verdicts; every finding from both rounds is addressed in `65a53dee`:
shared-scope race, blind-review answer and filename leakage, OpenAI
retention, deployed reasoning default, migration stale-row predicate,
desktop column order, loading/error accessibility, English enforcement,
Drizzle enum drift, dropdown audit values, `.env.example` default, override
input bounds, and reviewer contract residue. Round three runs against the
final head; its exact SHA and verdicts belong in the PR #34 and issue #47
evidence comments. Do not merge or deploy until all five verdicts pass and
the inherited main failures have an explicit release decision.
