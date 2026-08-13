# Real Airtable staging read-only acceptance

Run UTC: 2026-08-13T13:06:14.981Z to 2026-08-13T13:06:33.908Z  
Repository SHA observed: `187859456e4b025af6c6fae3d781f7cd155b056c`  
Target selector: `.env` `AIRTABLE_BASE_STAGING_ID` (value never recorded)  
Result: **PASS for the exercised read-only surfaces**

## Safety and redaction

- The real-provider harness permits only `GET` and rejects any other HTTP method before network I/O.
- The staging base was distinct from both configured `AIRTABLE_BASE_ID` and `AIRTABLE_BASE_DEV_ID` during the accepted run.
- No create, update, delete, webhook registration, OAuth exchange, or other mutation was attempted.
- The full export existed only under `/tmp`, with mode `0600` as implemented by the existing exporter, and was removed in `finally`. No temporary export/checkpoint remained after the run.
- Tokens, base/table/field/record IDs, names, provider identity values, request IDs, and raw records are absent from retained evidence.
- Identifier and payload hashes in `acceptance-report.json` are SHA-256 values salted with a random per-run salt that was not retained. They support within-report correlation only and cannot be compared across runs.
- A post-run scan of all retained staging artifacts against the configured Airtable token and base IDs returned `LEAK_SCAN_PASS`.

## Exact commands and outcomes

Shell setup for commands using `.env` was `set -a; source .env >/dev/null 2>&1; set +a`. No environment values were echoed.

| Command | Outcome |
| --- | --- |
| `bun evidence/d1-airtable/staging/acceptance.mjs > evidence/d1-airtable/staging/acceptance-report.json 2> evidence/d1-airtable/staging/acceptance-stderr.txt` | exit `0`; stderr `0` bytes; 57 guarded requests, all `GET`, all HTTP `200` |
| `bunx vitest run apps/api/src/infrastructure/airtable/airtable.test.ts` | exit `0`; 1 file passed, 12 tests passed |
| `node --test scripts/d1-airtable-migration/export/export.test.mjs` | exit `0`; 7 passed, 0 failed |
| `AIRTABLE_BASE_ID="$AIRTABLE_BASE_STAGING_ID" node scripts/d1-airtable-migration/export/export.mjs --dry-run --output /tmp/open-sessionboard-airtable-never-written.json` with stdout redaction filter | exit `0`; reported `airtableAccess: read-only`; no network/file write by dry-run contract |
| `lsp_diagnostics evidence/d1-airtable/staging/acceptance.mjs` | no diagnostics |
| secret scan comparing artifact contents to configured Airtable token/base values | `LEAK_SCAN_PASS` |
| `find /tmp -maxdepth 1 -name 'open-sessionboard-airtable-staging-*'` | no leftovers |

The per-command stdout/stderr and exit-code files are retained in this directory. ANSI color bytes in Vitest stdout are the runner's original output.

## Real-provider observations

### Identity

- `GET https://api.airtable.com/v0/meta/whoami`: HTTP `200`.
- The identity payload was valid JSON and retained only as salted key/payload hashes.
- This establishes that the configured token is recognized by Airtable. It does not enumerate or prove the token's complete scope set.

### Schema

- `GET /v0/meta/bases/{staging-base}/tables`: HTTP `200`.
- Tables: `53`.
- Fields across tables: `1,154` (minimum `9`, maximum `54` per table).
- Views across tables: `53` (`1` per table).
- Base ID, table IDs/names, and table schemas are represented only by salted hashes in the report.

### Read and provider HTTP adapter

- The production `FetchAirtableTransport` performed a real list request against the first schema table.
- Observed adapter behavior: `GET`, correct Airtable origin, encoded base/table path present, bearer authorization present, `Accept: application/json`, `pageSize=1`, `returnFieldsByFieldId=true`.
- Airtable returned HTTP `200` and zero records for that sampled table.
- Adapter unit acceptance also passed all 12 existing repository/retry/fetch transport tests.

### Full export

- The existing `exportAirtableInventory` read all schema tables from the staging base.
- Export result: `53` tables, `50` records; `17` non-empty tables and `36` empty tables; maximum `9` records in one table.
- The exporter validated stable `Application ID` values, duplicate prevention, record shape, and scope derivation while building the manifest. A successful result means none of those validations failed for the current staging data.
- The retained report contains salted manifest/schema/record-set hashes and counts only. The raw manifest was deleted.
- Network inventory for the whole accepted harness: `57` GETs (`3` metadata, `54` record-list requests), all HTTP `200`; maximum observed request duration `907.17 ms`, summed request duration `17,516.14 ms`. These are one-run observations, not percentile/SLO evidence.

## Limitations

- No Airtable mutation was performed because no unmistakably isolated disposable test base was identified. Write methods, mutation payloads, optimistic concurrency on real Airtable, webhook creation/deletion, rate-limit retries, and provider-side write permissions remain unaccepted against a real provider.
- The token's exact granted scopes were not returned by the exercised identity response. Successful identity/schema/read proves the required read capabilities, not least privilege or absence of write capability.
- Identity and schema used direct guarded fetches; record adapter behavior used the production `FetchAirtableTransport`; export used the existing migration exporter. This did not exercise deployed Worker routes, OAuth/PAT connection persistence, D1 mappings/jobs, inbound webhook handling, or end-to-end Airtable-to-D1 synchronization.
- The sampled transport read used the first schema table and returned no records. Record-body parsing through the same provider transport is nevertheless exercised by the full real export, while transport response parsing is covered by the existing unit suite.
- All configured tables fit in one Airtable page in this run (maximum 9 records), so real-provider offset pagination/resume was not triggered. Deterministic pagination/resume behavior passed the exporter unit suite.
- No forced 429/5xx/provider outage was induced against Airtable. Retry and `Retry-After` behavior is covered only by the existing transport tests.
- No table/field names are retained by design, so this evidence proves accessibility and aggregate shape, not human review of semantic schema naming or mapping correctness.
- The repository was already dirty from concurrent initiative work. This task made no code edits and owns only new files under this directory; no commit was created.
