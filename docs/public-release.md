# Public release checklist

Eventloom is licensed under the Elastic License 2.0 (`Elastic-2.0`).
That license is source-available and is not an OSI-approved open-source
license. Do not describe the project as "open source" in public copy unless
the licensing decision changes.

This checklist is intentionally separate from deployment readiness. A passing
build or a passing deployment does not make a repository safe to publish.

## Current state

GitHub and Forge remain private until both this checklist and the release gate
in [`release-runbook.md`](release-runbook.md) pass. No checked item or policy
approval is inferred from the presence of source or evidence in the current
tree.

The current tree retains historical source snapshots, extracted reference
images, provider/cutover observations, and local QA screenshots under
[`evidence/`](../evidence/README.md). Some source snapshots contain third-party
names, product imagery, or transcript material. They require an explicit
rights/privacy decision before publication.

Removing a file from the current tree does not remove it from Git history.
Before changing visibility, scan and review the complete history and decide
whether the approved public artifact is the current history, a rewritten
history, or a new sanitized publication repository. Do not state that history
rewriting is unnecessary until that decision is recorded.

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

Do not rely on an earlier working-tree scan. A release candidate requires a
fresh full-history secret scan and review of generated configuration,
transcripts, screenshots, and evidence provenance. The capability of a script
to deploy or mutate remote resources is not itself a reason to hide source
code; it is a reason to require least-privilege credentials and explicit
confirmation.

## Before changing GitHub or Forge visibility

- [ ] Run a secret scanner against the complete public history, not only the
      working tree.
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
- [ ] Verify GitHub and Forge visibility immediately before and after the
      external visibility change.
- [ ] Rotate any credential if the full-history scan finds it anywhere.

## Questions requiring owner decisions

1. Confirm that Elastic License 2.0 applies to all first-party code.
2. Confirm that every contributor has the right to publish their work under
   ELv2.
3. Choose the publication-history policy: current history, rewritten history,
   or a separate sanitized repository.
4. Approve or remove each retained third-party source snapshot and visual
   reference before public visibility.

## GitHub visibility command

Changing repository visibility is an external write and is intentionally not
part of this preparation change. After every item above is complete and the
chosen public history has been pushed, the repository owner can run:

```bash
gh repo edit jaeyunha/open-sessionboard --visibility public --accept-visibility-change-consequences
gh repo view jaeyunha/open-sessionboard --json visibility,isPrivate,url,licenseInfo
```

Run the GitHub command only after the configuration, secret, contributor, and
dependency checks above pass. Apply the equivalent verified visibility
procedure to Forge after confirming Forge's public-repository behavior and
access controls. Both mirrors must expose the same sanitized commit.
