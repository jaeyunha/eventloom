# Judge Review AI Lane Handoff

## Checkpoint

- Review-fix checkpoint pushed: `1130bf7f63a296d971632d7b38bc76eee1f7ff18`
  (`fix(evaluations): enforce shared triage review fixes`).
- Earlier lane checkpoints: `46365bc3f989444378769e325c9246446fe42814`
  (first integrated shared-triage head) and
  `1b27e21595415c4f3fcd9303956e83fc07c9f44d` (initial implementation).
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
  (runtime, both wrangler templates, and the config renderer now supports
  reasoning-effort overrides), `temperature: 0`, `store: false` on every
  OpenAI Responses request, English rationales enforced before persistence.
- `apps/api/migrations/0051_shared_ai_triage.sql` follows the repository's
  strict snapshot-rebuild protocol and passes the destructive-migration
  validator; it preserves existing suggestion/candidate/history data, adds
  nullable shared scope plus `override_json`, and installs the shared-scope
  uniqueness index.

## Verified evidence at `1130bf7f`

- Focused API matrix (service, routes, validation, Cloudflare provider,
  OpenAI binding): 153 passed, 1 intentional live-provider skip.
- D1 repository suite: 25 passed, including concurrent shared-scope
  duplicate rejection, migrated lifecycle CAS, and withdrawal races.
- Web review suite: 108 passed, including desktop column-order assertion,
  loading/error feedback, and override form accessibility.
- Repository typecheck: all four packages pass, including web.
- Repository lint: clean (no errors, no lane warnings).
- `make test`: 2,438 passed / 1 failed / 3 skipped — the single failure is
  `workspace-surface-tokens.test.ts`, inherited from merged main
  (`d8e478c5 fix(web): redesign organizer speaker workspace` changed the CSS
  contract; this lane has no diff in those paths). Pre-existing, not
  lane-owned.
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
Round one (at `46365bc3`) produced FAIL verdicts whose blockers are all
addressed in `1130bf7f`. Round two runs against the final head; its exact
SHA and verdicts belong in the PR #34 and issue #47 evidence comments. Do
not merge or deploy until all five verdicts pass and the inherited main
failures have an explicit release decision.
