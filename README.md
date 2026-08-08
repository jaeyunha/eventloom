# Open Sessionboard

Open Sessionboard is an open-source, program-side alternative to Sessionboard for conference teams. It focuses on the workflow from call-for-proposals through speaker operations, review, scheduling, publication, and integrations.

## Scope

- Configurable CFP forms with drafts, co-speakers, validation, and review
- Speaker portal with submissions, profile, acceptance state, and post-acceptance tasks
- Committee assignment, rubric scoring, comments, conflicts, and human-authoritative decisions
- Conflict-safe, versioned agenda scheduling and public speaker/agenda embeds
- Transactional email and RFC 5545 calendar invitations
- Public API, signed webhooks, and controlled Accelevents publication
- Cloudflare deployment with Airtable as the authoritative program data store

CRM, marketing automation, payments, sponsorship/exhibitor management, transcription, and multilingual workflows are intentionally out of scope.

## Architecture

- **Web:** Next.js and TypeScript
- **API:** Hono on Cloudflare Workers
- **Business data:** Airtable
- **Application state:** Cloudflare D1 and Durable Objects
- **Files and jobs:** R2 and Cloudflare Queues
- **Authentication:** Better Auth with magic links plus optional Google and Microsoft OAuth
- **Email:** OpenSend using `foreverbrowsing.com` sender addresses
- **Repository:** Forge, private during development and public for submission

See [`ARCHITECTURE.md`](ARCHITECTURE.md), [`prd.json`](prd.json), and [`spec/open-sessionboard.md`](spec/open-sessionboard.md) for the governing design and requirements.

## Documentation

- [Environment and provider setup](docs/setup.md) — isolated Cloudflare, Airtable, OpenSend, OAuth, and Accelevents configuration
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

Local, staging, and production must use separate Airtable bases, D1 databases, R2 buckets, Queues, secrets, API keys, OAuth applications, and integration credentials. Verify those boundaries from provider inventories before release. Staging must contain synthetic data and use suppressed/sandboxed email recipients and an Accelevents sandbox event. See [the setup guide](docs/setup.md); do not share production data or credentials with another environment.

## Quality gates

```bash
make check
make test
make test-e2e
make all
```

Interaction acceptance is verified with Ever and the `codex-cua` skill against the running application. Tests must not be weakened to obtain a passing build.

Release candidates also run `make build`; `make all` covers checks and tests but does not build deployables.

Release QA runs the complete authenticated, seeded workflow rather than only smoke navigation. It includes CFP/draft/submission, speaker ownership, multi-round human-authoritative review, agenda conflict/publish/rollback, accessible embeds, API/webhooks, calendar updates, and controlled Accelevents preview/confirm.

## API contract

API clients use organization-scoped bearer keys with least-privilege read/write scopes. Collections use stable cursor pagination. Generic resource mutations require `Idempotency-Key`; generic updates also require the current version in `If-Match`. Webhook-subscription administration has its own contract. Stable trace-bearing errors never expose provider or storage details. Public embeds and feeds are separate immutable projections and never expose draft or private fields.

Read [the API guide](docs/api.md) and use the checked-in [OpenAPI 3.1 contract](openapi/openapi.yaml) for client generation and request semantics. A configured environment's `/api/v1/openapi.json` confirms mounted adapters only; its path keys are relative to the `/api/v1` mount and are not a client-generation contract.

## Deployment credentials

The implementation expects scoped credentials for Cloudflare, Airtable, OpenSend, Google OAuth, Microsoft OAuth, and Accelevents. Calendar delivery uses standards-based ICS messages and does not require Google or Microsoft Calendar OAuth.

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
