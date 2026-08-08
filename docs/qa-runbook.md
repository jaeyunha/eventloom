# Browser interaction and accessibility QA

Automated tests are necessary but not sufficient. Release acceptance requires a real browser pass with both Ever and the `codex-cua` skill against a deterministic seeded event. This runbook does not claim that a pass has occurred; every run needs dated evidence tied to a commit and environment.

## Preconditions

1. Use local or isolated staging, never production participant data.
2. Seed one synthetic organization/event with organizer, reviewer, submitter, participant, and API-client identities.
3. Include a conditional CFP field, multiple participants, at least two review rounds, one accepted session, a room conflict, a participant conflict, a warning that can be overridden, speaker tasks/files, a published revision, a webhook receiver, and an Accelevents sandbox preview.
4. Use test inboxes and sandbox/suppressed OpenSend delivery.
5. Start the web and API independently with `make dev`; verify `/health` and `/api/health` before browser work.
6. Run the relevant automated tests first. A browser pass never excuses a failing assertion.
7. Create an evidence directory outside the repository (for example `/tmp/open-sessionboard-qa/<commit>-<utc-time>`). Do not commit browser profiles, recordings, private payloads, magic links, API keys, or screenshots containing secrets.

Record before the run:

- Git commit SHA and dirty/clean state
- `APP_ENV` and exact web/API origins
- seed fixture/version
- browser name/version and viewport
- Ever version/session ID
- CUA bridge status and exact target app
- operator and UTC start time

## Required walkthrough

Exercise every state below with visible assertions, not just successful navigation.

### CFP and account

- Open the public CFP welcome state.
- Complete account/verified-email fixture access without skipping authentication.
- Use keyboard-only navigation through Welcome → Account → Submission → Participant → Review.
- Trigger and read required-field errors; confirm focus moves to or is announced for the invalid control.
- Show/hide a conditional field and prove its value/requiredness follows the rule.
- Save, reload, and resume a draft.
- Add a second participant and secondary contact; verify limits and duplicate/invalid email feedback.
- Submit once, retry the final action, and prove only one submitted version exists.
- Confirm success content and portal redirect.

### Speaker portal

- Confirm the speaker sees only their authorized submissions, profiles, tasks, and assets.
- Edit biography and upload through the authorized flow.
- Exercise task dependency/state feedback, including a blocked transition and a valid submission.
- Verify acceptance-gated content is absent for an unaccepted fixture.
- Attempt a cross-user/cross-event URL and capture the safe denial without private data.
- Confirm private responses are not browser-cacheable and signed asset links expire.

### Organizer and reviewer

- Configure event/CFP settings and preview conditional routing.
- Filter/sort the submissions table and open a detail view without losing context.
- Assign a multi-round review plan.
- Complete a rubric with autosave, keyboard controls, comments, and a conflict-of-interest abstention.
- Show AI-prefilled assistance as uncounted until a human confirms or edits it.
- Verify blind-review fields remain hidden.
- Make a human decision and prove no AI action can accept/reject by itself.
- Confirm progress and decision state update without exposing another tenant.

### Agenda, publication, and embeds

- Open list/day/week/month/rooms views and retain the event timezone.
- Drag an accepted session into a room/time slot with CUA.
- Trigger same-room and same-participant hard conflicts and prove publication remains blocked.
- Trigger a warning, enter an auditable override reason, and preview the exact diff.
- Test a DST-invalid time and an ambiguous time requiring earlier/later disambiguation.
- Publish one immutable revision, then prove public views do not show later draft edits.
- Verify speaker gallery and agenda/itinerary embeds in iframe and script modes.
- Check narrow and wide viewports, safe theme controls, JSON/iCal links, empty/loading/error states, and keyboard/screen-reader navigation.
- Roll back to a prior revision and verify corrective public/calendar/integration state.

### Integrations and failures

- Inspect Accelevents mapped speakers/sessions, changed fields, and validation errors before confirmation.
- Prove no outbound write occurs without explicit confirmation of the exact snapshot.
- Exercise a sandbox failure/retry/reconciliation without changing Airtable source records.
- Create/rotate a webhook secret and verify the full secret is never shown in a response/status view.
- Verify a signed delivery, a bad signature rejection at the receiver, and delivery retry visibility.
- Inspect OpenSend/calendar status using redacted identifiers; verify one calendar event updates/cancels without duplication.
- Exercise API 400/401/403/404/409/412/429/500-style safe envelopes where deterministic fixtures exist.
- Disable or misconfigure one optional integration and verify the product reports an actionable unavailable state without leaking configuration.

