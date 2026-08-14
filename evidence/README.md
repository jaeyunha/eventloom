# Evidence index

This directory contains several evidence classes. None is release evidence
merely because it is tracked.

## Authority

- Product scope and current status: [`../spec/eventloom.md`](../spec/eventloom.md)
- System boundaries: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- Evaluator history: [`../docs/llm-judge-runs.md`](../docs/llm-judge-runs.md)
- Release evidence rules: [`../docs/qa-runbook.md`](../docs/qa-runbook.md) and
  [`../docs/release-runbook.md`](../docs/release-runbook.md)

The authoritative competition reference is the ignored, read-only
`Kill-My-SaaS-Competition-Brief/` directory when it is available in the
canonical workspace. The tracked PDF and extracted images are historical
snapshots, not the product truth source.

## Retained evidence classes

- `d1-airtable/`: redacted migration, cutover, and provider observations.
- `qa/`: local screenshots and local UI diagnostics. These do not prove a
  deployed environment.
- `cfp/` and `pdf/`: historical product-discovery imagery.
- `sources/`: historical source snapshots that require rights and privacy
  review before public release.
- `manifest.json`: machine-readable inventory of the historical source and
  reference-image set.

Raw chat exports, agent transcripts, credentials, browser profiles, private
provider payloads, and generated release artifacts do not belong here. Store
temporary or private evidence outside the repository and retain only redacted
references required by the applicable runbook.

Deleting an artifact from the current tree does not remove it from Git history.
Follow [`../docs/public-release.md`](../docs/public-release.md) before changing
repository visibility.
