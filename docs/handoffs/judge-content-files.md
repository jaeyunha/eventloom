# Lane handoff: judge-content-files

## Current continuation state

This lane is **active by explicit user override**. Do not deploy production.
The historical pause checkpoint below remains for provenance; the current lane
continues from the pushed head and must not rely on its stale base/head values.

## Repository and branch

- Repository: `https://github.com/jaeyunha/eventloom`
- Branch: `judge-content-files`
- Worktree: `/Users/jaeyunha/wt/open-sessionboard/judge-content-files`
- Pull request: https://github.com/jaeyunha/eventloom/pull/39
- Pull request state: `OPEN`, non-draft, `MERGEABLE`, not merged
- Exact current GitHub-main base incorporated:
  `3e236387223e8e95fa9b2ee78d5e5dee1117882f`
- Exact behavior head verified by this handoff:
  `1517e7fd57cb335a71a7f0bdc8edab38c5e0cb0a`
- All current verification in this document is product-scoped and refers to
this exact head and the `3e236387223e8e95fa9b2ee78d5e5dee1117882f` base.

## Lane objective and scope

Complete the speaker-file lifecycle remediation for upload, retrieval,
replacement, immutable version history, organizer review metadata, and
server-authoritative export while preserving:

- tenant and event authorization boundaries;
- server-created private object keys;
- atomic review/task stale-write protection;
- two-minute, one-time, `no-store` download capabilities;
- validated immutable replacement lineage;
- retained downloadable historical versions;
- D1 as authoritative state and the Cloudflare outbox for durable external
  effects.

## Completed implementation

The current pushed lane includes the earlier implementation plus the verified
replacement-lineage continuation. It:

- atomically persists an organizer `needs_changes` review, family pointer
  updates, task CAS/update, task transition, and audit in one D1 batch;
- mirrors the successful path in local runtime storage;
- returns a submitted upload task to `needs_changes`;
- proves v1 review, returned note/action, v2 upload, immutable v1/v2 history,
  participant Files visibility, and authoritative-current ZIP behavior;
- adds local fixture parity needed for participant Files;
- keeps object keys and capability material out of browser responses.

The pushed continuation contains:

- migrations `0046_speaker_asset_uploader.sql`,
  `0047_speaker_asset_creation_idempotency.sql`,
  `0048_speaker_task_replacement_baseline.sql`,
  `0049_private_download_attribution.sql`, and
  `0050_private_object_cleanup.sql`;
- immutable asset uploader account ID plus upload-time display-label snapshot
  in the domain, D1 schema/repository, local repository, service, organizer
  parser, and file-review context;
- a service regression where an organizer uploader is distinct from the
  speaker and a web model regression for the same distinction;
- speaker-facing asset serialization that removes `reviewedBy` and
  `uploaderAccountId`, while organizer audit storage remains intact;
- migration `0036_speaker_asset_creation_idempotency.sql`;
- typed `CreatePendingSpeakerAssetVersionCommand`;
- partial D1 and local repository implementations for optimistic/idempotent
  pending replacement creation;
- lifecycle fixture migration ordering after main's `0035_event_retirement`
  and `0037_immutable_speaker_projection_snapshots` migrations;
- service, route, D1, local, portal, organizer, and HTTP wiring for explicit
  predecessor/version/idempotency successor creation;
- replacement-baseline enforcement for `needs_changes` task submission;
- local HTTP same-key replay and stale-head conflict coverage;
- requester-bound download capability persistence and audit attribution.
- local download issuance/consumption audit parity;
- deterministic local and D1 review CAS rollback regressions;
- D1-authoritative rejected-object cleanup, typed `file-scan` outbox work,
  ready-history protection, expiry quarantine, and bounded reconciliation.

## Current verification on the pushed head

- `make check`: **FAIL, pre-existing main-only formatting errors** in
  `apps/web/src/features/admin/cfp-editor-model.ts`,
  `apps/web/src/features/admin/cfp-editor-sections.tsx`, and
  `apps/web/src/features/cfp/cfp-wizard.tsx`; no lane file is implicated.
