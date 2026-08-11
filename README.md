# Open Sessionboard

Open Sessionboard is an open-source project for the program-side Sessionboard workflow. Its target users are nontechnical event-production professionals who need a clear path from call-for-proposals through speaker operations, review, scheduling, publication, and integrations. This README describes the target scope; `prd.json` is the source of build and QA status, and the scope bullets do not claim that unbuilt work is complete.

## Target scope

- **Organizer control plane:** First-party event/session settings, rooms, tracks, statuses, agenda eligibility, and dynamic CFP forms with custom fields, conditional logic, validation, and file requests; tenant-reusable fields are versioned with visible impact.
- **Participant portal:** Authorized multi-event portal switcher; autosave/resume and pre-close submission editing; audited reopen; co-speaker management; session files with type requests, immutable history, comments, and authorized downloads; validated form tasks; published wiki/resources.
- **Evaluation and decisions:** Evaluation-plan authoring, evaluator-visible field/file projections, locked/versioned rubrics, blind review, comments, reproducible scores, and human accept/waitlist/reject decisions.
- **Communications:** Versioned OpenSend templates for account verification, confirmations, reminders, decisions, tasks, and schedule lifecycle, plus event-scoped recipient-group email with preview, snapshots, delivery state, and send history.
- **Reports and exports:** Program-only saved report definitions/runs and audited CSV/XLSX output, including individual and cumulative grade exports for a selected evaluation-plan version.
- **Scheduling and distribution:** Conflict-safe, versioned agenda scheduling across rooms/tracks with public speaker and agenda embeds, API, webhooks, and RFC 5545 calendar delivery.
- **Advisory AI:** Human-applied evaluation suggestions, private agenda proposals, and content-remix candidates for program text. AI never independently scores, decides, schedules, publishes, sends, exports, or overwrites source content.
- **Verified identity:** Reauthenticated, verified email/profile identity changes that preserve event grants by stable account identity.

CRM, marketing automation, SMS, payment, multilingual workflows, Microsoft OAuth, and Accelevents are intentionally out of scope. Sponsorship/exhibitor management, transcription/media AI, and unrelated AI insights are also excluded.

## Evidence basis

