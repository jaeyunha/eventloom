# Judge Review AI Lane Handoff

## Checkpoint

- Implementation checkpoint pushed: `1b27e21595415c4f3fcd9303956e83fc07c9f44d`
  (`feat(evaluations): share organizer AI triage`).
- Latest merged `github/main` remains in the lane ancestry.
- PR #34 must remain open, unmerged, and undeployed.

## Delivered behavior

- Organizers can opt a review round into AI triage in the existing round editor.
- An opted-in round has one cached advisory scorecard per `(plan, round,
  submission)`, not one per reviewer assignment.
- Only organizers may generate, regenerate, list, or persist overrides. The
  organizer results view shows candidate values, rationale/provenance, and
  inline override values plus an optional reason.
- Reviewers have human-only score controls. The prior reviewer suggestion API,
  toolbar, acceptance/resolution controls, state, compatibility types, and
  remaining advisory banner are removed.
- Provider generation uses the selected review projection only: title,
  abstract, allowed answers, and attachment metadata (`name`, MIME type, byte
  size) but never attachment contents or URLs. Blind-review identity fields and
  participant data are redacted before the provider call.
- Evaluation AI uses GPT-5.6 Sol by default, high reasoning effort by default,
  and `temperature: 0`. Prompts require English rationales and admit only
  exact title, abstract, or allowed-answer excerpts as evidence.
- `apps/api/migrations/0051_shared_ai_triage.sql` is in the production
  migration path. It preserves existing suggestion data while safely rebuilding
  nullable shared suggestion scope and its child-table foreign keys.

## Verified evidence

- API typecheck passed after the compatibility removal.
- Focused API service, routes, rationale, Cloudflare provider, and OpenAI
  binding tests passed; live-provider tests remain intentionally skipped.
- D1 repository suite passed: `24 passed`, including all three migrated
  lifecycle CAS tests.
- Reviewer/organizer web suite passed: `21 files`, `107 tests`.
- API and web application builds passed independently.
- Focused Chromium fixture QA passed at desktop and mobile widths:
  reviewers open a scorecard with a human Recommendation control and see no AI
  triage, suggestion, generation, regeneration, or override controls.
- `git diff --check` was clean.

## Broad-gate limitations outside this lane

- Repository-wide typecheck currently fails in the unmodified integrations
  layout generated-route contract (`apps/web/.../integrations/layout` receives
  `Promise<unknown>` where route params are required).
- `make test` has one unrelated failure in
  `apps/web/src/components/workspace/workspace-surface-tokens.test.ts` caused
  by a workspace CSS token expectation; the run otherwise reached `2,434`
  passing tests and `3` skips.
- `make check` still reports formatter drift in clean files outside this lane,
  including `tests/e2e/file-upload-dropzone-qa.spec.ts`.
- The broad isolated Playwright runner has a pre-existing
  `content-collection-detail` failure and later fixture-start timeout. It was
  stopped after source changed so its result is stale; the focused reviewer
  Chromium scenario above is current evidence.
- A direct local `make dev` stack cannot become healthy with this worktree's
  intentionally credential-free `.env`; fixture-backed Chromium QA was used.
  No staging or production deployment evidence is claimed.

## Final-review requirement

Five independent reviews must inspect the final pushed documentation head, not
the implementation checkpoint above. Their exact SHA and verdicts belong in
the PR #34 and issue #47 evidence comments. Do not merge or deploy until all
five verdicts pass and the broad-gate limitations have an explicit release
decision.
