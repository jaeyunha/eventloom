# Evidence policy

Release evidence is stored outside the source repository. Screenshots, provider
observations, source snapshots, transcripts, browser recordings, migration
outputs, and generated reports can contain private data or material without
redistribution approval, so they are ignored here by default.

The authoritative sources are:

- product scope and status: [`../spec/eventloom.md`](../spec/eventloom.md);
- system boundaries: [`../ARCHITECTURE.md`](../ARCHITECTURE.md);
- evaluator history and limitations:
  [`../docs/llm-judge-runs.md`](../docs/llm-judge-runs.md);
- QA and release evidence requirements:
  [`../docs/qa-runbook.md`](../docs/qa-runbook.md) and
  [`../docs/release-runbook.md`](../docs/release-runbook.md).

Evidence retained for a release must be redacted, access-controlled, bound to
the candidate commit, and reviewed under the applicable runbook. It does not
become release proof merely because it exists.

Removing artifacts from the current tree does not remove them from Git history.
Follow [`../docs/public-release.md`](../docs/public-release.md) before changing
repository visibility.
