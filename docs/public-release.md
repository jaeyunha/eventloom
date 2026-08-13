# Public release checklist

Eventloom is licensed under the Elastic License 2.0 (`Elastic-2.0`).
That license is source-available and is not an OSI-approved open-source
license. Do not describe the project as "open source" in public copy unless
the licensing decision changes.

This checklist is intentionally separate from deployment readiness. A passing
build or a passing deployment does not make a repository safe to publish.

## Current blockers

The current Git history contains reference and evaluator material under
`evidence/`, including:

- a competition brief and extracted reference images;
- a Discord export containing third-party messages and usernames;
- a host walkthrough transcript;
- a Forge documentation snapshot; and
- generated QA and evaluator artifacts.

These files are intentionally public under the repository owner's approved
policy. Adding an ignore rule would not remove them from history and is not
required for this release.

The approved policy is to publish the current history. This still requires the
secret, dependency, contributor, and Cloudflare-configuration checks below.
   listed above to every unauthenticated reader and does not become safe merely
   because the files are deleted in a later commit.

History rewriting is not required by the approved evidence policy.

## Files that can remain public after review

The Cloudflare, Airtable, and release scripts are source code and can remain
public when:

- provider tokens stay in secret stores and ignored environment files;
- deployment account/resource identifiers are replaced with operator-supplied
  configuration where practical;
- deployment documentation uses placeholders or clearly marked operator-only
  examples; and
- the public repository does not include generated Wrangler state, release
  environment files, browser profiles, transcripts, or private evidence.

The scripts do not contain a committed token in the current scan. Their
capability to deploy or mutate remote resources is not itself a reason to hide
source code; it is a reason to require least-privilege credentials and an
explicit confirmation token.

## Before changing GitHub or Forge visibility

- [x] Publish the current history, including the owner-approved evidence set.
- [x] Treat historical Cloudflare account and resource identifiers as approved
      public metadata; active credentials remain secret.
- [ ] Run a secret scanner against the complete public history, not only the
      working tree.
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
2. Confirm that the sole contributor has the right to publish the repository
   under ELv2.

## GitHub visibility command

Changing repository visibility is an external write and is intentionally not
part of this preparation change. After every item above is complete and the
chosen public history has been pushed, the repository owner can run:

```bash
gh repo edit jaeyunha/open-sessionboard --visibility public --accept-visibility-change-consequences
gh repo view jaeyunha/open-sessionboard --json visibility,isPrivate,url,licenseInfo
```

Run the GitHub command only after the configuration, secret, contributor, and
dependency checks below pass. Apply the equivalent verified visibility
procedure to Forge after confirming Forge's public-repository behavior and
access controls. Both mirrors must expose the same sanitized commit.