- `make test`: **FAIL, one unrelated main-only test**:
  `apps/web/src/features/work/work-hub.test.tsx`; 2,319 tests passed and 3
  were skipped.
- API/web typechecks: **PASS**.
- API/web builds: **PASS**.
- Focused speaker, D1, local runtime, cleanup, outbox, CFP, composition,
  OpenAPI, and web client suites: **PASS**.
- Isolated Playwright scenario
  `tests/e2e/content-collection-detail.spec.ts`: **PASS**.
- Migration validator: **FAIL on pre-existing main ordinal collisions**
  (`0034`, `0035`, `0037`); lane migrations are uniquely renumbered to
  `0041`-`0045`.
- No production deployment performed.

The remaining review items below are historical checkpoint tasks; current
implementation and verification status above is authoritative. Final merge
still requires independent current-head product verification PASS results.

## Remaining tasks

### Uploader provenance and safe serialization

- [ ] Add D1/API response coverage proving organizer uploader and speaker can
      differ while only the human-safe uploader label is projected.
- [ ] Add speaker portal/list/history/finalize/retry response tests proving
      `reviewedBy`, `uploaderAccountId`, object keys, and tenant IDs are absent.
- [ ] Add organizer audit/parser coverage proving authoritative reviewer
      attribution remains available only on organizer-authorized surfaces.
- [ ] Re-run the content collection browser scenario and replace the old
      duplicate-speaker assertion with a field-scoped uploader assertion.

### Atomic and idempotent replacement authorization

- [ ] Wire `createPendingAssetVersion` into `SpeakerService.issueUploadGrant`
      for every successor asset.
- [ ] Carry expected latest asset ID/version, an idempotency key, and a stable
      request digest through service, routes, portal client, organizer client,
      and test fixtures.
- [ ] Remove the non-atomic service-only family-head decision and treat the
      repository command as the authority.
- [ ] Map a losing writer or mismatched idempotency replay to controlled
      `VERSION_CONFLICT` / HTTP 409 without disguising operational D1 failures.
- [ ] Verify D1 same-key replay returns the canonical stored asset, different
      keys yield one winner, and changed payload with the same key conflicts.
- [ ] Verify local storage has identical CAS/replay semantics and never appends
      duplicate version-2 children.
- [ ] Add deterministic parallel service, D1, local-runtime, and HTTP tests:
      one canonical v2, stable same-key replay, deterministic current
      selection, no grant for the loser, and retained/downloadable v1 bytes.

### Review/task atomicity and task-state invariant

- [ ] Add an actual D1 `reviewAsset` rollback test using a valid asset review
      version and stale task CAS between pre-read and batch.
- [ ] Assert review state/version, task state/version, transition row, every
      family pointer, and asset audit remain unchanged except for the winning
      concurrent task version.
- [ ] Add actual `LocalSpeakerRepository` rollback parity, including stored
      transition/audit evidence if local storage is extended to retain them.
- [ ] Define the invariant for every reachable linked upload-task status:
      `not_started`, `in_progress`, `submitted`, `needs_changes`, `completed`,
      `waived`, `overdue`, and `reopened`.
- [ ] Make a successful `needs_changes` review atomically leave the linked task
      in actionable `needs_changes`, with CAS and a durable transition when a
      transition is required.
- [ ] For an already-returned task, atomically verify its status/version while
      preserving the existing durable return transition.
- [ ] Reject the review without any asset/task/pointer/audit mutation when the
      task invariant cannot be established.
- [ ] Add D1 and local parity regressions for every reachable task state and
      rollback path.

### Replacement baseline before resubmission

- [ ] Persist the immutable returned asset ID as a replacement baseline on the
      linked task in a new migration after `0035`.
- [ ] Establish that baseline in the same atomic review/task mutation.
- [ ] Require the authoritative current asset in that exact family to be a
      ready version newer than the baseline before `needs_changes -> submitted`.
