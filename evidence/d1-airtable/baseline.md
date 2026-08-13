# D1 and Airtable execution baseline

- Accepted baseline commit: `2afb8ba17f30586e1c62ae9c0b3b6900c0db6800`
- Baseline branch: `main`
- Recorded at: 2026-08-13
- Integration owner: primary OMO session `019ffa50-8970-7738-b285-34bb3e74d69a`
- Migration recovery owner: primary OMO session
- Worktree status: clean
- Dirty paths: none
- Existing unrelated worktrees: preserved and excluded from this initiative

## Execution mode

The user has not authorized Git commits. Work therefore proceeds in the primary clean
worktree with concurrent OMO sessions restricted to non-overlapping file ownership.
Shared manifests, migrations, runtime composition, and final integration remain owned by
the primary session. No child may commit, reset, stash, merge, rebase, or modify files
outside its assigned paths.

## Initial ownership

| Lane | Assigned paths |
| --- | --- |
| Primary integration | package manifests, lockfile, migrations, runtime composition, shared bindings |
| Schema contract | `evidence/d1-airtable/table-contracts.md` only |
| Repository analysis | read-only repository-method-to-table mapping |
| Drizzle validation | read-only official API/package compatibility findings |

Further implementation lanes start only after the dependency baseline, table contract,
and numbered migrations are integrated.

## Local D1 compatibility observation

The pre-existing `apps/api/.wrangler` state fails under an older resolved Wrangler
runtime with an internal `_cf_ALARM` schema mismatch. It was not deleted or modified.
Wrangler `4.120.0` using the isolated persist path
`/tmp/open-sessionboard-d1-isolated` applied migrations `0001` through `0006`
successfully. Foundation and migration validation must use a fresh isolated persist path
until a separately approved local-state reset/migration procedure is documented.
