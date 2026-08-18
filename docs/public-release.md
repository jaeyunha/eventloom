# Public repository checklist

Eventloom is licensed under the Elastic License 2.0 (`Elastic-2.0`).
That license is source-available and is not an OSI-approved open-source
license. Do not describe the project as "open source" in public copy unless
the licensing decision changes.

This checklist governs source-repository publication independently from product
deployment and release readiness. A passing build or deployment does not make a
repository safe to publish, and a public repository does not make the product
release-verified.

## Current state

GitHub and Forge may become public after this checklist passes for the exact
candidate commit and selected reachable history. Deployment, staging-provider,
browser-acceptance, and production-release evidence remain governed separately
by [`release-runbook.md`](release-runbook.md).

The prepared current-tree policy excludes screenshots, provider observations,
source snapshots, transcripts, browser recordings, migration outputs, and
generated reports from the source repository. See
[`evidence/README.md`](../evidence/README.md). These artifacts must remain in an
access-controlled evidence store unless a candidate-specific rights and privacy
review explicitly approves publication.

Those artifacts still exist in reachable Git history. Removing them from the
current tree does not make the existing history publication-safe. Before
changing visibility, choose and record whether publication uses the current
history, rewritten history, or a separate sanitized repository.

A 2026-08-16 preparation scan ran Gitleaks 8.30.1 across both the complete
reachable history and current tree. Thirty historical findings and fifteen
current-tree findings were individually reviewed as test fixtures, stable IDs,
source identifiers, or import paths; their exact fingerprints are recorded in
`.gitleaksignore`. Repeat scans reported no leaks. This is preparation evidence
only: rerun both scanners against the final public candidate, and re-review every
finding if history is rewritten because commit fingerprints will change.
A 2026-08-18 scan ran Gitleaks 8.30.1 against candidate `3fcef362`: full
reachable history (869 commits), `--all` refs, and the tracked tree (filtered
via `git ls-files`, excluding ignored local state), plus `bun audit` (no
vulnerabilities). Eleven new findings were individually reviewed — test
idempotency keys, a `BETTER_AUTH_SECRET` test fixture, and an Airtable
import-type line — and their fingerprints were added to `.gitleaksignore`.
Both the history and tracked-tree scans now report no leaks for the candidate.
The reachable history still contains the competition-brief PDF, host
transcript, and QA screenshots removed from the current tree; the
publication-history decision below is still required before any visibility
change.

## Source that can remain public after review

The Cloudflare, Airtable, and release scripts are source code and can remain
public when:

- provider tokens stay in secret stores and ignored environment files;
- deployment account/resource identifiers are replaced with operator-supplied
  configuration where practical;
- deployment documentation uses placeholders or clearly marked operator-only
  examples; and
- the public repository does not include generated Wrangler state, release
  environment files, browser profiles, or private evidence.

Do not rely on an earlier working-tree scan. A publication candidate requires a
fresh full-history and current-tree secret scan plus review of generated
configuration, transcripts, screenshots, and evidence provenance. The
capability of a script to deploy or mutate remote resources is not itself a
reason to hide source code; it is a reason to require least-privilege credentials
and explicit confirmation.

Run the repeatable history, current-tree, and dependency scans from the
repository root:

```bash
go run github.com/zricethezav/gitleaks/v8@v8.30.1 git . --redact=100
go run github.com/zricethezav/gitleaks/v8@v8.30.1 dir . --redact=100
bun audit
```

## Before changing GitHub or Forge visibility

- [ ] Run a secret scanner against the complete public history, not only the
      working tree.
- [ ] Run a secret scanner against the exact current candidate tree.
- [ ] Record whether publication uses current history, rewritten history, or a
      separate sanitized repository.
- [ ] Review every tracked source snapshot, transcript, screenshot, and
      evidence artifact for privacy and redistribution rights.
- [ ] Confirm every contributor has agreed to the ELv2 licensing terms or has
      assigned the required rights.
- [ ] Confirm dependencies, fonts, screenshots, and copied assets have
      compatible redistribution rights.
- [ ] Run `git status --short` from a clean candidate and inspect the complete
      diff.
- [ ] Record authenticated and unauthenticated GitHub/Forge visibility immediately
      before and after the external visibility change.
- [ ] Rotate any credential if the full-history scan finds it anywhere.

## Questions requiring owner decisions

1. Confirm that Elastic License 2.0 applies to all first-party code.
2. Confirm that every contributor has the right to publish their work under
   ELv2.
3. Choose the publication-history policy: current history, rewritten history,
   or a separate sanitized repository.
4. Confirm that the selected public candidate and its reachable history contain
   no unapproved copied assets, source snapshots, transcripts, screenshots, or
   private evidence.

## Visibility commands and anonymous verification

Changing repository visibility is an external write and is intentionally not
part of this preparation change. After every item above is complete and the
chosen public history has been pushed, the repository owner can run:

```bash
gh repo edit jaeyunha/eventloom --visibility public --accept-visibility-change-consequences
gh repo view jaeyunha/eventloom --json visibility,isPrivate,url,licenseInfo
```

After changing visibility, verify both mirrors without stored credentials:

```bash
env -u GH_TOKEN -u GITHUB_TOKEN GIT_TERMINAL_PROMPT=0 \
  git -c credential.helper= ls-remote \
  https://github.com/jaeyunha/eventloom.git HEAD

env -u GH_TOKEN -u GITHUB_TOKEN GIT_TERMINAL_PROMPT=0 \
  git -c credential.helper= ls-remote \
  https://forge.smol.ai/jaeyunha/open-sessionboard.git HEAD
```

Before publication, record that anonymous access fails as expected. After
publication, both commands must succeed and return the approved commit. Record
the observed URLs, commit, operator, and UTC time.

Run the GitHub command only after the configuration, secret, contributor, and
dependency checks above pass. Apply the equivalent verified visibility
procedure to Forge after confirming Forge's public-repository behavior and
access controls. Both mirrors must expose the same approved commit and history.

Repository publication does not assert that a hosted Eventloom deployment is
ready for production. Keep product status and deployed-evidence claims bound to
the product contract and QA/release runbooks.
