# Contributing to Eventloom

Thank you for considering a contribution to Eventloom.

Eventloom is a source-available event-program workspace licensed under the
Elastic License 2.0. Contributions should improve the supported product while
preserving its tenant-safety, human-authoritative workflows, and operational
boundaries.

## Before you start

For small documentation corrections, focused bug fixes, and narrowly scoped
improvements, you may open a pull request directly.

Before implementing a larger feature, architecture change, schema change, or
new integration, open an issue describing:

- the user problem;
- the affected workflow;
- the proposed behavior;
- the relevant system and authorization boundaries; and
- observable acceptance criteria.

This gives maintainers an opportunity to confirm that the change belongs in
the supported product scope before substantial implementation work begins.

## Understand the project boundaries

Read the following documents before making a substantive change:

- [`spec/eventloom.md`](spec/eventloom.md) — supported product scope and status
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system boundaries and state ownership
- [`docs/setup.md`](docs/setup.md) — local setup and environment isolation
- [`AGENTS.md`](AGENTS.md) — repository development and verification rules

Important boundaries include:

- Cloudflare D1 is authoritative for product and operational state.
- Browser code must not contain provider credentials or access backend storage
  directly.
- Authorization is derived from authenticated server-side grants, never from a
  URL or client-provided identifier alone.
- AI output is advisory. It cannot independently change scores, decisions,
  schedules, messages, exports, or public projections.
- The built-in Speaker CRM is supported first-party functionality.
- Accelevents, social OAuth, direct calendar-provider APIs, ticketing, payments,
  and general marketing automation are outside the current supported scope.

## Local development

Follow [`docs/setup.md`](docs/setup.md) for prerequisites and environment
configuration.

Common commands are:

```bash
make dev
make check
make test
make test-e2e
make build
make all
```

Use isolated local resources and synthetic data. Never copy production or
staging credentials, records, provider payloads, or private files into a local
environment or contribution.

## Development expectations

Keep contributions focused and preserve unrelated work.

For behavioral changes:

- add tests that fail without the intended behavior;
- test observable values and state transitions rather than prose;
- preserve tenant, event, role, and authorization boundaries;
- avoid timing-dependent or flaky tests;
- update contracts and documentation when behavior changes; and
- use the real domain workflow rather than bypassing invariants with direct
  database fixtures.

Do not weaken, skip, or delete a failing test to make a contribution pass.

AI-assisted contributions are welcome, but contributors remain responsible for
understanding, reviewing, testing, and licensing everything they submit. Do not
commit generated transcripts, private prompts, credentials, or copied material
whose redistribution rights are unclear.

## Pull requests

A pull request should include:

1. The user problem or defect being addressed.
2. A concise description of the resulting behavior.
3. The important implementation and security boundaries.
4. Tests and validation commands that were run.
5. Screenshots for user-interface changes.
6. Migration or compatibility notes where applicable.
7. Known limitations or checks that could not be performed.

Keep local, mocked, staging, provider, and production evidence clearly
separated. A local test or configured provider does not establish deployed
release verification.

Maintainers may ask for a pull request to be reduced or split when it combines
unrelated changes.

## Contribution licensing

Eventloom is licensed under the
[Elastic License 2.0](LICENSE). It is source-available and is not distributed
under an OSI-approved open-source license.

By submitting a contribution, you represent that you have the right to submit
the work and agree that the contribution may be distributed under the Elastic
License 2.0 on the same terms as the rest of the project.

Do not submit third-party code, assets, fonts, screenshots, or generated
material unless its license and redistribution terms are compatible with the
project.

## Security reports

Do not publicly disclose a suspected security vulnerability in an issue or pull
request. If GitHub provides a **Report a vulnerability** action for the
repository, use it. Otherwise, open an issue containing no vulnerability
details and ask the maintainers to establish a private reporting channel.

## Conduct

Be respectful, specific, and focused on the work. Critique implementations and
decisions rather than contributors.