- [ ] At minimum reject an unchanged current asset whose review state remains
      `needs_changes`.
- [ ] Preserve the baseline through work-in-progress transitions and clear it
      only in the successful submission CAS.
- [ ] Add service, D1 reload, local runtime, and HTTP regressions for:
      v1 returned; immediate resubmit conflict; pending/rejected/unrelated
      versions still conflict; ready v2 succeeds; baseline clears.

### Attributable private downloads

- [ ] Persist requester account, requester kind (`speaker` or `organizer`),
      event/participant/asset linkage, and opaque capability ID at grant
      issuance.
- [ ] Never persist or log raw capability tokens, verifier digests outside the
      private capability table, or full capability URLs.
- [ ] Atomically record issuance audit and one-time capability claim/consumption
      audit in D1.
- [ ] Attribute consumption to the issuance principal without claiming the
      bearer URL was presented by the same human.
- [ ] Preserve the existing two-minute expiry, `no-store`, exact token digest
      verification, and one-winner replay denial.
- [ ] Cover speaker and organizer grants, invalid/expired tokens, parallel
      consumption, replay denial, failed audit rollback, and token-free audit
      serialization.

### Durable private R2 cleanup

- [ ] Add an idempotent private-object delete operation to the gateway and
      local fake.
- [ ] Make rejected finalization atomically persist asset/capability state and a
      durable cleanup outbox job before any R2 deletion.
- [ ] Add D1-authoritative expiry/reconciliation for abandoned pending uploads
      and historical post-invalidation failures.
- [ ] Activate a typed `file-scan` outbox effect that resolves the object key
      from the authoritative rejected asset instead of trusting queue payload
      storage coordinates.
- [ ] Add retry, lease, dead-letter, and stranded-job republish behavior using
      existing outbox infrastructure.
- [ ] Never delete `ready` assets, including intentionally retained
      superseded historical versions.
- [ ] Cover rejected, expired/unfinalized, reauthorized, transient delete
      failure, retry/dead-letter, missing object, tenant mismatch, and
      retained-history cases.

### Delivery and review

- [ ] Fetch `github/main` again and incorporate any new revision without
      overwriting unrelated merged work.
- [x] Complete PR #39 description with product root cause, before/after
      behavior, reproducible manual QA, limitations, conflict files, and exact
      base/head evidence.
- [x] Re-run independent post-implementation product verification on the exact
      final head.
- [ ] Do not merge or deploy from this lane.

## Known review findings and unresolved risks

- Atomic review/task CAS is covered by D1 and local stale-task regressions.
- The repository's current main branch still has pre-existing migration ordinal
  collisions (`0034`, `0035`, and `0037`) and three pre-existing formatting
  failures; this lane does not alter unrelated main migrations or UI files.
- The full unit gate has one pre-existing `work-hub` assertion failure; all
  other current-head tests pass.
- Final merge remains gated on independent product verification and a second
  live PR state check at the exact same head.

## Historical checkpoint evidence

### Passed

- `git diff --check`
- `bun run --filter @eventloom/api typecheck`
- `bun run --filter @eventloom/web typecheck`
- `bunx vitest run apps/api/src/features/speaker/private-asset-lifecycle.test.ts apps/web/src/features/deliverables/file-review-model.test.ts --reporter=dot`
  - 2 files passed; 28 tests passed.
- `bunx vitest run apps/api/src/infrastructure/cloudflare/repositories/speaker-lifecycle.test.ts --reporter=dot`
  - 8 tests passed.
- `bun run test:runtime -- --reporter=dot`
  - 10 tests passed.
- `bunx vitest run apps/api/src/infrastructure/cloudflare/repositories/speaker.test.ts --reporter=dot`
  - 17 tests passed.
- `bun run test:scripts`
- `make test`
  - Full unit, script, API, and runtime gate exited 0 after the migration
    header repair.
- `make build`
  - All packages exited 0. Next.js emitted its known dynamic route diagnostic
    for `/events`, but the web build exited 0.
