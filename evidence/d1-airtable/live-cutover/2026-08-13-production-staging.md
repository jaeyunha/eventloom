# Production and staging D1 cutover repair

Date: 2026-08-13

## Scope

Repair the deployed D1 cutover by importing historical Airtable business
records, preserving newer D1 writes, restoring the Event-to-Agenda lifecycle
invariant, and removing the remaining production Airtable business-store
fallbacks.

No credential, token, raw Airtable payload, or unredacted provider record ID is
stored in this report.

## Recovery points

Cloudflare D1 Time Travel bookmarks captured before writes:

- Production: `000001c8-00000000-000050c6-b28520840a3f96530c5cf63ed8f65ef9`
- Staging: `00000076-00000000-000050c6-93505e35a839ca81dabbb4c4bd5d3025`

## Source inventories

| Environment | Core Airtable records | Importable | Quarantined |
| --- | ---: | ---: | ---: |
| Production | 43 | 41 | 2 |
| Staging | 23 | 23 | 0 |

Production quarantined two derived `speaker_submission` projection rows. They
duplicate canonical submission aggregates but do not contain enough fields to
reconstruct an independent normalized D1 aggregate. The deterministic reason
code is:

`SPEAKER_SUBMISSION_PROJECTION_HAS_NO_LOSSLESS_NUMBERED_SCHEMA_TARGET`

The canonical submissions represented by those projections were imported.

## Applied plans

### Production

- Plan operations: 264
- Applied operations: 264
- Quarantined source records: 2
- Missing Agenda backfill: 1 event

### Staging

Staging already contained newer D1 writes for the DevFlow event. The merge
preserved:

- the existing D1 event UUID;
- the newer version-2 CFP form and its normalized child structure;
- the existing Agenda state and draft;
- two existing taxonomy IDs with the same event/name identity.

Historical nonconflicting Airtable rows were remapped to those existing D1
identities. The final authoritative merge applied 93 operations with zero
quarantine. One imported event without an Airtable Agenda Version received an
empty Agenda through the generic backfill.

## Post-migration verification

Both environments returned zero rows for `PRAGMA foreign_key_check`.

| Entity | Production | Staging |
| --- | ---: | ---: |
| Organizations | 1 | 1 |
| Events | 3 | 4 |
| CFP forms | 2 | 2 |
| Submissions | 5 | 2 |
| Participants | 8 | 4 |
| Speaker profiles | 5 | 0 |
| Sessions | 6 | 4 |
| Rooms | 7 | 6 |
| Tracks | 7 | 6 |
| Formats | 5 | 5 |
| Agenda states | 3 | 4 |
| Agenda drafts | 3 | 4 |
| Review plans | 1 | 0 |
| Evaluation decisions | 2 | 0 |
| CRM contacts | 4 | 5 |

Invariant checks:

- Production events without Agenda state: 0
- Production Agenda states without draft: 0
- Staging events without Agenda state: 0
- Staging Agenda states without draft: 0

## Authority boundary

The deployed runtime had already selected D1 repositories, but production
composition still retained a legacy Airtable business dependency shell and a
live remix fallback. This repair removes those fallback paths. The optional
organization-scoped Airtable OAuth/PAT, projection, webhook, and controlled
inbound adapter remains supported.

There is no deployed `tenant_datastore_state` marker table. Cutover authority is
therefore established by:

1. successful normalized import and reconciliation;
2. clean D1 foreign keys and Agenda invariants;
3. the D1-only production repository graph;
4. deployment and live workflow acceptance recorded by the release run.
