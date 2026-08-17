# Product evaluation loop handoff

## Checkpoint purpose

This branch is an unmerged product-readiness checkpoint combining:

1. Routable, focused organization-integration destinations.
2. Concurrent-worktree isolation for local services and Playwright.

- Branch: `product-evaluation-loop`
- Discovery head: `681a8eb3127f`
- Checkpoint type: preserved work in progress; not release evidence

## Implemented scope

### Organization integrations

- Replaces hash-based integration navigation with stable routes for the
  overview, Airtable, API keys, and event bindings.
- Loads only the selected integration destination and exposes active-route
  semantics with `aria-current`.
- Adds focused destination headers, responsive navigation, and embedded
  Airtable rendering without duplicate page chrome.
- Associates the Airtable disconnect confirmation label with its field.

Important paths:

- `apps/web/src/app/admin/organizations/[organizationId]/integrations/`
- `apps/web/src/features/integrations/organization-integrations-workspace.tsx`
- `apps/web/src/features/integrations/organization-integrations-workspace.module.css`
- `apps/web/src/features/integrations/airtable/airtable-integration.tsx`

### Concurrent local environment isolation

- Adds configurable web, API, inspector, Mailpit, and OpenSend ports.
- Adds configurable Wrangler persistence and isolated fixture persistence.
- Allows loopback and `*.localhost` development origins.
- Adds Node launchers for local services and Playwright with explicit
  environment boundaries.
- Adds launcher/configuration tests and a dedicated environment-isolation E2E
  scenario.
- Documents a complete concurrent-worktree setup.

Important paths:

- `scripts/dev/run-local-service.ts`
- `scripts/dev/run-playwright.ts`
- `scripts/dev/playwright-config.test.ts`
- `scripts/dev/mailpit-opensend-bridge.ts`
- `playwright.config.ts`
- `tests/e2e/environment-isolation.spec.ts`
- `docs/setup.md`

## Verification captured at retirement

- `git diff --check` passed during the retirement audit.
- The Mailpit/OpenSend bridge suite passed 6 tests under Bun.
- Three affected Vitest files passed 69 tests:
  - Organization integrations workspace
  - Airtable integration UI
  - API runtime composition
- Historical agent logs claim 29 integration tests, `make check`, a production
  web build, browser captures, TypeScript, and LSP passed.

Those historical claims were not rerun against this exact uncommitted diff and
must not be treated as current release evidence. The launcher-specific script
tests, full repository gates, build, and isolated Playwright scenario remain
unverified at this checkpoint.

## Known risks and unfinished work

1. The checkpoint combines UI routing/styling with local runtime and Playwright
   infrastructure; decide whether to split those concerns before delivery.
2. Confirm `.env` precedence versus `--no-env-file` for fixture services and CI.
3. Verify cookie behavior for loopback addresses and documented
   `*.localhost` hostnames.
4. Validate clean startup without relying on existing Wrangler or Next.js
   runtime state.
5. Run the focused launcher, integration, Airtable, and runtime-composition
   tests.
6. Run `make check`, the relevant build, and the isolated
   `environment-isolation.spec.ts` workflow.
7. Exercise all four integration routes through the real web app at desktop and
   mobile widths.

## Resume procedure

1. Recreate a worktree from `product-evaluation-loop`.
2. Re-read this handoff and the corresponding GitHub handoff issue.
3. Review overlap with current `main`, especially integrations, Cloudflare
   runtime composition, Playwright configuration, and development scripts.
4. Decide whether to split the checkpoint into UI and local-runtime delivery
   branches.
5. Run the exact validation and manual QA listed above before opening or merging
   delivery PRs.

Ignored Wrangler, Next.js, Playwright, OMO, and local environment state is not
part of this checkpoint.