- `make check`
  - Typecheck, Biome lint, and Biome format gate exited 0 after formatting
    repairs.

### Failed and repaired

- The first `make test` run failed because migrations `0034` and `0035` did not
  include the repository-required `PRAGMA foreign_keys = ON;`. Both migrations
  now include it; `bun run test:scripts` and the full `make test` rerun passed.
- The first `make check` run failed only on formatter output in the partial
  route/D1/local edits. The files were formatted manually with `apply_patch`;
  the full rerun passed.

### Not run or not yet valid

- No Playwright/browser run was performed after the paused partial patch. The
  prior pushed commit had a passing content collection scenario, but new
  uploader/serialization changes require a fresh run when work resumes.
- No focused test exists yet for `createPendingAssetVersion`; it is not wired
  into production behavior.
- None of the new task-state invariant, replacement-baseline, download-audit,
  or durable-cleanup regressions has been implemented or run.
- Final post-implementation review is not passing and must be repeated on the
  eventual exact head.

## Dependencies and merge order

1. Fetch and compare latest `github/main` before editing. Merge current main
   into this checkpoint branch normally; do not force-push.
2. Keep migration order stable:
   - `0035_speaker_asset_uploader.sql`
   - `0036_speaker_asset_creation_idempotency.sql`
   - future replacement-baseline migration
   - future download-attribution migration
   - future private-cleanup migration
3. Finish domain/repository commands before route/client wiring.
4. Finish D1 and local parity before browser acceptance.
5. Finish durable cleanup/outbox integration before claiming rejected or
   abandoned bytes are handled.
6. Run focused suites, then `make check`, `make test`, `make build`, isolated
   Playwright on safe ports, and the independent product verification pass.
7. Update PR #39 but do not merge or deploy.

## Dirty, generated, and untracked file disposition

- All current source, test, migration, and handoff changes are lane-owned and
  must be preserved.
- `make clean` was run after verification. `.next`, API `dist`, coverage,
  Playwright report, and `test-results` are absent.
- `.debug-journal.md` was removed as a generated lane artifact.
- No browser screenshots or build output are staged.
- The two new migration files, the new file-review model test, and this
  handoff document are intentional source/checkpoint files.

## Precise resume instructions

```bash
cd /Users/jaeyunha/wt/open-sessionboard/judge-content-files
git status --short --branch
git fetch github main
git rev-parse HEAD
git rev-parse github/main
git merge-base HEAD github/main
gh pr view 39 --repo jaeyunha/eventloom \
  --json url,state,mergeStateStatus,baseRefName,headRefName,headRefOid
```

Read this document and the linked handoff issue before editing. If
`github/main` advanced, merge it into `judge-content-files` without force and
resolve only lane-owned conflicts. Then resume in this order:

1. Add failing tests for pending-version CAS/replay and wire the partial
   repository command through service/routes/clients.
2. Add actual D1/local review rollback proofs and the all-task-state invariant.
3. Add the returned-asset replacement baseline and no-v2 submission conflict.
4. Finish safe reviewer/uploader API coverage.
5. Add attributable private download issuance/consumption.
6. Add durable outbox-backed R2 cleanup and expiry reconciliation.
7. Run:

```bash
bun run --filter @eventloom/api typecheck
bun run --filter @eventloom/web typecheck
bunx vitest run apps/api/src/features/speaker/private-asset-lifecycle.test.ts \
  apps/api/src/infrastructure/cloudflare/repositories/speaker-lifecycle.test.ts \
  apps/api/src/infrastructure/cloudflare/repositories/speaker.test.ts \
  apps/web/src/features/deliverables/file-review-model.test.ts --reporter=dot
bun run test:runtime -- --reporter=dot
make check
make test
make build
bun run test:e2e -- tests/e2e/content-collection-detail.spec.ts
```

Finally, update PR #39 and the handoff issue with the exact new base/head and
verification evidence. Do not merge or deploy.
