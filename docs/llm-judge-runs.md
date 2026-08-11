# LLM judge run history

This file is the historical evidence ledger for Open Sessionboard evaluator runs. It stores no credentials, magic links, API keys, browser session state, or private payloads. Evaluator artifacts remain outside the repository under `/tmp`. A ledger entry records evidence and limitations; it never upgrades source-present or partial behavior to release verification.

## Evidence and source hierarchy

The governing hierarchy is the one in [`spec/open-sessionboard.md`](../spec/open-sessionboard.md):

1. Executable code, configuration, and observed deployment define current behavior.
2. The product contract defines supported scope and status vocabulary.
3. [`ARCHITECTURE.md`](../ARCHITECTURE.md) defines system boundaries and state ownership.
4. Operational documents define executable setup, QA, deployment, and release procedures.
5. This file records evaluator evidence, run validity, and limitations.
6. Cited product evidence and focused research explain intended workflows but cannot prove release behavior.

The built-in Speaker CRM is supported first-party scope and is included in evaluator interpretation. Accelevents is a separate external event platform, outside the competition brief/evaluator requirements and unsupported by the runtime; no Accelevents run or credential is required.

## 2026-08-10 — latest usable diagnostic run

- Status: incomplete diagnostic; not release evidence
- Evaluator checkout: `/tmp/killmysaas-evals-current`
- Run directory: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33`
- Machine-readable report: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33/report.json`
- Human-readable report: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33/report.html`
- Execution log: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33/run.log`
- Manual checklist: `/tmp/killmysaas-evals-current/runs/2026-08-10T21-35-33/manual-checklist.md`

| Area | Score | Coverage |
|---|---:|---:|
| Call for Papers | 65.6% | 84.2% |
| Abstract Management | 46.4% | 100% |
| Speaker Management | 41.1% | 84.8% |
| Content Management | 32.8% | 93.5% |
| AI Agenda | 31.3% | 88.9% |
| Public Widgets | 87.1% | 100% |
| Speaker CRM | Not completed | Not completed |

The partial report records **54.0% overall** and **92.5% coverage across completed areas**. The process timed out during `CRM-S2`, so this is not a final overall result. It also ran against dirty pre-fix production workflow state. Do not use it as a release score or compare it as a complete submission result.

## 2026-08-10 — judge-provider incident

- Status: invalid as product-scoring evidence
- Run directory: `/tmp/killmysaas-evals-updated/runs/2026-08-10T13-46-51`

The judge provider returned an HTTP 520 response with Cloudflare HTML during judging. This is retained for incident diagnosis only, not as an Open Sessionboard product score. Its report may change if stored evidence is later rescored, so any future rescore must be recorded as a separate entry with the rescore time and provider status.

## Current release status

No complete post-reset, post-deployment LLM judge run has been accepted. No area is release-verified. A release-valid evaluator run must:

1. Start from the scoped clean production workflow state for `ai-engineer / devflow-conf-2027`.
2. Complete every evaluator area in order, including the supported Speaker CRM area.
3. Finish without timeout, provider failure, or `scoreWithheld`.
4. Preserve the full scenario evidence directories and `run.log`.
5. Complete the manual checklist for real email delivery, calendar behavior, exports, and cross-persona effects that browser automation cannot verify.
6. Record the final score, coverage, run directory, deployed Worker version IDs, and manual-finalization status in a new dated section below.

A complete ledger entry is necessary evidence but does not, by itself, satisfy the product contract's full release gate. Custom web/API domains, calendar timezone-migration/error responses, and other release gates remain pending or incomplete until independently verified.

## Entry template

```text
## YYYY-MM-DD — run label

- Status: complete | incomplete | invalid
- Production web version:
- Production API version:
- Evaluator checkout:
- Run directory:
- Overall score:
- Overall coverage:
- scoreWithheld:
- Manual checklist finalized:
- Provider/model:
- Notes:
```
