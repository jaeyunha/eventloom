# judge-review-ai lane handoff

Updated: 2026-08-17

## Current status

The lane is active and in final verification. It is not paused. No production
deployment was performed.

- Repository: `https://github.com/jaeyunha/eventloom`
- Branch: `judge-review-ai`
- Worktree: `/Users/jaeyunha/wt/open-sessionboard/judge-review-ai`
- Source checkpoint before this documentation update: `2670afbe6e975a22f78513c58d1a23e5e970bef4`
- Incorporated `github/main`: `e0bf50188e031c33709bb1585923fdf88d9a2124`
- Latest main contains the merged PR #31 portal-reminders, PR #40, PR #60
  public-widgets, and PR #61 export work.
- PR: `https://github.com/jaeyunha/eventloom/pull/34`
- Handoff issue: `https://github.com/jaeyunha/eventloom/issues/47`

The documentation commit that adds this file will become the next branch tip.
After pushing, verify the exact remote tip with:

```sh
git fetch github main
git rev-parse HEAD github/main github/judge-review-ai
gh pr view 34 --repo jaeyunha/eventloom \
  --json state,mergeStateStatus,baseRefOid,headRefOid,url
```

## Objective and scope

Make advisory AI review suggestions safe at every authoritative boundary while
preserving explicit human confirmation and the existing review experience.

In scope:

- exactly one provider candidate for every scoreable criterion;
- rejection of all-free-text rubrics before provider invocation;
- deterministic, nontrivial, submission-grounded rationales;
- exact, case-sensitive title/abstract excerpts bound one-to-one to rationales;
- prompt-injection-resistant provider interaction;
- active submitted-only AI generation, listing, and resolution;
- conflict, abstention, withdrawal, decision, assignment-version, and review-write
  authority checks;
- D1 as the transactional command authority and Airtable as a read-only
  projection;
- advisory dropdown labels, uncounted pending state, and explicit human
  confirmation;
- preservation of organizer `under_review` visibility;
- preservation of merged export, public-widget, and portal-reminder work.

Out of scope:

- production deployment;
- merging unrelated branches outside the required `github/main` integration;
- changing provider credentials or external resources.

## Completed implementation

- Service normalization rejects missing, duplicate, unexpected, non-scoreable,
  partial, and extra criterion candidates before persistence.
- Provider output must include aligned `title:<literal excerpt>` or
  `abstract:<literal excerpt>` references for every rationale. The service
  independently checks exact source membership and rationale grounding, so an
  injected provider cannot bypass the Cloudflare adapter.
- Generic, one-word, repeated-source, arbitrary-filler, and unsupported
  rationales are rejected using machine-testable deterministic rules.
- Rubrics containing only free-text criteria fail locally with the stable
  `EVALUATION_ADVISORY_UNSUPPORTED` error and never invoke the provider.
- Untrusted rubric, title, and abstract data are serialized separately from
  instructions and explicitly treated as data, not commands.
- Abstained assignments are rejected before AI provider invocation or protected
  suggestion reads.
- Client-supplied `origin: "ai"` review scores are rejected. AI-origin scores
  can only be created by the validated advisory suggestion resolution path.
- `saveReview`, `confirmAiScores`, and `submitReview` all use the canonical
  `writeReview` repository command.
- The in-memory and D1 write boundaries check assignment identity/version/status,
  conflicts, submitted material, decisions, plan and round revisions, current
  submission revision, and temporal plan/round authority before mutation.
- D1 guard, review mutation, score/evidence replacement, and optional assignment
  transition execute in one atomic batch. A migrated-D1 withdrawal race test
  verifies no review persists after authority revocation.
- Local composition supplies the in-memory repository with the authoritative
  submission source. D1 remains authoritative for deployed command writes.
- Airtable evaluation storage exposes only `EvaluationProjectionReader`; it has
  no evaluation suggestion command mutation methods.
- Dropdown suggestions render configured labels such as `Reject`, remain
  pending and uncounted until acceptance/edit, and preserve explicit human
  confirmation.
- Added the missing `0029_agenda_validation_revision.sql` to the canonical
  speaker lifecycle test migration list so the merged-main full test gate
  exercises the agenda schema expected by current code.
- Kept PR #61 export jobs, organizer results export, migration 0036, and export
  handoff unchanged from incorporated main. Kept PR #60 public-widget files and
  PR #31 portal-reminder files unchanged from incorporated main.

## Verification completed

Commands and status at the source checkpoint:

- `git diff --check`: **PASS**
- `bun run test:unit --` focused AI/review matrix: **PASS**; 257 passed,
  1 credential-gated test skipped.
- `make check`: **PASS**; workspace typecheck, lint, and format checks clean.
- `make test`: **PASS** after the agenda migration-list repair and D1 guard
  assertion correction; 2267 tests passed, 3 skipped.
