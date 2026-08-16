# React Doctor 100/100 handoff

## Objective

Bring every React app root to a fresh `npx react-doctor@latest --verbose` score of 100/100 without exclusions, ignores, suppressions, relaxed rules, or behavior deletion; then run the relevant typecheck, lint, tests, and builds.

## App inventory and scan history

- The only React application root found from workspace manifests is `apps/web` (`@eventloom/web`, Next.js 16 / React 19).
- Initial full root scan: **0/100**, 1,103 findings across 695 files. Most errors were generated `.next-*` and `apps/web/tmp` output mixed into the source scan.
- Stale generated output was preserved, not deleted, under `/private/tmp/open-sessionboard-react-doctor-artifacts-20260816T024801Z`. Active build directories were never moved.
- First clean-source full scan: **42/100**, 691 findings, including 674 source findings and 17 active/generated findings.
- Latest completed full scan before the checkpoint: **45/100**, 483 findings across 672 files: 469 source findings and 14 generated findings. Its diagnostics are at `/var/folders/9k/vdq30kmx3yq5d31qhm9c33tm0000gn/T/react-doctor-14d1af4f-4f9d-4bae-ab5d-bc29b5de46f9`.
- That latest scan had six `react-doctor/only-export-components` findings. All six were subsequently fixed in the working tree, but a fresh scan has not yet verified the post-fix count.

## Checkpoint commit

- Commit: `f18286d` (`refactor(web): isolate React component exports`)
- The commit deliberately contains only confirmed React Doctor refactors that could be separated from unrelated dirty work.
- Isolated staged-tree proof before commit:
  - `bun run --filter @eventloom/web typecheck` — passed.
  - 19 focused Vitest files — **191 passed**.
- A full isolated `bun run test:unit` was attempted. Sixty-two suites could not resolve workspace/dependency packages because the temporary verification worktree reused symlinked node_modules; three unrelated current assertions also failed (`workspace-surface-tokens`, `admin-shell-workspace`, `reviewer-shell`). Do not report that attempt as a product regression gate.

## Work completed after the latest scan

The working tree also contains additional structural fixes not included in `f18286d` where they overlap other concurrent product work. These include the remaining component-export extractions for CFP, agenda, communications, deliverables, Airtable, embeds, settings, speakers, and related canonical model modules. Preserve them and verify before committing.

The source error families `no-ref-current-in-render`, `no-unguarded-browser-global-in-render-or-hook-init`, and `effect-needs-cleanup` were reduced to zero in full scans before the export migration.

## Immediate continuation

1. Run `git status --short` and preserve every unrelated dirty file.
2. Run a fresh full `npx react-doctor@latest --verbose` from the repository root. Do not use scope, exclusions, config ignores, or suppressions for the completion scan.
3. Resume the paused Zod migration in `apps/web/src/features/cfp/api.ts`: the 15 findings are `.passthrough()` calls whose Zod 4 behavior-equivalent replacement is `.loose()`. Run `apps/web/src/features/cfp/api.test.ts` and web typecheck after the focused change.
4. Continue one complete rule family at a time. The last pre-checkpoint source counts after component-export work began were dominated by:
   - `no-adjust-state-on-prop-change` (72)
   - `deslop/unused-export` (50)
   - `js-combine-iterations` (46)
   - `js-set-map-lookups` (41)
   - `no-loading-flag-reset-outside-finally` (33)
   - `no-giant-component` (31)
   - `js-hoist-intl` (30)
   - `nextjs-no-a-element` (20)
   - `prefer-useReducer` (16)
   - `zod-v4-no-deprecated-schema-apis` (15)
   - `no-barrel-import` (15)
   - `no-locale-format-in-render` (14)
5. After every rule family, run focused tests/typecheck and a full Doctor scan to prove measurable progress.
6. At 100/100, run web typecheck, repository lint/format check, unit/integration tests, and builds. Treat local/mock evidence honestly.

## Safety constraints

- The main checkout contains substantial unrelated and concurrent work. Never reset, stash, clean, or stage it wholesale.
- Do not restore the preserved generated `.next-*` artifacts into an app root before Doctor verification.
- Do not install React Doctor or add Doctor configuration merely to alter scoring.
- Do not remove behavior, relax schemas/rules, or add compatibility re-exports to silence findings.
