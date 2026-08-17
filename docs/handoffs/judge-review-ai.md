# Judge Review AI Lane Handoff

> **Paused by user request.** Do not resume feature work, merge, deploy, or delete
> this worktree/branch until the lane is explicitly resumed.

## Repository and lane

- Repository: `jaeyunha/eventloom`
- Branch: `judge-review-ai`
- GitHub branch:
  <https://github.com/jaeyunha/eventloom/tree/judge-review-ai>
- Worktree:
  `/Users/jaeyunha/wt/open-sessionboard/judge-review-ai`
- Pull request: [PR #34](https://github.com/jaeyunha/eventloom/pull/34)
  (`OPEN`; GitHub reported `CLEAN` before this checkpoint push)
- Handoff issue title: `[Lane handoff] judge-review-ai`

## Exact revision state at pause

- Branch `HEAD` before the checkpoint commit:
  `98af96667c55fd870e5288d23b1de0c8b75fe070`
- Pending merge parent/effective incorporated base:
  `e1d91309fbbd4ae22516dd6cdf060feec373d6ee`
- Latest fetched `github/main`, **not incorporated**:
  `6467ff1f48c73229c5c45dba6b4716df724a3bdd`
- Latest main includes merged PR #36 and subsequent main changes through merged
  PR #42.
- Before checkpointing, the branch was 1 commit ahead and 13 commits behind the
  latest fetched `github/main`.
- The exact pushed checkpoint commit is linked from the handoff issue because a
  committed document cannot contain the hash of the commit that contains it.

## Lane objective and scope

Harden advisory review AI without transferring authority away from the human
reviewer or D1:

1. Validate criterion-complete provider output at the service boundary.
2. Accept only meaningful, submission-grounded rationales and exact source
   excerpts.
3. Keep dropdown values constrained to configured rubric options.
4. Revoke AI generation, listing, and resolution when reviewer or submission
   authority is lost.
5. Keep D1 as the transactional evaluation command authority and Airtable as a
   non-authoritative projection reader.
6. Preserve advisory UI labeling, human confirmation, manual review, and
   secret-safe provider failures.

## Completed implementation

- `EvaluationService` requires exactly one candidate for every scoreable
  criterion and rejects partial, duplicate, unexpected, empty unknown-bucket,
  and non-scoreable criterion results before persistence.
- All-free-text rubrics fail locally with a stable domain error before provider
  invocation.
- Rationale validation now requires:
  - submission-token grounding;
  - an explanatory relation;
  - a bounded impact pattern;
  - only controlled explanatory vocabulary outside source terms.
- The regression that previously accepted
  `Practical material audience concrete outcome supports banana bicycle.` was
  repaired; the focused rejection test passes.
- Workers AI treats rubric/title/abstract fields as untrusted data, rejects
  embedded instructions, constrains criterion IDs and scores, requires literal
  title/abstract excerpts, and binds each rationale to its declared excerpt.
- Only `submitted` material is reviewable. Draft, reopened, withdrawn, unknown,
  and missing material is blocked before provider invocation and before
  suggestion reads/writes.
- Generation, listing, stale marking, and resolution recheck reviewer,
  conflict, assignment, and submission authority.
- The D1 suggestion CAS guard now binds the assignment's `submission_id`,
  requires the authoritative `submissions.id` row to remain `submitted`, and
  requires no decision in the same atomic batch.
- Deterministic promise-gated races cover conflict and submission withdrawal
  during generation, listing, stale marking, and resolution.
- `AirtableEvaluationProjectionStore` is read-only for evaluations and no
  longer implements or exposes evaluation command mutations.
- Dropdown advisory rendering, provenance, uncounted/pending labeling, human
  overrides, reload behavior, and manual-review fallback remain implemented.
- PR #30's submitted-review/comment functionality was preserved in the pending
  base integration.

## Remaining tasks

### Base integration

- [ ] Fetch `github/main` and confirm whether
  `6467ff1f48c73229c5c45dba6b4716df724a3bdd` is still current.
- [ ] Incorporate latest main. The current checkpoint only incorporates
  `e1d91309fbbd4ae22516dd6cdf060feec373d6ee`.
- [ ] Resolve only `judge-review-ai` conflicts. PR #36 overlaps
  `apps/api/src/features/evaluations/service.ts`,
  `apps/api/src/features/evaluations/service.test.ts`, and review workspace
  tests.
- [ ] Recheck open PR #38 (`judge-participant-lifecycle`) before finalizing,
  because it changes submitted-proposal lifecycle behavior that may affect the
  submitted-only reviewability contract.
- [ ] Inspect the final diff against the newly incorporated main and confirm no
  unrelated lane changes.

### Boundary and review follow-up

- [ ] Rerun the arbitrary-filler, multilingual-rationale, exact-excerpt,
  candidate-completeness, inactive-material, withdrawal-race, and D1 guard
  tests after main integration.
- [ ] Execute or add a real migrated-D1 integration check for the submission
  lifecycle guard. Current repository coverage validates generated SQL and its
  real column name but does not execute the guard against a migrated database.
- [ ] Reassess the controlled explanation vocabulary after main integration.
  It intentionally fails closed and may reject legitimate new wording or
  languages; do not broaden it without adversarial regressions.
- [ ] Repeat the five-way goal, code-quality, security, hands-on QA, and context
  review. The latest code/security review failure was repaired, but the full
  review set was not rerun after the final controlled-vocabulary edit because
  the user paused the lane.

### Verification still required

- [ ] Run the complete focused review-AI matrix after latest-main integration.
- [ ] Run `make check`.
- [ ] Run `make test` without overlapping it with another heavy gate.
- [ ] Run `make build`.
- [ ] Recreate and run isolated Chromium QA on unused ports.
- [ ] Record new screenshot hashes and local-only evidence.
- [ ] Update PR #34's body with the final base SHA, final head SHA, final test
  counts, browser command, and evidence limitations.
- [ ] Confirm PR #34 is `OPEN` and GitHub reports the final merge state.
- [ ] Do not merge or deploy from this handoff checkpoint.

## Known review findings and unresolved risks

- Latest main `6467ff1` is not incorporated; this is the primary blocker to
  calling the lane final.
- The final controlled-vocabulary change repaired the immediate failing test,
  but full check/test/build/browser gates were not rerun after that last edit.
- The D1 SQL guard uses the real `submissions.id` column and its focused SQL
  assertion passes. A real migrated-schema execution test remains recommended.
- Rationale validation is deterministic and intentionally conservative. The
  allowlist can cause false negatives for legitimate prose or languages not
  represented in its regressions.
- Live provider tests remain credential-gated. No live OpenAI/Workers AI result
  is release evidence.
- Browser evidence is local-only, not deployed staging or production evidence.
- Other open lanes exist. Do not assume a clean merge after any of PRs #31,
  #32, #33, #37, #38, #39, or #40 changes main.

## Verification evidence at pause

| Command / check | Status | Evidence |
| --- | --- | --- |
| Focused service/provider/D1 suites before the last allowlist edit | **PASS** | 111 passed, 1 live-provider test skipped |
| Focused complete review-AI matrix before the last allowlist edit | **PASS** | 256 passed, 2 credential-gated tests skipped |
| `make check` before the last allowlist edit | **PASS** | Typechecks clean; Biome checked 1,250 files |
| `make test` before the last allowlist edit | **PASS** | Full non-browser repository gate exited 0 |
| `make build` before the last allowlist edit | **PASS** | Contracts, CLI, Worker, and Next.js build exited 0 |
| Safe-port Chromium before the last allowlist edit | **PASS** | 1 passed; ports 3285/9085/9525 |
| Browser screenshot hash | **PASS** | `4c8c03d5e4a13ed8e6f0a68765a88c2ca0ae1f3a923ad59e3eb41c923b19639d` |
| Final arbitrary-filler regression after the last allowlist edit | **PASS** | 1 passed, 86 skipped |
| Corrected focused D1 lifecycle guard test | **PASS** | 1 passed, 10 skipped |
| Initial combined focused selector | **PARTIAL PASS** | Filler test passed; D1 file was skipped because the selector used a stale test title, then the corrected D1 command above passed |
| `git diff --check` after the final edit | **PASS** | Staged and unstaged diff checks emitted no findings |
| API typecheck after the final edit | **PASS** | `bun run --cwd=apps/api typecheck` exited 0 |
| Full gates after the final allowlist edit | **UNRUN** | Paused by user request |
| Live provider verification | **UNRUN** | Credential-gated; not claimed |

## Dirty, generated, and untracked file disposition

- Generated outputs were removed:
  - `apps/web/.next`
  - `test-results`
  - `playwright-report`
  - `node_modules/.vite-temp`
  - `apps/api/.wrangler`
  - `.wrangler`
- `.debug-journal.md` was deleted and is not part of the checkpoint.
- `.pr-body.md` is a temporary stale draft and must not be committed. Remove it
  before final staging.
- No unrelated stashes were applied, dropped, or modified.
- Preserve every staged/unstaged lane-owned source and test edit. Do not use
  destructive Git commands.

## Precise resume instructions

```bash
cd /Users/jaeyunha/wt/open-sessionboard/judge-review-ai

git status --short --branch
git fetch github main
git rev-parse HEAD github/main

# Inspect this handoff and the handoff issue before changing code.
git merge --no-commit github/main
# Resolve only judge-review-ai conflicts; preserve merged PR #36 behavior.

bun run test:unit -- \
  apps/api/src/features/evaluations/service.test.ts \
  apps/api/src/integrations/ai/cloudflare.test.ts \
  apps/api/src/infrastructure/cloudflare/repositories/evaluations.test.ts \
  apps/api/src/runtime/composition.test.ts \
  apps/web/src/features/reviews/review-workspace.test.tsx \
  apps/web/src/features/reviews/workspace/model-validate-suggestion-edit-value.test.ts

make check
make test
make build

# Choose unused ports before running Playwright.
for port in 3291 9091 9531; do lsof -nP -iTCP:$port -sTCP:LISTEN; done
PLAYWRIGHT_WEB_PORT=3291 \
PLAYWRIGHT_API_PORT=9091 \
PLAYWRIGHT_API_INSPECTOR_PORT=9531 \
AI_PROVIDER=disabled \
bun run test:e2e -- <restored-review-ai-qa-spec>

# Repeat independent review, then update and push PR #34.
git diff --check
git status --short --branch
```

The lane is intentionally paused at this handoff by user request.