- `make build`: **PASS**
- Isolated Chromium QA:

  ```sh
  PLAYWRIGHT_WEB_PORT=3291 \
  PLAYWRIGHT_API_PORT=9091 \
  PLAYWRIGHT_API_INSPECTOR_PORT=9531 \
  PLAYWRIGHT_REUSE_EXISTING_SERVER=false \
  AI_PROVIDER=disabled \
  bun x playwright test tests/e2e/review-ai-advisory.qa.spec.ts --project=chromium
  ```

  **PASS**, one test. Desktop and mobile artifacts were inspected; mobile has
  no horizontal overflow and the Accept transition becomes human-confirmed
  and countable.

- Final source diagnostics: **PASS** for evaluation features, D1 evaluation
  repositories, web review workspace, and speaker lifecycle support.

Latest captured local browser evidence:

| Artifact | Dimensions | SHA-256 |
| --- | ---: | --- |
| `test-results/review-ai-advisory-desktop.png` | 1440x1000 | `17d0b1efb1ad28fa7730d6d995f861c65d1003be6c0483c397f18590962e2f57` |
| `test-results/review-ai-advisory-mobile.png` | 390x844 | `d911fd68f872ce9aeabc3354f606f97f217d4a1c7052fbe1eff8d8e7537e0ed9` |

These are local route-intercepted QA artifacts with `AI_PROVIDER=disabled`;
they are not live provider or deployment evidence.

## Final five-review checklist

The final five-review must run on the pushed tip after this handoff update:

- [ ] Goal/constraint reviewer returns PASS against current `github/main`.
- [ ] Code-quality reviewer returns PASS, including D1 value ordering and
      migrated rollback coverage.
- [ ] Security reviewer returns PASS for provider, review-write, abstention,
      withdrawal, decision, and revision authority.
- [ ] Hands-on QA reviewer returns PASS for focused tests and Chromium flow.
- [ ] Context/dependency reviewer returns PASS for PR #31/#40/#60/#61
      preservation and current PR/issue metadata.
- [ ] Resolve every finding before merge; do not waive a release blocker.

## Remaining delivery tasks

- [ ] Push the handoff documentation commit and verify branch/PR head.
- [ ] Update PR #34 body with base `e0bf501`, final source checkpoint, actual
      verification results, and the latest screenshot hashes.
- [ ] Update issue #47 so it no longer says the lane is paused; retain the
      detailed checklist, dependency order, and resume commands.
- [ ] Confirm exactly one open issue titled `[Lane handoff] judge-review-ai`.
- [ ] Merge PR #34 into `main` only after all five final reviewers PASS.
- [ ] Verify the resulting GitHub main merge commit and that no deployment was
      performed.

## Known risks and assumptions

- The final browser run is mocked/route-intercepted local QA, not live provider
  evidence.
- Historical persisted suggestions are not retroactively revalidated; new
  provider output is validated at the service boundary before persistence.
- The D1 guard relies on existing evaluation, submission, plan, round, and
  revision tables; no schema migration is introduced by the review-AI lane.
- The expected D1 CAS diagnostic may emit `malformed JSON` when the guard
  intentionally aborts a batch. The relevant tests assert rejection and no
  persisted state.
- No production deployment has been performed or claimed.

## Dependency and merge order

1. `e0bf50188e031c33709bb1585923fdf88d9a2124` (`github/main`) is already
   incorporated into this lane.
2. Push the documentation update and verify PR #34 is clean/mergeable.
3. Complete the final five-review on the pushed tip.
4. Merge PR #34 into `main`.
5. Do not deploy production as part of this lane.

## Dirty, generated, and untracked disposition

- Only intended source, test, and handoff files may be committed.
- `.debug-journal.md`, `.pr-body.md`, browser screenshots, `test-results`,
  `.next`, Wrangler state, build output, and temporary QA files must remain
  deleted or ignored and unstaged.
- Before final push:

  ```sh
  git status --short --branch
  git diff --check
  git diff --cached --check
  ```

- The worktree must be clean after the documentation commit.

## Resume and finalization commands

```sh
cd /Users/jaeyunha/wt/open-sessionboard/judge-review-ai
git fetch github main
git merge --no-edit github/main
bun run test:unit -- apps/api/src/features/evaluations/service.test.ts \
  apps/api/src/infrastructure/cloudflare/repositories/evaluations.test.ts
make check
make test
make build
gh pr view 34 --repo jaeyunha/eventloom
gh pr merge 34 --repo jaeyunha/eventloom --merge
```

Never deploy production from this lane. Merge only after the final five-review
verdict is PASS and the PR/issue/handoff metadata has been updated.
