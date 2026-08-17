# Judge Review AI Lane Handoff

## Current state

- Repository: `jaeyunha/eventloom`
- Branch: `judge-review-ai`
- Worktree: `/Users/jaeyunha/wt/open-sessionboard/judge-review-ai`
- Exact base: `c5fc50256d10be142e1c9e142d1f78f6980ca2e3` (`github/main`)
- Exact head: `979a6bfb0dbf0781f0330abfc629c601258cb2f4`
- Pull request: https://github.com/jaeyunha/eventloom/pull/34
- PR state: open, non-draft, mergeable; merge is intentionally not yet performed
- Handoff issue: https://github.com/jaeyunha/eventloom/issues/47
- Latest main is fully integrated; no external evaluator repository was inspected or invoked.
- No production deployment was performed by this lane.

## Objective and scope

Enforce advisory AI review-suggestion correctness and authority at the provider,
service, repository, and reviewer UI boundaries while preserving explicit human
confirmation. The lane covers candidate completeness, exact source evidence,
meaningful rationale, prompt/data separation, submitted-only lifecycle,
assignment/conflict/decision authority, D1 command authority, Airtable
projection behavior, dropdown labels, and advisory UI state.

## Completed implementation

- Requires exactly one provider candidate for every scoreable criterion.
- Rejects partial, duplicate, unexpected, non-scoreable, and all-free-text output.
- Requires deterministic, non-trivial, submission-grounded rationales.
- Requires exact case-sensitive title/abstract excerpts aligned one-to-one with
  each rationale, including injected-provider validation.
- Separates untrusted rubric and submission data from model instructions and
  preserves strict criterion-bound output schemas.
- Rejects client-supplied AI-origin review scores and preserves human-confirmation
  counting semantics.
- Enforces submitted-only AI generation, listing, resolution, and review writes,
  with withdrawal, conflict, decision, abstention, and assignment CAS coverage.
- Uses D1 as the authoritative evaluation command repository and Airtable as the
  projection path used by production composition.
- Preserves configured dropdown labels and advisory pending/uncounted UI state.
- Preserves merged Eventloom work from PRs #31, #33, #40, #60, #61, #62, #63,
  and #66 through the c5fc502 integration.

## Exact-head verification

- Focused review-AI matrix: PASS — 8 files, 297 passed, 1 skipped.
- API typecheck: PASS.
- Web typecheck: PASS.
- `git diff --check`: PASS.
- Chromium advisory QA on isolated ports 3291/9091/9531: PASS — 1 test.
- Browser QA confirms pending/uncounted advisory state, configured dropdown
  label mapping, evidence/provenance rendering, keyboard focus, mobile
  containment, and human-confirmed counted state.
- `make check`: BLOCKED by four formatter failures in canonical-main files:
  `apps/web/src/features/admin/cfp-editor-model.ts`,
  `apps/web/src/features/admin/cfp-editor-sections.tsx`, and
  `apps/web/src/features/cfp/cfp-wizard.tsx`; the lane-owned formatter failures
  are clean. These unrelated main files were not modified by this lane.
- Full repository test/build gates: pending final execution after the five-review
  authority audit; do not claim them as release evidence until rerun.

## Five-review gate

The final five independent reviews must all be PASS before merge. Record each
reviewer, exact head, verdict, and evidence here:

- [ ] Security review at `979a6bfb0dbf0781f0330abfc629c601258cb2f4`
- [ ] Code-quality review at `979a6bfb0dbf0781f0330abfc629c601258cb2f4`
- [x] Functional/visual QA at `979a6bfb0dbf0781f0330abfc629c601258cb2f4`
- [ ] Context/dependency review at `979a6bfb0dbf0781f0330abfc629c601258cb2f4`
- [ ] Goal/compliance review at `979a6bfb0dbf0781f0330abfc629c601258cb2f4`

Current security review reported authority findings requiring resolution before
the gate can pass. Do not merge on a partial or pre-fix review.

## Remaining tasks

- [ ] Resolve every confirmed security/code review blocker at the authoritative
  in-memory, D1, and Airtable boundaries.
- [ ] Add deterministic regressions for every newly fixed race or admission rule.
- [ ] Rerun focused tests, API/web typechecks, full relevant gates, and Chromium
  QA on the next exact pushed head.
- [ ] Rerun all five independent reviews on that exact pushed head and record
  five PASS verdicts here.
- [ ] Update this handoff and issue #47 with the final exact head and evidence.
- [ ] Update PR #34 body with the final base/head and verification evidence.
- [ ] Merge PR #34 only after five PASS reviews and clean mergeability.
- [ ] Do not deploy production.

## Known risks and dependencies

- `make check` currently reports only unrelated formatting failures in the
  canonical-main web files listed above; they must be distinguished from any
  newly introduced lane failure.
- The final five-review gate is a hard dependency for merge.
- PR #34 depends on canonical main c5fc502 and must remain based on that exact
  revision until the next explicit main update.
- No external evaluator repository may be used.

## Dirty/generated/untracked disposition

- The committed lane head contains no generated artifacts.
- Ignored local outputs such as `apps/web/.next`, `apps/api/dist`,
  `packages/cli/dist`, `test-results`, and any `apps/web/tmp` content are
  disposable and must remain unstaged; remove them before final delivery.
- Only lane-owned source, tests, and this handoff may be staged.

## Resume and delivery commands

```sh
cd /Users/jaeyunha/wt/open-sessionboard/judge-review-ai
git fetch github main
git merge --no-edit github/main
git status --short --branch
bun run test:unit -- apps/api/src/features/evaluations/service.test.ts \
  apps/api/src/infrastructure/cloudflare/repositories/evaluations.test.ts \
  apps/api/src/integrations/ai/cloudflare.test.ts
make check
git push github judge-review-ai
gh pr view 34 --repo jaeyunha/open-sessionboard
```

Before merge, update the PR body and issue #47 with the exact pushed head,
re-run all five reviews, verify the PR remains open/mergeable, and merge only
after every review is PASS. This lane is active and must not be treated as
paused.
