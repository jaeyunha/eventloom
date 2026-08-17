# Judge Speaker Email Lane Handoff

## Current Status

**REOPENED BY USER DIRECTION FOR PR #62.**

The earlier retirement text is historical. The user explicitly reopened this lane
for the staging-checkpoint verification and merge of PR #62 after integrating
current github/main. This lane remains source-only: do not deploy production.

## Repository and Git State

| Item | Current value |
| --- | --- |
| Repository | [`jaeyunha/eventloom`](https://github.com/jaeyunha/eventloom) |
| Local branch | `judge-speaker-email` |
| Worktree | `/Users/jaeyunha/wt/open-sessionboard/judge-speaker-email` |
| Pre-retirement committed HEAD | `214ea50056bd4c3ab9b02b5d37ab0bfdfc08ac4c` |
| Integrated `github/main` | `a9d0019eac57aa90503a6623011e570e22620fcf` |
| Merge base | `a9d0019eac57aa90503a6623011e570e22620fcf` |
| Remote branch before retirement push | `272b6044e9eda4c4243f0b06162168dd4eb61e28` |
| Upstream | `github/judge-speaker-email` |
| Pull request | None; intentionally not created under the retirement boundary |
| GitHub handoff issue | [#53](https://github.com/jaeyunha/eventloom/issues/53) |

`214ea500` is the local merge of exact `github/main` into the pushed checkpoint. The
retirement commit adds the final replay-security source/tests and this handoff. The
exact pushed retirement SHA is recorded in GitHub issue #53 and is the final branch
HEAD.

## Objective and Scope

SPK-13 fixes speaker bulk-email body divergence by making plaintext the canonical
organizer-controlled draft across save, exact-version preview, generated HTML, raw
multipart MIME, provider delivery, and idempotent replay.

## Coordination with PR #31 — portal-reminders

PR #31 (`judge-portal-reminders`) remains a separate reminder-scheduling lane. Its
scheduled reminder offsets, recovery, and reminder-run idempotency are not part of
SPK-13's organizer-triggered bulk speaker email flow. The shared communications
boundary must nevertheless preserve the same consistency rules: plaintext is the
canonical body, generated HTML is derived from that plaintext, and
`portal_url`/other server-owned render data cannot be supplied by a caller or
recipient snapshot. The lanes are not merge dependencies; after either lane merges,
the shared communications checks should be rerun together for staging checkpoint
confidence. No PR #31 implementation change is required by SPK-13.

In scope:

- Save dirty existing drafts before preview.
- Bind preview/send to the exact newly saved version.
- Generate escaped semantic HTML from canonical plaintext.
- Keep generated HTML read-only and omit browser-supplied HTML.
- Continue accepting legacy API `html` input while discarding its value.
- Resolve merge variables in both MIME parts with no literal output token.
- Protect the server-controlled `portal_url`.
- Preserve retry and historical invitation idempotency.
- Reject same-key/different-payload races.
- Exercise API, browser, raw-MIME, and real organizer surfaces.

Out of scope:

- Airtable repository redesign.
- Deployed OpenSend/provider verification.
- Deployment or release claims.
- Merging the PR.

### Airtable boundary evidence

Communication delivery and idempotency are D1-authoritative in the supported
Cloudflare runtime. Airtable remains an optional asynchronous projection and is
not constructed as the communications repository by runtime composition; the
`AirtableCommunicationRepository` implementation is retained for adapter
compatibility tests and migration tooling. Its legacy non-atomic
find-then-create behavior is therefore not an SPK-13 delivery path or a reason
to weaken D1's atomic same-key conflict handling. If Airtable is ever promoted
to communications authority, it requires a separate adapter-hardening lane with
an atomic idempotency claim before activation.

The speaker service also keeps verified-account role-invitation persistence before
provider delivery so a persistence failure cannot send an unusable invitation
email; the existing regression locks that invariant. Cross-request
role-invitation coordination is a separate authorization/idempotency follow-up
and is not the Airtable adapter defect or the SPK-13 canonical-body merge gate.

## Completed Implementation

### Canonical body and exact draft binding

- `apps/api/src/features/speaker/email-body.ts` converts normalized plaintext into
  escaped paragraph/line-break HTML.
- Speaker template creation/versioning ignores independent caller HTML and regenerates
  HTML from `text`.
- Event-scoped built-in welcome templates retain their fixed server-owned semantic
  `portal_url` anchor; only organizer-authored legacy templates are canonicalized at
  preview.
- The browser persists a dirty existing draft before preview and passes the exact saved
  template ID/version into preview.
- Subject/body edits invalidate stale previews.
- Browser save requests omit `html`; legacy API input remains accepted but discarded.
- Generated HTML is presented as read-only source.

### Merge and delivery integrity

- Preview and delivery use the same canonical template snapshot.
- Raw Nodemailer stream tests inspect `multipart/alternative`.
- Text and HTML MIME parts contain the same resolved current body.
- Literal `{{...}}` tokens do not reach rendered preview or raw MIME output.
- Recipient `portal_url` metadata is stripped and replaced with the authoritative
  server work-hub URL.

### Idempotency and historical replay

- Post-save-conflict recovery compares purpose, audience, template ID/version,
  recipient IDs, and render data before returning an existing send.
- A deterministic promise barrier proves one success, one 409 conflict, and exactly one
  provider request for concurrent same-key/different-payload calls.
- Historical invitation replay returns the persisted trusted send even when an
  equivalent approved welcome v2 exists.
- Replay now validates:
  - trusted welcome ID and byte-exact subject/HTML/text;
  - invitation purpose and audience;
  - exact recipient IDs;
  - send-level `portal_url` equal to the current authoritative work-hub URL;
  - absence of recipient-level `portal_url` in every persisted snapshot.
- Replay lookup now occurs before mutable current-recipient preview and pending
  role-invitation creation. A deleted current communication recipient therefore does
  not break an otherwise valid historical replay or create new invitation side effects.
- The historical regression also poisons persisted recipient render data and requires a
  409 `VERSION_CONFLICT` without another delivery.

## Final Verification Evidence

All commands below were run after integrating `github/main` and again after the final
historical-replay review fixes.

### Formatting and typechecking

| Command | Result |
| --- | --- |
| `git diff --check` | PASS |
| Biome on all changed SPK-13 TypeScript/TSX files | PASS |
| `bun run --filter @eventloom/api typecheck` | PASS |
| `bun run --filter @eventloom/web typecheck` | PASS |
| `make check` | PASS |

Raw final log: `/tmp/spk13-final-check.log`.

### Focused behavior

```bash
bunx vitest run \
  apps/api/src/features/communications/service.test.ts \
  apps/api/src/features/speaker/email-body.test.ts \
  apps/api/src/features/speaker/communications.test.ts \
  apps/api/src/features/speaker/speaker.test.ts \
  scripts/dev/mailpit-opensend-bridge.test.ts \
  --maxWorkers=1 \
  -t 'rejects a concurrent same-key send|generates escaped HTML paragraphs|persists versions, exact previews|replays one canonical invitation|persists logistics, exposes reminder eligibility|generates multipart MIME'
```

Result: **5 files passed, 6 selected tests passed, 107 skipped by filter**.

The historical replay test was run red before both final fixes:

1. Poisoned persisted recipient `portal_url` was incorrectly accepted.
2. Deleting the current communication recipient caused replay preflight to fail.

After the minimal implementation changes, the same regression passes while still
rejecting a different recipient under the reused key.

Raw final log: `/tmp/spk13-final-focused.log`.

### Exact repository gates

| Command | Result |
| --- | --- |
| `make check` | PASS |
| `make test` | PASS |
| `make build` | PASS |

Final logs:

- `/tmp/spk13-final-check.log`
- `/tmp/spk13-final-test.log`
- `/tmp/spk13-final-build.log`

### Affected Playwright

```bash
node scripts/run-isolated-playwright.mjs \
  tests/e2e/speaker-email-current-draft.spec.ts \
  tests/e2e/speaker-portal-redesign-qa.spec.ts
```

Result: **4/4 passed** on dynamically allocated non-reserved ports.

Raw final log: `/tmp/spk13-final-playwright.log`.

### Real organizer-surface QA

Observed through the actual isolated local browser surface:

- Selected one speaker.
- Saved template v1.
- Edited the existing draft to v2 without manually saving again.
- Preview auto-saved and returned exact template version 2.
- Server-rendered text and escaped HTML contained the same current body.
- Rendered output contained no literal merge token.
- HTML source had `readonly`.
- Confirmed send returned version 2 and status `sent`.
- UI reported `Speaker email sent for 1 recipient.`

Screenshot:

- Local path: `qa-artifacts/speaker-email-final-candidate.png`
- SHA-256:
  `d845e461d73ad7e3a14dc5e952f8f694de365f0ac5248b356a7f7cb5f2f2892d`
- Dimensions: `1102 × 714`
- Capture command result: 1/1 isolated Playwright test passed on ports
  `58870–58872`
- Raw capture log: `/tmp/spk13-final-screenshot.log`

The corrected artifact is a bounded screenshot of the complete `Speaker email` card:
the **HTML source** tab is visibly active, the HTML field is shown, the preview repeats
exact template version 2, resolved text/HTML agree, the full heading/instructions and
action footer are visible, and no viewport edge clips the component.

The screenshot is local evidence and must be attached to the final GitHub PR without
committing the PNG.

## Review Findings

### Resolved final-review blockers

- Rejected historical replay when persisted recipient data contains a protected
  `portal_url`.
- Required the persisted send-level `portal_url` to match the current authoritative
  work-hub URL.
- Moved replay detection ahead of mutable recipient preview and pending role-invitation
  creation.
- Added regressions for poisoned historical render data and deleted current recipients.
- Replaced the clipped/incoherent screenshot with a complete coherent component capture.
- Re-ran focused tests, exact gates, affected Playwright, and screenshot QA afterward.
- Both visual review lanes passed the corrected screenshot with no blocker.

The remaining five-lane reviewers were cancelled when the user retired the lane. Their
earlier findings drove the replay-security fixes above, but a final consolidated PASS
was intentionally not pursued after the retirement directive.

### Residual limitations

- The deterministic same-key race test uses the in-memory repository; there is no
  deterministic concurrent D1 integration test for the exact recovery branch.
- MIME evidence uses local Nodemailer stream transport, not deployed OpenSend delivery.
- Local browser evidence is not deployed-provider or release evidence.
- `speakerEmailHtmlFromText` preserves semantic body content but trims line edges and
  does not preserve preformatted indentation.
- Generic non-speaker communication templates continue to permit independent HTML by
  design; the canonical-plaintext guarantee belongs to the speaker facade.

### Pre-existing out-of-scope Airtable findings

These findings are unchanged outside the SPK-13 diff and require a separate lane:

- Participant lookup can be scoped by event ID without an explicit tenant check before
  recipient conversion.
- Send idempotency uses a non-atomic read-before-create sequence and can permit duplicate
  creates under concurrency.

D1 remains the authoritative supported product path.

## Generated and Local Files

- `.debug-journal.md` remains untracked and must not be committed unless repository
  policy explicitly changes.
- `qa-artifacts/speaker-email-final-candidate.png` is ignored local evidence. Attach it
  to the PR, then remove it.
- Build, Next, Wrangler, coverage, Playwright report, test-result, and TypeScript
  build-info artifacts were cleaned after final verification.

## Retirement Completion Record

- Replay-security regression and implementation corrections are included in the
  retirement checkpoint.
- Focused tests, typechecks, `make check`, `make test`, affected Playwright, and
  `make build` passed after those corrections.
- Corrected visual evidence passed both visual review lanes.
- Generated QA/browser/build artifacts are removed before the retirement commit.
- `.debug-journal.md` remains intentionally untracked.
- GitHub issue #53 is the durable detailed retirement record.
- No PR was opened.
- No merge to `main` or deployment occurred.

There are no active lane tasks. The branch and worktree are safe for the operator to
archive or remove after verifying the pushed SHA and issue.