The target workflows are grounded in the cited Sessionboard pages: [overview and capability index](https://learn.sessionboard.com/get-started/overview), [forms and fields](https://learn.sessionboard.com/sessions/submission-forms), [participant portal workflows](https://learn.sessionboard.com/participants/overview), [evaluation plans](https://learn.sessionboard.com/evaluations/evaluation-plans), [reports](https://learn.sessionboard.com/videos/video-reports), [AI agenda](https://learn.sessionboard.com/videos/video-ai-agenda-builder), and [AI content remix](https://learn.sessionboard.com/videos/video-ai-content-remix).

## Architecture

- **Web:** Next.js and TypeScript
- **API:** Hono on Cloudflare Workers
- **Business data:** Airtable
- **Application state:** Cloudflare D1 and Durable Objects
- **Files and jobs:** R2 and Cloudflare Queues
- **Authentication:** Better Auth with verified email, password, and email magic-link sign-in
- **Email:** OpenSend using `foreverbrowsing.com` sender addresses
- **Repository:** Forge, private during development and public for submission

See [`ARCHITECTURE.md`](ARCHITECTURE.md), [`prd.json`](prd.json), and [`spec/open-sessionboard.md`](spec/open-sessionboard.md) for the governing design and requirements.

## Documentation

- [Environment and provider setup](docs/setup.md) — isolated Cloudflare, Airtable, OpenSend, and authentication configuration
- [Public API and webhooks](docs/api.md) — authentication, scopes, pagination, idempotency, concurrency, errors, and signatures
- [OpenAPI 3.1 contract](openapi/openapi.yaml) — checked-in stable API contract; deployed Workers expose their enabled resource contract at `/api/v1/openapi.json`
- [Calendar semantics](docs/calendar-semantics.md) — IANA timezone, DST, RFC 5545, UID, sequence, update, cancellation, and retry rules
- [Browser and accessibility QA](docs/qa-runbook.md) — seeded Playwright, Ever, and `codex-cua` acceptance evidence
- [Release and submission runbook](docs/release-runbook.md) — deployment evidence, private-to-public Forge gate, and competition checklist
- [Deployment readiness preflight](docs/deployment-readiness.md) — sanitized provider, isolation, Cloudflare scope/resource, and Forge privacy checks

## Evidence

The visual and product evidence used to derive the implementation is preserved under [`evidence/`](evidence/). `evidence/manifest.json` explains provenance and intended use. Sessionboard remains the visual reference, not a source-code dependency.

## Local development

Prerequisites: Bun, a Cloudflare account, an Airtable base, and an OpenSend API key.

```bash
bun install
cp .env.example .env
bun run dev
```

The Next.js web application runs on port `3015`; the standalone Hono Worker runs on port `8787`. Their liveness endpoints are `http://localhost:3015/health` and `http://localhost:8787/api/health`. Each deployable validates only its own environment boundary and returns a structured `503` when required configuration is invalid.

## Environment isolation

Local, staging, and production must use separate Airtable bases, D1 databases, R2 buckets, Queues, secrets, API keys, and OpenSend credentials. Verify those boundaries from provider inventories before release. Staging must contain synthetic data and use suppressed or sandboxed email recipients. See [the setup guide](docs/setup.md); do not share production data or credentials with another environment.

## Quality gates

```bash
make check
make test
make test-e2e
make all
```

Interaction acceptance is verified with Ever and the `codex-cua` skill against the running application. Tests must not be weakened to obtain a passing build.

Release candidates also run `make build`; `make all` covers checks and tests but does not build deployables.

Release QA runs the complete authenticated, seeded workflow rather than only smoke navigation. It includes CFP/draft/submission, speaker ownership, multi-round human-authoritative review, agenda conflict/publish/rollback, accessible embeds, API/webhooks, calendar updates, and representative organizer-task usability validation with nontechnical event-production professionals, proving tasks are understandable without code or CLI knowledge.

## API contract

API clients use organization-scoped bearer keys with least-privilege read/write scopes. Collections use stable cursor pagination. Generic resource mutations require `Idempotency-Key`; generic updates also require the current version in `If-Match`. Webhook-subscription administration has its own contract. Stable trace-bearing errors never expose provider or storage details. Public embeds and feeds are separate immutable projections and never expose draft or private fields.

Read [the API guide](docs/api.md) and use the checked-in [OpenAPI 3.1 contract](openapi/openapi.yaml) for client generation and request semantics. A configured environment's `/api/v1/openapi.json` confirms mounted adapters only; its path keys are relative to the `/api/v1` mount and are not a client-generation contract.

## Deployment credentials

The implementation expects scoped credentials for Cloudflare, Airtable, and OpenSend. Interactive authentication uses verified email/password and email magic links; social OAuth providers and Accelevents are intentionally not part of this build. Calendar delivery uses provider-neutral RFC 5545 REQUEST/UPDATE/CANCEL messages through OpenSend, including room/video details when present; it does not require calendar-provider OAuth.

Run the read-only release preflight against separate ignored local, staging, and production environment files before deployment. It checks required provider configuration, rejects shared credentials/resources, inspects the Cloudflare deployment token for the account-restricted Workers Scripts, D1, R2, and Queues Edit permissions, reads the declared Cloudflare resources, and confirms Forge is still private. It never deploys, migrates, or changes repository visibility.

```bash
node scripts/release/preflight.mjs --help
node --test scripts/release/preflight.test.mjs
```

See [Deployment readiness preflight](docs/deployment-readiness.md). Cloudflare **D1 Edit** is mandatory because the guarded deployment applies D1 migrations; successful read access alone is not sufficient.

## Deployment and release

The guarded Cloudflare scripts validate isolated bindings, reject placeholder D1 IDs for deployment, apply D1 migrations, and deploy the API Worker. The frontend remains a separate deployment and receives only public application/API URLs. No deployment is implied by this repository state.

Forge must remain private throughout development and deployment verification. It becomes public only after automated gates, the seeded end-to-end workflow, Ever, `codex-cua`, accessibility, security, performance, production smoke checks, and submission assets all pass against the same clean release commit. Follow the [release runbook](docs/release-runbook.md); an unchecked gate is a no-go.

## License

AGPL-3.0-or-later.
