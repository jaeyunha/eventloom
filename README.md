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

## Evidence

The visual and product evidence used to derive the implementation is preserved under [`evidence/`](evidence/). `evidence/manifest.json` explains provenance and intended use. Sessionboard remains the visual reference, not a source-code dependency.

## Local development

Prerequisites: Bun, a Cloudflare account, an Airtable base, and an OpenSend API key.

```bash
bun install
cp .env.example .env
bun run dev
```

The web application runs on port `3015`. The API worker is developed and deployed separately.

## Quality gates

```bash
make check
make test
make test-e2e
make all
```

Interaction acceptance is verified with Ever and the `codex-cua` skill against the running application. Tests must not be weakened to obtain a passing build.

## Deployment credentials

The implementation expects scoped credentials for Cloudflare, Airtable, OpenSend, Google OAuth, Microsoft OAuth, and Accelevents. Calendar delivery uses standards-based ICS messages and does not require Google or Microsoft Calendar OAuth.

## License

AGPL-3.0-or-later.