## Ever pass

Check the Ever installation and active sessions:

```bash
ever doctor
ever status --json
```

Use focused tasks rather than one unbounded prompt. Keep the default guarded filesystem/shell policy and identify the exact environment, seed, starting URL, account role, expected observations, and evidence directory in each task.

```bash
ever run --permission-mode guard \
  "Against the already running isolated staging app at https://<web-host>, use the seeded organizer account already authenticated in the browser. Exercise the CFP configuration and submission-review path in docs/qa-runbook.md. Do not change source files or use production services. Report each assertion, failure, final URL, and screenshot path."
```

Run separate durable sessions for CFP/portal, review, agenda/publication, embeds/accessibility, and integration failures. Continue only when the next task is deliberately part of the same stateful walkthrough:

```bash
ever run --continue <session-id> \
  "Continue with the agenda conflict, publish, rollback, and public embed assertions from docs/qa-runbook.md."
```

For every Ever result, retain the session ID, task text, observed URLs, pass/fail assertions, and redacted screenshot paths. A narrative claim without browser state or an observable assertion is not evidence.

## `codex-cua` pass

Invoke the `codex-cua` skill in the GJC session used for exact GUI acceptance. The command-line bridge must be healthy:

```bash
cua status
cua apps
```

Choose the exact browser instance returned by `cua apps`. Use that same `<app>` identifier for every command; do not rely on whichever application is globally foreground. Start/activate and capture a full accessibility tree plus screenshot:

```bash
cua start <app>
cua state --full --shot /tmp/open-sessionboard-qa/<run>/landing.png <app>
```

Interact through visible or accessibility-tree evidence:

```bash
cua click --element <index> <app>
cua type <app> 'literal synthetic text'
cua key <app> 'Tab'
cua key <app> 'Shift+Tab'
cua key <app> 'Return'
cua scroll --pages 1 <app> <element-index> down
cua drag <app> <from-x> <from-y> <to-x> <to-y>
cua state --shot /tmp/open-sessionboard-qa/<run>/after-action.png <app>
```

Re-read `cua state` after navigation, dialogs, re-rendered lists, scrolling, and drag/drop; prior element indexes may be stale. Prefer element-index interaction for controls and coordinates only when validating spatial behavior such as scheduling drag/drop. Record both pre- and post-action states.

The CUA pass must include:

- tab order, visible focus, skip/navigation landmarks, Enter/Space activation, Escape dismissal, and focus return
- form labels, descriptions, validation relationships, status/live announcements, and no keyboard traps
- dialog names/focus containment
- table/list semantics and accessible sort state
- drag/drop with a keyboard-accessible alternative
- text zoom/reflow and narrow viewport behavior
- contrast and non-color status cues
- loading, empty, validation, forbidden, conflict, integration-failure, and retry states
- exact screenshots for CFP completion, reviewer confirmation, conflict-blocked agenda, publication, and both embeds

Never type real credentials with `cua type`; authenticate through the approved synthetic fixture or pre-authenticated isolated browser profile.

## Automated accessibility support

Run the Playwright suite's axe WCAG 2.1 AA scans and keyboard scenarios against the same build:

```bash
make test-e2e
```

Browser QA must investigate, not waive, any automated violation. Also inspect dynamic states axe may miss: focus order after conditional fields, autosave announcements, drag/drop alternatives, publication dialogs, iframe titles, and errors after network failures.

## Evidence and disposition

Create a result row for every walkthrough area:

| Field | Required value |
| --- | --- |
| Area/scenario | Exact action and state |
| Commit/environment | SHA, `APP_ENV`, web/API origins |
| Tool | Playwright, Ever session ID, or CUA target app |
| Evidence | Redacted screenshot/state/report path |
| Expected | Observable acceptance criterion |
| Observed | Concrete result |
| Status | Pass, fail, or blocked |
| Defect | Issue/reference for any non-pass |

A release QA pass requires all mandatory scenarios to pass on the release commit. Re-run affected scenarios after fixes. Never mark a stale earlier-commit screenshot as evidence for the release commit, and never weaken a test or assertion to convert a failure into a pass.
