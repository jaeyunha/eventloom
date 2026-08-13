# D1 table and repository contract

Status: schema prerequisite for the D1-authority/Airtable-adapter implementation.  
Scope: every provider-neutral repository named in the approved plan, the existing Airtable business models, D1 audit/webhook state, and the optional Airtable control/sync/inbound state machines.

## 1. Binding storage rules

1. D1 is authoritative. Airtable record IDs occur only in `airtable_*` integration tables.
2. All tables are SQLite `STRICT`; `PRAGMA foreign_keys = ON` is required on migration and repository connections.
3. IDs and timestamps are `TEXT`. Timestamps are UTC RFC 3339 instants. Booleans are `INTEGER NOT NULL CHECK (... IN (0,1))`.
4. A column marked `!` is `NOT NULL`; `?` is nullable. `J!`/`J?` means `TEXT` with `json_valid` and the stated JSON top-level type. `B!` means the checked integer boolean above.
5. Every mutable business root has `version INTEGER NOT NULL CHECK(version > 0)`, `created_at TEXT NOT NULL`, and `updated_at TEXT NOT NULL`. CAS updates predicate on the complete tenant key, application ID, and expected version; exactly one changed row is success.
6. Child rows whose parent is rewritten as one aggregate use `ON DELETE CASCADE`. Durable history, audit, provider receipts, and immutable versions use `RESTRICT` or retain scalar source IDs. User references use `ON DELETE SET NULL` unless identity is itself the subject.
7. Organization FKs reference `organizations(organization_id)`. Event-owned FKs use composite `(organization_id,event_id)` references to `events(organization_id,id)`, preventing cross-tenant links.
8. Physical deletion is limited to draft/configuration records explicitly marked below. Business lifecycle deletion is a status/tombstone. Audit, revisions, decisions, sends, report runs, mappings, jobs, webhook receipts, and conflicts are never hard-deleted in ordinary repositories.
9. JSON is limited to dynamic rules/answers, immutable snapshots, provider payloads, and configuration. IDs, statuses, ownership, joins, scores, and production filters are relational.
10. Existing `organizations`, identity/auth tables, `participant_grants`, `idempotency_records`, `outbox_jobs`, `delivery_attempts`, `private_uploads`, `reminder_runs`, `reminder_dispatches`, and `publication_rebuild_receipts` remain. `airtable_sync_jobs` is separate from `outbox_jobs`.

### Common tenant/index contract

Unless a table definition states otherwise:

- Application-ID root tables use `PRIMARY KEY(id)` and also `UNIQUE(organization_id,id)` so composite FKs can enforce tenant scope.
- `events` uses `UNIQUE(organization_id,id)`. Every other event-owned root uses both `UNIQUE(organization_id,id)` and `UNIQUE(organization_id,event_id,id)`, plus index `(organization_id,event_id,updated_at DESC)` when it has `updated_at`.
- Every FK column or FK tuple used independently has a supporting index.
- Every list/filter method has the index named in section 3; IDs passed as arrays use bounded `IN (...)` queries.
- Case-insensitive email/slug uniqueness uses `COLLATE NOCASE` on the indexed column.
- JSON object columns check `json_type(column)='object'`; arrays check `json_type(column)='array'`.

## 2. Status and discriminator registry

| Name | Allowed values |
| --- | --- |
| event status | `draft`, `active`, `archived` |
| CFP form status | `draft`, `published`, `closed` |
| submission status | `draft`, `submitted`, `reopened`, `withdrawn` |
| submission version reason | `draft_created`, `draft_saved`, `submitted`, `reopened`, `withdrawn` |
| participant role | `primary`, `co_speaker` |
| participant source | `cfp`, `manual`, `csv`, `crm` |
| participant identity | `resolved`, `ambiguous` |
| review plan | `draft`, `open`, `closed` |
| assignment | `assigned`, `in_progress`, `submitted`, `abstained`, `superseded` |
| criterion input | `numeric`, `dropdown`, `free_text` |
| round anonymization | `none`, `single`, `double` |
| decision | `accepted`, `waitlisted`, `rejected` |
| suggestion | `pending`, `accepted`, `edited`, `rejected`, `stale` |
| suggestion audit | `generate`, `stale`, `accept`, `edit`, `reject` |
| session content | `Approved`, `Needs changes` |
| speaker task type | `form`, `upload`, `action` |
| speaker task owner | `speaker`, `organizer` |
| speaker task status | `not_started`, `in_progress`, `submitted`, `needs_changes`, `completed`, `waived`, `overdue`, `reopened` |
| speaker asset kind | `headshot`, `slides`, `supporting_file` |
| speaker asset state | `pending_upload`, `ready`, `rejected` |
| asset review | `approved`, `needs_changes` |
| roster status | `pending`, `active`, `revoked` |
| task response | `draft`, `submitted`, `needs_changes`, `reopened` |
| agenda suggestion | `pending`, `rejected`, `superseded`, `stale`, `applied` |
| agenda change | `add`, `move`, `change`, `remove` |
| time disambiguation | `earlier`, `later` |
| publication | `pending`, `served`, `failed` |
| publication trigger | `initial-publication`, `approved-content-change`, `confirmed-profile-change`, `released-asset-change`, `released-schedule-change` |
| communication purpose | `verification`, `receipt`, `reminder`, `decision`, `task`, `schedule_publish`, `schedule_update`, `schedule_cancel`, `organizer_group_email` |
| communication audience | `all_participants`, `accepted_participants`, `waitlisted_participants`, `rejected_participants`, `task_assignees`, `scheduled_participants` |
| template | `draft`, `approved`, `archived` |
| send | `queued`, `delivered`, `partial`, `failed` |
| delivery | `queued`, `delivered`, `failed`, `bounced`, `complained` |
| report format | `csv`, `xlsx` |
| remix source | `session`, `speaker` |
| remix status | `pending`, `applied`, `rejected`, `stale` |
| CRM source | `manual`, `csv`, `speaker`, `import` |
| CRM contact | `active`, `merged` |
| CRM pipeline | `new`, `contacted`, `qualified`, `invited`, `registered`, `accepted`, `declined`, `won`, `lost` |
| CRM history | `event`, `session`, `submission`, `attendance`, `note`, `pipeline`, `communication` |
| CRM outreach | `queued`, `sent`, `delivered`, `failed`, `bounced`, `complained` |
| webhook delivery | `pending`, `delivering`, `retrying`, `succeeded`, `failed`, `dead_letter` |
| Airtable connection | `disconnected`, `authorizing`, `connected`, `refreshing`, `paused`, `reauthorization_required`, `disconnecting` |
| OAuth attempt | `pending`, `exchanging`, `consumed`, `failed`, `expired` |
| sync operation | `upsert`, `archive`, `delete`, `reconcile` |
| sync job | `pending`, `claimed`, `succeeded`, `retry`, `dead`, `cancelled` |
| webhook registration | `creating`, `active`, `refreshing`, `expired`, `invalid`, `deleting`, `deleted` |
| webhook notification | `received`, `processed`, `rejected` |
| inbound change | `pending`, `claimed`, `applied`, `noop`, `conflict`, `retry`, `dead`, `cancelled` |
| sync conflict | `open`, `resolving`, `resolved` |

Session status remains event-configurable text. It is constrained by `session_statuses`, not by a static SQL enum.

## 3. Exact table catalog

Notation after each table: columns; then keys/constraints; then indexes and deletion/retention. To keep repeated tenant keys readable without making them implicit, the following expansions are exact:

- `organization/event` = `organization_id TEXT NOT NULL`, `event_id TEXT NOT NULL`.
- `timestamps` = `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`.
- `version/timestamps` = `version INTEGER NOT NULL CHECK(version > 0)`, followed by the two timestamp columns above.
- `PK/FK/common` = the listed `id TEXT NOT NULL PRIMARY KEY`, FK `organization_id REFERENCES organizations(organization_id) ON DELETE CASCADE`, composite FK `(organization_id,event_id) REFERENCES events(organization_id,id) ON DELETE CASCADE`, `UNIQUE(organization_id,id)`, and `UNIQUE(organization_id,event_id,id)`.
- A listed column without `?` is `NOT NULL`; a listed `?` column is nullable. Bare ID/name/text columns in compact definitions are `TEXT`; bare counts, ordinals, revisions, and versions are `INTEGER`. JSON type and boolean rules remain those in section 1.

No other column is implied by a compact definition.

### 3.1 Program core (`0007_program_core.sql`)

#### `events`

`id TEXT!`, `organization_id TEXT!`, `slug TEXT! COLLATE NOCASE`, `name TEXT!`, `status TEXT!`, `time_zone TEXT!`, `starts_at TEXT!`, `ends_at TEXT!`, `venue TEXT?`, `cfp_enabled B!`, `cfp_opens_at TEXT?`, `cfp_closes_at TEXT?`, `default_duration_minutes INTEGER!`, `default_calendar_time_zone TEXT!`, `default_calendar_location TEXT?`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`, `created_by TEXT!`, `updated_by TEXT!`.

PK `id`; FK organization `CASCADE`; unique `(organization_id,id)`, `(organization_id,slug)`; checks event status, positive version/duration, `ends_at>starts_at`, and CFP open/close both null or close after open. Indexes `(organization_id,status,updated_at DESC)`, `(organization_id,slug)`. Archive, never hard-delete after dependent data exists.

#### `event_embed_configurations`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `widget_id TEXT!`, `name TEXT!`, `theme TEXT!`, `output_format TEXT!`, `layout TEXT!`, `display_fields_json J!(array)`, `track_ids_json J!(array)`, `enabled B!`, `revision INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`.

PK `id`; FK event `CASCADE`; unique `(organization_id,event_id,id)` and `(organization_id,event_id,widget_id)`; checks widget `sessions|speakers|agenda|itinerary|gallery`, theme/output/layout values from `EventEmbedConfiguration`, revision positive. Index `(organization_id,event_id,enabled,widget_id)`. Replaced configurations may be hard-deleted only as part of the event CAS aggregate.

#### `rooms`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `name TEXT!`, `capacity INTEGER!`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`, `created_by TEXT!`, `updated_by TEXT!`.

PK/FK/common; unique `(organization_id,event_id,name COLLATE NOCASE)`; checks capacity nonnegative. Index `(organization_id,event_id,name)`. Hard delete is allowed only when no session/agenda row references it (`RESTRICT` FKs make failure deterministic).

#### `room_resources`

`organization_id TEXT!`, `event_id TEXT!`, `room_id TEXT!`, `resource_id TEXT!`, `ordinal INTEGER!`.

PK `(organization_id,event_id,room_id,resource_id)`; FK room `CASCADE`; unique `(organization_id,event_id,room_id,ordinal)`; ordinal nonnegative. Index `(organization_id,event_id,resource_id)`.

#### `tracks`, `formats`, `levels`, `tags`

Each table: `id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `name TEXT!`, `description TEXT! DEFAULT ''`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`, `created_by TEXT!`, `updated_by TEXT!`.

PK/FK/common; unique `(organization_id,event_id,name COLLATE NOCASE)`; positive version. Index `(organization_id,event_id,name)`. Hard delete only when no join/root references it; all referencing FKs are `RESTRICT`.

#### `session_statuses`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `value TEXT!`, `name TEXT!`, `description TEXT! DEFAULT ''`, `agenda_eligible B!`, `sort_order INTEGER!`, `active B!`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`.

PK; FK event `CASCADE`; unique `(organization_id,event_id,value COLLATE NOCASE)` and `(organization_id,event_id,sort_order)`; nonnegative order. Index `(organization_id,event_id,active,sort_order)`. Settings commands reconcile these rows; values in use cannot be deleted, only deactivated.

#### `session_settings`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`, `created_by TEXT!`, `updated_by TEXT!`.

PK; FK event `CASCADE`; unique `(organization_id,event_id)` and `(organization_id,event_id,id)`; positive version. Index `(organization_id,event_id)`. Status ordering/eligibility is read from `session_statuses`.

### 3.2 CFP and speakers (`0008_cfp_and_speakers.sql`)

#### `cfp_forms`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `name TEXT!`, `status TEXT!`, `welcome_content TEXT!`, `speaker_limit INTEGER!`, `max_submissions_per_account INTEGER!`, `reminders_enabled B!`, `admin_notifications_enabled B!`, `confirmation_message TEXT!`, `success_content TEXT!`, `redirect_url TEXT?`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`.

PK; FK event `CASCADE`; unique `(organization_id,id)`, `(organization_id,event_id,id)`; checks status and positive limits/version. Index `(organization_id,event_id,status,name)`. Drafts may be deleted only before submissions; otherwise close/archive via status evolution.

#### `cfp_form_sections`

`organization_id TEXT!`, `form_id TEXT!`, `id TEXT!`, `title TEXT!`, `description TEXT!`, `sort_order INTEGER!`.

PK `(organization_id,form_id,id)`; FK form `CASCADE`; unique `(organization_id,form_id,sort_order)`; nonnegative order. Index `(organization_id,form_id,sort_order)`.

#### `reusable_fields`

`organization_id TEXT!`, `id TEXT!`, `version INTEGER!`, `definition_json J!(object)`, `created_at TEXT!`.

PK `(organization_id,id,version)`; FK organization `CASCADE`; positive version. Index `(organization_id,id,version DESC)`. Immutable and retained indefinitely while any form version can reference it.

#### `cfp_form_fields`

`organization_id TEXT!`, `form_id TEXT!`, `id TEXT!`, `section_id TEXT!`, `scope TEXT!`, `field_key TEXT!`, `label TEXT!`, `description TEXT?`, `placeholder TEXT?`, `kind TEXT!`, `required B!`, `options_json J!(array)`, `file_owner TEXT?`, `allowed_mime_types_json J?(array)`, `max_bytes INTEGER?`, `reusable_field_id TEXT?`, `reusable_field_version INTEGER?`, `sort_order INTEGER!`.

PK `(organization_id,form_id,id)`; FK form/section `CASCADE`; reusable composite FK `RESTRICT`; unique `(organization_id,form_id,field_key)` and sort order within scope; checks scope `submission|participant`, field kind registry, file-request columns all present only for `file_request`, positive max bytes, reusable ID/version both null or both present. Indexes `(organization_id,form_id,scope,sort_order)`, reusable reference.

#### `cfp_form_rules`

`organization_id TEXT!`, `form_id TEXT!`, `id TEXT!`, `priority INTEGER!`, `condition_json J!(object)`, `actions_json J!(array)`.

PK `(organization_id,form_id,id)`; FK form `CASCADE`; unique priority per form; priority nonnegative. Index `(organization_id,form_id,priority)`.

#### `submissions`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `form_id TEXT!`, `owner_account_id TEXT!`, `form_version INTEGER!`, `status TEXT!`, `completed_steps_json J!(array)`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`, `submitted_at TEXT?`, `reopened_at TEXT?`, `withdrawn_at TEXT?`, `final_decision_at TEXT?`.

PK; FK event/form `RESTRICT`; unique tenant/event IDs; checks status, versions positive. Indexes `(organization_id,event_id,updated_at DESC)`, `(organization_id,event_id,form_id,owner_account_id)`, `(organization_id,event_id,status,updated_at DESC)`. Never hard-delete after creation; withdrawn is terminal business tombstone unless reopened.

#### `submission_answers`

`organization_id TEXT!`, `submission_id TEXT!`, `field_key TEXT!`, `value_json J!`, `asset_id TEXT?`.

PK `(organization_id,submission_id,field_key)`; FK submission `CASCADE`; optional asset FK `speaker_assets(id) ON DELETE RESTRICT` is added after that table exists. Index `(organization_id,submission_id)` and `(asset_id)`.

#### `participants`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `first_name TEXT!`, `last_name TEXT!`, `display_name TEXT!`, `email TEXT!`, `normalized_email TEXT! COLLATE NOCASE`, `identity_state TEXT!`, `source_type TEXT!`, `source_id TEXT?`, `claimed_user_id TEXT?`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`.

PK; FK event `CASCADE`, claimed user `SET NULL`; unique `(organization_id,event_id,id)`; checks identity/source/positive version. Partial unique `(organization_id,event_id,normalized_email) WHERE normalized_email<>'' AND identity_state='resolved'`; indexes `(organization_id,event_id,normalized_email)`, `(organization_id,event_id,source_type,source_id)`. Retained while referenced; merge/re-resolution changes links, never IDs.

#### `submission_participants`

`organization_id TEXT!`, `event_id TEXT!`, `submission_id TEXT!`, `participant_id TEXT!`, `role TEXT!`, `biography TEXT!`, `answers_json J!(object)`, `ordinal INTEGER!`.

PK `(organization_id,submission_id,participant_id)`; FKs submission/participant `RESTRICT`; unique `(organization_id,submission_id,ordinal)` and partial unique primary per submission; checks role/ordinal. Index `(organization_id,event_id,participant_id,submission_id)`.

#### `submission_secondary_contacts`

`organization_id TEXT!`, `submission_id TEXT!`, `id TEXT!`, `name TEXT!`, `email TEXT!`, `ordinal INTEGER!`.

PK `(organization_id,submission_id,id)`; FK submission `CASCADE`; unique ordinal; index submission order.

#### `submission_versions`

`organization_id TEXT!`, `event_id TEXT!`, `submission_id TEXT!`, `version INTEGER!`, `reason TEXT!`, `actor_id TEXT!`, `idempotency_key TEXT?`, `snapshot_json J!(object)`, `created_at TEXT!`.

PK `(organization_id,submission_id,version)`; FK submission `RESTRICT`; checks reason/version. Partial unique `(organization_id,submission_id,idempotency_key) WHERE idempotency_key IS NOT NULL`; index event/time. Immutable, indefinite retention.

#### `speaker_profiles`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `participant_id TEXT!`, `display_name TEXT!`, `email TEXT?`, `job_title TEXT! DEFAULT ''`, `company TEXT! DEFAULT ''`, `status TEXT! DEFAULT ''`, `biography TEXT!`, `social_links_json J!(object)`, `travel_required B!`, `arrival_at TEXT?`, `departure_at TEXT?`, `accommodation TEXT! DEFAULT ''`, `dietary_requirements TEXT! DEFAULT ''`, `accessibility_needs TEXT! DEFAULT ''`, `travel_notes TEXT! DEFAULT ''`, `headshot_asset_id TEXT?`, `source_type TEXT?`, `source_id TEXT?`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`.

PK; FK participant `RESTRICT`, asset `SET NULL`; unique `(organization_id,event_id,participant_id)` and tenant/event ID; checks source and version. Indexes event/participant, event/status, source. Archive by participant/roster lifecycle; no hard delete while published.

#### `speaker_tasks`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `submission_id TEXT?`, `participant_id TEXT!`, `type TEXT!`, `owner TEXT!`, `title TEXT!`, `description TEXT! DEFAULT ''`, `instructions TEXT! DEFAULT ''`, `status TEXT!`, `due_at TEXT?`, `allowed_mime_types_json J!(array)`, `max_bytes INTEGER?`, `accepted_asset_kinds_json J!(array)`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`.

PK; FKs event, participant, optional submission `RESTRICT`; checks enums, positive version/max. Indexes `(organization_id,event_id,participant_id,status,due_at)`, `(organization_id,event_id,submission_id)`, IDs. Never hard-delete after assignment; waive instead.

#### `speaker_task_dependencies`, `speaker_task_reminder_offsets`

Dependencies: `organization_id`, `event_id`, `task_id`, `dependency_task_id`, PK all IDs, both task FKs `CASCADE`, check task differs; reverse index dependency. Offsets: `organization_id`, `event_id`, `task_id`, `offset_minutes INTEGER!`, PK task+offset, FK task `CASCADE`, nonnegative.

#### `speaker_task_transitions`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `task_id TEXT!`, `participant_id TEXT!`, `actor_account_id TEXT!`, `from_status TEXT!`, `to_status TEXT!`, `note TEXT?`, `occurred_at TEXT!`.

PK; FK task `RESTRICT`; status checks; index `(organization_id,event_id,task_id,occurred_at)`. Immutable.

#### `speaker_roster`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `submission_id TEXT!`, `participant_id TEXT!`, `role TEXT!`, `status TEXT!`, `workflow_status TEXT?`, `organizer_status TEXT?`, `display_name TEXT!`, `email TEXT?`, `job_title TEXT!`, `company TEXT!`, `biography TEXT!`, `social_links_json J!(object)`, `travel_logistics_json J!(object)`, `headshot_asset_id TEXT?`, `source_type TEXT?`, `source_id TEXT?`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`, `author_account_id TEXT?`.

PK; FK `(organization_id,event_id,submission_id)` to `submissions` `RESTRICT`; FK `(organization_id,event_id,participant_id)` to `participants` `RESTRICT`; optional `headshot_asset_id` FK to `speaker_assets(id)` `SET NULL`; unique `(organization_id,event_id,id)` and `(organization_id,event_id,submission_id,participant_id)`; checks role/status/source/version. Indexes `(organization_id,event_id,submission_id,status)`, `(organization_id,event_id,participant_id,status)`, `(organization_id,event_id,status,updated_at DESC)`. Revoke, never delete.

#### `speaker_task_forms`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `task_id TEXT!`, `title TEXT!`, `description TEXT!`, `fields_json J!(array)`, `version INTEGER!`, `published B!`, `updated_at TEXT!`.

PK `(id,version)`; FK task `RESTRICT`; unique `(organization_id,event_id,task_id,version)` and partial unique task where published; positive version. Index task/version desc. Immutable versions.

#### `speaker_task_responses`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `task_id TEXT!`, `participant_id TEXT!`, `definition_version INTEGER!`, `answers_json J!(object)`, `status TEXT!`, `version INTEGER!`, `feedback TEXT?`, `submitted_at TEXT?`, `updated_at TEXT!`.

PK; FK task/participant/form-version `RESTRICT`; unique `(organization_id,event_id,task_id,participant_id,version)` and `id`; checks status/version. Index latest response `(organization_id,event_id,task_id,participant_id,version DESC)`. Immutable prior versions; current save inserts next version.

#### `speaker_assets`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `submission_id TEXT?`, `participant_id TEXT!`, `task_id TEXT?`, `kind TEXT!`, `object_key TEXT!`, `file_name TEXT!`, `content_type TEXT!`, `size_bytes INTEGER!`, `state TEXT!`, `version INTEGER!`, `version_family_id TEXT!`, `supersedes_asset_id TEXT?`, `comment_thread_id TEXT!`, `review_state TEXT?`, `review_note TEXT?`, `reviewed_at TEXT?`, `reviewed_by TEXT?`, `review_version INTEGER! DEFAULT 0`, `latest_version_id TEXT?`, `current_version_id TEXT?`, `approved_version_id TEXT?`, `released_version_id TEXT?`, `rejection_reason TEXT?`, `created_at TEXT!`, `finalized_at TEXT?`.

PK; FKs event/participant/submission/task and self predecessor `RESTRICT`; unique object key and `(organization_id,event_id,id)`; unique `(organization_id,event_id,version_family_id,version)`; checks enums, sizes/version, review fields consistent. Indexes participant, task, family/version desc, state, released pointer. Immutable object metadata; state/pointers/review mutate by CAS. Retained while R2 lifecycle/audit requires it; object purge does not delete row.

#### `speaker_asset_comments`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `asset_id TEXT!`, `version_id TEXT!`, `body TEXT!`, `author_label TEXT!`, `author_account_id TEXT?`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`.

PK; FK asset `RESTRICT`; positive version; index asset/version/time. Soft-delete is represented by redacted body plus audit, not row deletion.

#### `portal_contexts`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `account_id TEXT!`, `name TEXT!`, `slug TEXT!`, `status TEXT!`, `primary_participant_id TEXT!`, `capabilities_json J!(array)`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`.

PK; FK event/participant; unique `(organization_id,event_id,account_id,id)` and `(organization_id,event_id,slug)`; index account and event. Context scope members are in `portal_context_submissions` and `portal_context_participants` (same scope columns + referenced ID; composite PK; `CASCADE`). Revoke/disable instead of delete after use.

#### `speaker_event_resources`, `speaker_wiki_pages`

Resources: `id`, organization/event, `title`, `summary?`, `html?`, `url?`, `sort_order INTEGER!`, `version INTEGER!`, `updated_at`; PK/FK, unique order, index event/order. Wiki adds `slug TEXT! COLLATE NOCASE` and unique event slug. Status is `draft|published|archived`; add `status TEXT!`. Archive, no hard delete once published.

#### `speaker_content`, `speaker_content_history`

Current: `id`, organization/event, `entity_type`, `entity_id`, `title?`, `description?`, `abstract?`, `biography?`, `social_links_json J?(object)`, `headshot_asset_id?`, `status?`, `version`, `updated_at`, `updated_by`; PK, unique `(organization_id,event_id,entity_type,entity_id)`, check entity type, FK source enforced by repository because SQLite cannot polymorphically FK; index source. History: same scope + `id`, source, `action`, `version`, `actor_account_id`, `actor_label?`, `occurred_at`, `snapshot_json J!(object)`; PK, unique source/version, action check, index source/version desc. History immutable/indefinite.

#### `speaker_reminder_receipts`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `idempotency_key TEXT!`, `task_ids_json J!(array)`, `recipient_ids_json J!(array)`, `receipts_json J!(array)`, `actor_account_id TEXT!`, `created_at TEXT!`.

PK; FK event; unique `(organization_id,event_id,idempotency_key)`; index event/time. Retain 2 years.

### 3.3 Evaluations (`0009_evaluations.sql`)

#### `review_plans`

`id`, organization/event, `name`, `status`, `blind_review B!`, `closes_at?`, `reviews_per_submission INTEGER!`, `max_assignments_per_reviewer INTEGER!`, `track_filter?`, `auto_distribute B!`, reviewer projection field/file JSON arrays, `grading_revision INTEGER?`, `grading_locked_at?`, `version`, timestamps.

PK/FK/common; checks plan status/counts/version. Index event/status. Closed plans and descendants retained indefinitely.

#### `review_rounds`

`id TEXT!`, `organization_id`, `event_id`, `plan_id`, `name`, `sequence INTEGER!`, `revision INTEGER!`, `rubric_id TEXT!`, `rubric_revision INTEGER!`, `opens_at?`, `closes_at?`, `blind_review B!`, `anonymization TEXT!`, `track_filter?`.

PK `(organization_id,plan_id,id,revision)`; FK plan `CASCADE`; unique plan sequence+revision; checks revisions/sequence/anonymization/time. Index current rounds `(organization_id,event_id,plan_id,sequence,revision DESC)`.

#### `review_rubrics`, `review_criteria`, `review_criterion_options`

Rubric: organization/event/plan + `id`, `revision`, `name`; PK `(organization_id,plan_id,id,revision)`, FK plan `CASCADE`. Criteria: same rubric key + `id`, `label`, `description`, `minimum REAL!`, `maximum REAL!`, `weight REAL!`, `required B!`, `input_type`, `sort_order`; PK rubric+criterion, unique order, checks max>=min, weight>0, input enum. Options: criterion key + `id`, `label`, `value`, `sort_order`; PK criterion+id, unique value/order. All immutable per revision; indexes preserve ordered loading.

#### `reviewer_pools`, `reviewer_pool_members`

Pool: `id`, organization/event, `round_id`, `round_revision`, `name?`, `version`, timestamps; PK; FK round `RESTRICT`; unique `(organization_id,event_id,round_id,round_revision)`. Members: pool scope + `reviewer_id`; PK pool+reviewer, index reviewer/event. `ReviewerPoolRepository` rewrites members under pool CAS. Retain with round.

#### `review_assignments`

`id`, organization/event, `plan_id`, `round_id`, `round_revision`, `submission_id`, `reviewer_id`, `status`, `predecessor_assignment_id?`, `successor_assignment_id?`, `superseded_reason?`, `superseded_at?`, `plan_version`, `rubric_revision`, `submission_revision`, `version`, timestamps.

PK; FKs plan/submission and self lineage `RESTRICT`; unique IDs and partial unique active `(organization_id,event_id,plan_id,round_id,submission_id,reviewer_id) WHERE status<>'superseded'`; checks assignment status/revisions/version and successor/predecessor not self. Indexes plan/status, reviewer/event/status, submission/round, lineage.

#### `evaluation_reviews`, `evaluation_scores`, `evaluation_score_evidence`

Review: `id`, organization/event/plan/round, `assignment_id`, `submission_id`, `reviewer_id`, `comment`, `submitted_at?`, source revisions, `version`, timestamps. PK; FK assignment `RESTRICT`; unique assignment; checks source revisions/version. Scores: review ID + `criterion_id`, `value_number REAL?`, `value_text TEXT?`, `origin TEXT!`, `human_confirmed_by?`, `suggestion_id?`, `suggestion_status?`, source revisions, `updated_at`; PK review+criterion; exactly one value; origin `human|ai`; pending/nonaccepted AI remains stored but aggregate queries include only human or confirmed accepted. Evidence: review+criterion+ordinal+`evidence TEXT!`; PK and ordered index. Review delete prohibited.

#### `evaluation_conflicts`

`id`, organization/event/plan, `assignment_id`, `submission_id`, `reviewer_id`, `reason`, `declared_at`; PK; unique assignment; FK assignment `RESTRICT`; indexes plan/reviewer. Immutable.

#### `evaluation_suggestions`, `evaluation_suggestion_candidates`, `evaluation_suggestion_history`

Suggestion: `id`, organization/event/plan/round, assignment/submission/reviewer, rubric/submission/plan revisions, `rubric_id?`, provider/model/prompt version, generated/source-reference/provenance JSON, `status`, `version`, timestamps. PK/FKs; checks status/version; indexes plan, assignment, status. Candidate: `suggestion_id`, `id`, `criterion_id`, `value REAL!`, `evidence_json J!(array)`, `provenance_json J!(object)`, ordinal; PK suggestion+id, unique criterion+ordinal. History: suggestion+ordinal, action, actor_id?, at, reason?, values JSON?; PK; action check. Retain indefinitely.

#### `evaluation_decisions`, `evaluation_decision_transitions`

Decision: `id`, organization/event/plan/submission, `status`, `version`, `updated_at`; PK; FKs; unique `(organization_id,plan_id,submission_id)`; checks status/version. Transition: decision ID + `ordinal`, `from_status?`, `to_status`, `reason`, `decided_by`, `decided_at`, `idempotency_key`; PK, unique idempotency per decision, status checks. Indefinite retention.

### 3.4 Sessions and agenda (`0010_sessions_and_agenda.sql`)

#### `sessions`

`id`, organization/event, `title`, `description`, `status`, `content_status?`, `duration_minutes`, `capacity_required`, `room_id?`, `format_id?`, `level_id?`, `version`, timestamps, created/updated by.

PK/FKs/common; status FK `(organization_id,event_id,status)` to active/inactive `session_statuses.value` uses `RESTRICT`; room/format/level `RESTRICT`; checks positive duration, nonnegative capacity/version, content enum. Indexes event/status, room, format, level, title; no hard delete: repository `deleteSession` inserts history/audit and either marks a reserved deleted status or physically deletes only if version=1 and no dependent rows. Contract default is tombstone via `deleted_at TEXT?` added to this table; list excludes deleted, restore clears it.

#### `session_tracks`, `session_tags`, `session_speakers`, `session_resources`

Tracks/tags: organization/event/session + referenced ID + `ordinal`; PK session+ID, unique ordinal, both FKs `CASCADE/RESTRICT`; reverse filter indexes. Speakers: `speaker_id`, `display_name?`, `role?`, ordinal; FK participant `RESTRICT`; index speaker/event. Resources: `resource_id`, ordinal; source may be portal/file resource, polymorphic repository validation; index resource.

#### `session_history`

`id`, organization/event, `entity_type`, `entity_id`, `action`, `version`, `actor_id`, `actor_label?`, `occurred_at`, `prior_status?`, `new_status?`, `prior_content_status?`, `new_content_status?`, `snapshot_json J?(object)`.

PK; checks resource/action/content enums/version; unique `(organization_id,event_id,entity_type,entity_id,version,action,id)`; index entity/version desc and event/time. Immutable.

#### Agenda root tables

`agenda_states`: `organization_id`, `event_id`, `state_version`, `time_zone`, `minimum_travel_minutes`, `current_published_revision_id?`, `created_at`, `updated_at`; PK event; FK event `CASCADE`; checks positive/nonnegative; current revision FK is deferred/repository-validated to avoid cycle.

`agenda_drafts`: organization/event, `version`, `time_zone`, `updated_at`, `updated_by`; PK event; FK state `CASCADE`; positive version.

`agenda_entries`: `id`, organization/event, `container_type TEXT!`, `container_id TEXT!`, `session_id`, `room_id`, `starts_at`, `ends_at`, `starts_at_local`, `ends_at_local`, `time_zone`, public metadata scalar fields and `speaker_names_json J!(array)`; PK `(organization_id,event_id,container_type,container_id,id)`; check container `draft|revision|suggestion_base|suggestion_proposed`, end>start; FKs session/room `RESTRICT`; indexes container/order, session/time, room/time. `agenda_entry_tracks` is the corresponding join with ordinal.

`agenda_warning_overrides`: organization/event, `draft_version`, `warning_id`, `reason`, `actor_id`, `created_at`; PK event+draft+warning; FK draft event `CASCADE`; immutable per draft.

`agenda_revisions`: `id`, organization/event, `revision_number`, `source_draft_version`, `time_zone`, `published_at`, `published_by`, `rollback_of_revision_id?`, `source_hash TEXT!`; PK; unique event revision number; self FK `RESTRICT`; index event/revision desc. Immutable/indefinite.

`agenda_suggestion_runs`: `id`, organization/event, `version`, `status`, base versions, criteria JSON object, diff JSON object, diagnostics JSON object, generated timestamps/by, regeneration parent?, accepted/applied change IDs JSON arrays, rejection/superseded/applied fields; PK; self FK; checks status/version; indexes event/status/time. `agenda_suggestion_changes`: run + `id`, kind, entry/session IDs, before/after JSON, summary/rationale; PK, kind check. Retain indefinitely.

`agenda_outbox_events`: `id`, organization/event, `revision_id`, `type`, `idempotency_key`, `created_at`; PK; FK revision `RESTRICT`; unique event/idempotency; type registry check; index event/time. This records domain publication intent; external processing still uses generic `outbox_jobs`.

### 3.5 Content, communications, CRM (`0011_content_communications_crm.sql`)

#### Communication tables

`communication_templates`: `id`, organization/event, `version`, `name`, `purpose`, `status`, `sender`, `subject`, `html`, `text`, `variables_json J!(array)`, `created_by`, `created_at`, `updated_at`, `approved_by?`, `approved_at?`; PK `(id,version)`, unique tenant/event/id/version, checks enums/version/approval consistency; index event/purpose/status/version desc. Versions immutable once approved; saving draft may update exact draft version only through CAS at service level.

`communication_recipients`: `id`, organization/event, `participant_id?`, `email COLLATE NOCASE`, `display_name`, `data_json J!(object)`, `updated_at`; PK; optional participant FK; unique tenant/event/id; indexes event/email and participant. `communication_recipient_audiences`: recipient + audience, composite PK, audience check and reverse index.

`communication_previews`: `id`, organization/event, purpose/template/version/audience, render data JSON, counts, subject/html/text, created_by/at, expires_at; PK, FKs template, checks purpose/audience. `communication_preview_recipients`: preview+ordinal plus immutable recipient ID/participant/email/name/audiences/data and rendered subject/html/text; PK preview+recipient, unique ordinal. Hard-delete preview and children after expiry + 7 days.

`communication_sends`: `id`, organization/event, purpose, audience?, template ID/version, idempotency_key, preview_id?, data JSON, status, recipient/queued/delivered/failed counts, `terminal B!`, template snapshot scalar/JSON, created_by/at/updated_at; PK; unique `(organization_id,event_id,idempotency_key)`; FKs template/preview `RESTRICT/SET NULL`; checks status/counts. Index event/status/time.

`communication_send_recipients`: send+recipient ID, participant ID, email, display name, audiences/data snapshots; PK and email index. `communication_deliveries`: send+recipient, status, provider message ID?, failure reason?, attempts; PK; partial unique provider ID; status/count checks. `communication_delivery_history`: send+recipient+ordinal, `id`, status, occurred, provider ID?, reason?, actor; PK, unique ID. All sends/snapshots/history retained 2 years minimum, then only policy purge that preserves aggregate `audit_events`.

#### CRM tables

`crm_contacts`: `id TEXT!`, `organization_id TEXT!`, `first_name TEXT?`, `last_name TEXT?`, `display_name TEXT!`, `email TEXT? COLLATE NOCASE`, `phone TEXT?`, `company TEXT?`, `title TEXT?`, `website TEXT?`, `linkedin_url TEXT?`, `notes TEXT?`, `custom_fields_json J!(object)`, `source TEXT!`, `status TEXT!`, `merged_into_id TEXT?`, `merge_audit_id TEXT?`, `merged_at TEXT?`, `merge_source_ids_json J!(array)`, `pipeline_stage TEXT!`, `version INTEGER!`, `created_at TEXT!`, `updated_at TEXT!`. PK; FK organization `CASCADE`; self merge FK `(organization_id,merged_into_id) REFERENCES crm_contacts(organization_id,id) ON DELETE RESTRICT`; unique `(organization_id,id)`; partial unique `(organization_id,email) WHERE email IS NOT NULL AND status='active'`; checks source/status/stage/version and `(status='merged') = (merged_into_id IS NOT NULL AND merged_at IS NOT NULL)`. Indexes `(organization_id,status,pipeline_stage,updated_at DESC)`, `(organization_id,company,status)`, `(organization_id,email)`, `(organization_id,merged_into_id)`.

`crm_contact_tags`: organization/contact/tag text; PK; reverse index tag/contact.

`crm_segments`: `id`, organization, name, description?, rules JSON array, merge audit IDs JSON array, created_by, version/timestamps; PK; unique org/name; version check; index org/name. Hard delete allowed by CAS; command receipts retain result snapshot.

`crm_history`: `id TEXT!`, `organization_id TEXT!`, `contact_id TEXT!`, `kind TEXT!`, `event_id TEXT?`, `session_id TEXT?`, `title TEXT!`, `detail TEXT?`, `occurred_at TEXT!`, `metadata_json J!(object)`. PK; FK contact `(organization_id,contact_id) ... ON DELETE RESTRICT`; event/session identifiers are retained as historical scalar IDs rather than nulled; kind check. Indexes `(organization_id,contact_id,occurred_at DESC)`, `(organization_id,event_id,occurred_at DESC)`, `(organization_id,session_id,occurred_at DESC)`. Immutable.

`crm_pipeline_history`: `id TEXT!`, `organization_id TEXT!`, `contact_id TEXT!`, `source_crm_contact_id TEXT!`, `merge_audit_id TEXT?`, `from_stage TEXT?`, `to_stage TEXT!`, `note TEXT?`, `actor_id TEXT!`, `created_at TEXT!`. PK; contact/source contact FKs `RESTRICT`; stage checks. Indexes `(organization_id,contact_id,created_at DESC)`, `(organization_id,source_crm_contact_id,created_at DESC)`. Immutable.

`crm_notes`: `id TEXT!`, `organization_id TEXT!`, `contact_id TEXT!`, `source_crm_contact_id TEXT!`, `merge_audit_id TEXT?`, `body TEXT!`, `author_id TEXT!`, `created_at TEXT!`. PK; contact/source contact FKs `RESTRICT`. Indexes `(organization_id,contact_id,created_at DESC)`, `(organization_id,source_crm_contact_id,created_at DESC)`. Immutable; redaction is audited replacement, not deletion.

`crm_participant_links`: `id`, organization/event, `participant_id`, `crm_contact_id`, `source_crm_contact_id?`, `merge_audit_id?`, `session_id?`, `role`, `note?`, `created_by`, timestamps; PK; FKs participant/contact/session `RESTRICT`; unique `(organization_id,event_id,participant_id)`; role check; indexes contact, event/session. Merge rewires `crm_contact_id` but preserves source.

`crm_outreach`: exact `CrmOutreachCommand` scalars including recipient/template/render snapshots, counters, terminal, provider ID/completion; PK; FK contact/event; unique org/idempotency; status/count checks; indexes org/status/time, contact/time, provider ID. Retain 2 years.

`crm_imports`: `id`, organization, counts, mapping/rows/contact IDs JSON arrays, `idempotent B!`, `idempotency_key?`, `plan_fingerprint?`, `preview B!`, created_at; PK; partial unique org/idempotency for committed nonpreview imports; counts checks. Preview rows expire after 7 days; committed receipts retain 2 years.

`crm_command_results`: `organization_id`, `command`, `idempotency_key`, `result_json J!`, `created_at`, `expires_at?`; PK tuple; index expiry. Merge/add-to-event/outreach receipts retained at least as long as referenced domain history, otherwise 2 years.

#### Generic audit extension

Existing `audit_events` gains nullable `event_id TEXT`, `resource_version INTEGER`, `before_json TEXT`, `after_json TEXT`; JSON validity checks require table rebuild if SQLite cannot add checks inline. Add indexes `(tenant_id,event_id,occurred_at DESC)` and `(tenant_id,event_id,resource_type,resource_id,occurred_at DESC)`. Domain-specific append/list audit methods map here unless a dedicated immutable history table is required by their return type.

### 3.6 Reports, remix, publication (`0012_reports_remix_publication.sql`)

#### `report_definitions`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `name TEXT!`, `description TEXT!`, `relationships_json J!(array)`, `fields_json J!(array)`, `order_json J!(array)`, `filters_json J!(array)`, `sort_json J!(array)`, `version INTEGER!`, `created_by TEXT!`, `created_at TEXT!`, `updated_at TEXT!`, `deleted_at TEXT?`; PK/FK/common; checks positive version. Indexes `(organization_id,event_id,deleted_at,name)`, `(organization_id,id,deleted_at)` for `findDefinition`. CAS delete sets `deleted_at`; no physical deletion while runs exist.

`report_definition_versions`: `definition_id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `version INTEGER!`, `snapshot_json J!(object)`, `created_at TEXT!`; PK `(definition_id,version)`, FK definition `RESTRICT`, unique `(organization_id,event_id,definition_id,version)`, positive version; index definition/version desc. Every create/update inserts the immutable snapshot in the same batch, so report runs remain reproducible after later definition updates/deletion.

#### `report_runs`

`id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `definition_id TEXT!`, `definition_version INTEGER!`, `requester_id TEXT!`, `format TEXT!`, `parameters_json J!(object)`, `requested_at TEXT!`, `completed_at TEXT!`, `file_name TEXT!`, `content_type TEXT!`, `body TEXT!`, `columns_json J!(array)`, `row_count INTEGER!`, `output_digest TEXT!`, `audit_json J!(object)`. PK; FK `(definition_id,definition_version)` to the retained definition version `RESTRICT`; checks format, positive definition version, nonnegative row count; indexes `(organization_id,event_id,definition_id,completed_at DESC)`, `(organization_id,event_id,completed_at DESC)`, `(organization_id,requester_id,completed_at DESC)`. Immutable. Body/artifact metadata retained 90 days; after purge set `body=''` and retain digest/audit/row count for 2 years.

#### `remix_candidates`

All scalar candidate fields plus original/candidate/provenance JSON objects and fields/changed-fields JSON arrays; PK; FKs event and parent candidate `RESTRICT`; source polymorphic validation; checks source/status/version/generation. Indexes event/status, source, parent. Retain indefinitely for provenance.

#### `content_revisions`

`id`, organization/event, source type/id/revision, fields JSON array, content JSON object, candidate ID, applied_by/at; PK; FK candidate `RESTRICT`; unique source revision and candidate; check source/revision. Immutable.

#### `remix_audit`

Exact `RemixAuditEntry`: ID, organization/event, candidate, actor, action, created, details JSON object; PK/FKs; action check; indexes candidate/time, event/time. Immutable.

#### `program_publication_states`

`organization_id`, `event_id`, `version`, `served_revision?`, `pending_revision?`, `pending_release_id?`, `updated_at`; PK event; FK event `CASCADE`; checks positive version and pending pair consistency. Index pending release.

#### `program_releases`

All `ProgramPublicationManifest` fields as scalar columns: ID, organization/event, revision, lifecycle, agenda/speaker projection IDs/revisions/hashes, approved content/profile/released asset revisions, actor/published, parent served/rollback target/cache revision, source trigger, failure reason. PK; unique event revision and IDs; lifecycle/trigger checks; pending/served/failed consistency. Index event/lifecycle/revision desc and parent/rollback. Immutable except lifecycle/failure completion under publication CAS.

#### `program_agenda_projections`, `program_agenda_projection_entries`

Projection: ID, organization/event, revision number, source hash, created_at; PK, unique event/revision/hash. Entries contain projection ID, ID/session ID, title/summary/format/times/time zone/room, track/speaker names JSON and track IDs JSON, status, ordinal; PK projection+id, unique ordinal. Immutable.

#### `program_speaker_projections`, `program_speaker_projection_entries`

Projection columns: `id TEXT!`, `organization_id TEXT!`, `event_id TEXT!`, `revision_number INTEGER!`, `source_hash TEXT!`, `created_at TEXT!`; PK, unique `(organization_id,event_id,revision_number)` and `(organization_id,event_id,source_hash)`, positive revision, event/revision index. Entries: `projection_id TEXT!`, `id TEXT!`, `participant_id TEXT!`, `session_ids_json J!(array)`, `display_name TEXT!`, `title TEXT?`, `company TEXT?`, `bio TEXT?`, `avatar_url TEXT?`, `ordinal INTEGER!`; PK `(projection_id,id)`, FK projection `CASCADE`, unique `(projection_id,ordinal)`, nonnegative ordinal, index participant. Immutable. Projection rows are the sanitized public boundary and are retained while any release references them.

### 3.7 Webhooks and Airtable sync (`0013_webhooks_and_airtable_sync.sql`)

#### Customer webhooks

`webhook_subscriptions`: `id`, organization, event_id?, endpoint_url, events_json array, active boolean, signing_secret_ciphertext, signing_secret_last_four, timestamps; PK/FKs; index organization/event/active. Deletion is hard only after pending deliveries are terminal; otherwise set inactive then purge after 30 days.

`webhook_deliveries`: `id`, organization, subscription_id, event_id (provider event application ID), event_type, occurred_at, event_data_json, resource_type/id?, status, attempt_count, next_attempt_at?, last response fields, created/completed, `lease_owner?`, `lease_token?`, `lease_expires_at?`; PK; FK subscription `CASCADE`; unique `(subscription_id,event_id)`; checks status/count/lease tuple. Index due `(status,next_attempt_at,created_at)` and organization/time.

`webhook_delivery_failures`: delivery ID + attempt, attempted/status/error/body/retryable; PK; FK delivery `CASCADE`; ordered index. Delivery/failures retained 90 days after terminal, then audit summary 2 years.

#### `airtable_connections`

`id TEXT!`, `organization_id TEXT!`, `status TEXT!`, `auth_mode TEXT!`, `credential_reference TEXT?`, `airtable_user_id TEXT?`, `airtable_account_id TEXT?`, `base_id TEXT?`, `base_name TEXT?`, `granted_scopes_json J!(array)`, `access_token_expires_at TEXT?`, `refresh_token_expires_at TEXT?`, `connection_version INTEGER!`, `refresh_owner TEXT?`, `refresh_token TEXT?`, `refresh_lease_expires_at TEXT?`, `last_schema_check_at TEXT?`, `last_success_at TEXT?`, `last_error_code TEXT?`, `last_error TEXT?`, `created_at TEXT!`, `updated_at TEXT!`, `disconnected_at TEXT?`.

PK; FK organization `CASCADE`; auth `oauth|pat`, status check, version positive, refresh lease tuple all null/all present. Partial unique one nondisconnected connection per organization; unique `(organization_id,id)`. Index org/status and refresh lease. Disconnect increments version, removes credential reference locally, cancels work; retain metadata 2 years, credentials none after disconnect.

#### `airtable_oauth_attempts`

`id`, organization, `initiating_user_id`, `connection_id`, `state_hash`, `pkce_verifier_ciphertext`, `return_path`, `callback_code_hash?`, `status`, `exchange_owner?`, `exchange_token?`, `exchange_lease_expires_at?`, `attempt_version`, `expires_at`, `consumed_at?`, `result_redirect?`, `error_code?`, timestamps.

PK; FKs user `CASCADE`, connection `CASCADE`; unique state hash; checks status/version, ten-minute expiry enforced by command, exchange tuple, consumed result. Index expiry/status and connection. Purge verifier/code at terminal; retain redacted receipt 30 days.

#### `airtable_projection_configs`

`id`, organization, connection, `entity_type`, `table_id`, `table_name`, `enabled B!`, `preset`, `schema_version`, `field_mapping_json J!(object)`, `inbound_fields_json J!(array)`, `conflict_policy`, `projection_version`, timestamps.

PK; FK connection `CASCADE`; unique connection/entity; unique connection/table ID where enabled only if one entity per table; checks version/conflict `manual|d1_wins|airtable_wins` (initial release requires `manual`). Index enabled entities. Disable cancels unclaimed jobs; retain config until connection purge.

#### `airtable_record_mappings`

`id`, organization, connection, entity type/application ID, table/record ID, `last_exported_version?`, `last_exported_hash?`, `last_observed_hash?`, `last_exported_at?`, `mapping_version`, timestamps.

PK; FK connection `CASCADE`; unique `(connection_id,entity_type,application_id)` and `(connection_id,table_id,record_id)`; positive versions. Index application lookup and record lookup. Mapping survives archive/delete and reconciliation; purge only with connection after 2 years.

#### `airtable_sync_jobs`

`id`, organization, connection, `connection_version`, entity/application ID, `source_version`, operation, state, `deduplication_key`, `attempt_count`, `available_at`, `claim_owner?`, `claim_token?`, `lease_expires_at?`, `payload_json J!(object)`, `payload_hash`, `last_error_code?`, `last_error?`, timestamps, `completed_at?`.

PK; FK connection `CASCADE`; unique dedupe key exactly `<connection>:<entity>:<application-id>:<source-version>:<operation>`; checks operation/state/count/source version, claim tuple present iff claimed. Indexes claim `(state,available_at,connection_id)`, expired leases, entity/source version, connection/state. Terminal jobs 90 days; dead jobs 1 year; retain aggregate sync/audit facts 2 years.

#### `airtable_initial_export_checkpoints`

`connection_id`, `entity_type`, `cursor_application_id?`, `state TEXT!`, `scanned_count`, `enqueued_count`, `started_at`, `updated_at`, `completed_at?`; PK connection/entity; state `pending|running|completed|failed`; counts nonnegative. FK connection `CASCADE`. Retain latest checkpoint per entity.

#### Inbound webhook tables

`airtable_webhook_registrations`: ID/org/connection, provider webhook ID?, encrypted MAC secret?, expiration?, specification hash, status, refresh owner/token/lease?, registration version, timestamps; unique connection/provider webhook; checks status/lease/version. Index expiry/status.

`airtable_webhook_notifications`: ID/org/connection/registration, provider notification ID?, raw-body hash, time bucket, `raw_body TEXT!`, content MAC, status, received/processed; unique provider ID when present, otherwise `(registration_id,raw_body_hash,time_bucket)`; bounded body enforced by endpoint. Retain raw body 30 days, digest/status 1 year.

`airtable_webhook_cursors`: registration PK, `next_cursor`, row version, claim owner/token/lease?, last fetch, reconciliation required boolean; claim tuple check/version. Index lease expiry.

`airtable_inbound_changes`: ID/org/connection/registration, base transaction number, table/record/field IDs, entity/application ID?, source value JSON, source hash, state, attempt count, available, claim tuple, last error, timestamps/completed; unique `(registration_id,base_transaction_number,table_id,record_id,field_id)`; state/lease checks. Index due, record, entity.

`airtable_sync_conflicts`: ID/org/connection/entity/application/field, source transaction, D1 version/value JSON, Airtable value JSON, status, resolution?, resolver ID?, detected/resolving/resolved times, resolution command ID?; partial unique unresolved tuple `(connection_id,entity_type,application_id,field_id)` where status in open/resolving; resolution `use_d1|use_airtable|manual`; indexes status/time and entity. Retain 2 years after resolution.

## 4. Repository-method to transaction/table mapping

`R` is a read-only query. `CAS` is one D1 batch containing root/join/history changes as applicable. `AC` means the mutation is a consequential atomic command and must additionally insert `audit_events` and zero-or-more deduplicated `airtable_sync_jobs` for every enabled projection in the **same** `D1Database.batch()`.

### EventRepository

| Method | Mapping |
| --- | --- |
| `getEvent` | R `events` + `event_embed_configurations` by organization/event. |
| `listEvents` | R `events` by organization, then bounded embeds. |
| `findEventBySlug` | R unique organization/slug index + embeds. |
| `saveEvent` | AC/CAS `events` and replace embed rows; insert event audit and event sync job. Null expected version is insert-only. |
| `appendAudit` | Insert `audit_events` only; retained for compatibility, but services must use atomic save command for mutations. |
| `listAudit` | R `audit_events` by tenant/event/resource type `event`. |

### CfpRepository and SubmissionReviewSource

| Method | Mapping |
| --- | --- |
| `getEvent`, `getEventBySlug` | R CFP columns in `events`. |
| `saveEvent` | AC/CAS CFP columns in `events`; audit + event sync. |
| `getForm`, `listForms`, `listFormsByIds` | R `cfp_forms`, sections, fields, rules. IDs list is tenant-qualified after root load. |
| `saveForm` | AC/CAS form root; replace sections/fields/rules; audit + form sync. |
| `getReusableField` | R exact `reusable_fields` PK. |
| `getSubmission` | R submission + answers + participant links/participants + secondary contacts. |
| `countOwnedSubmissions` | R covering owner/form/event index, excluding no statuses (all owned submissions count as current service does). |
| `saveSubmissionVersion` | AC/CAS submission aggregate; insert immutable `submission_versions`; optional supplied audit is in same batch; submission/participant sync jobs. |
| `getOrganizerSubmissionsReadModel`, `listSubmissionsForEvent` | R event submission roots with bounded joins; no Airtable. |
| `getSubmissionForReview`, `getSubmissionsForReview` | R submissions/answers/participants/assets using tenant/event lookup tuples; projection/redaction remains service logic. |

### EvaluationRepository

| Method | Mapping |
| --- | --- |
| `getPlan`, `listPlans` | R plans + rounds/rubrics/criteria/options/pools. |
| `putPlan` | AC/CAS plan aggregate and immutable revised round/rubric rows; audit + plan sync. |
| `getAssignment`, `listAssignments` | R assignments by tenant/plan. |
| `replaceAssignment` | AC: CAS old assignment to superseded, insert successor, set lineage both directions; reviews untouched; one audit plus jobs for both assignments. |
| `applyAssignmentDistribution` | AC: validate every expected active version, supersede removed assignments, insert desired assignments, preserve reviews/history; all-or-nothing audit/jobs. |
| `getReview`, `listReviews`, workspace record methods | R reviews/scores/evidence joined to assignments/plans and submissions. |
| `putReview` | AC/CAS review and replace score/evidence rows; audit + review sync if configured. |
| `saveReviewDraft` | AC: CAS assignment `assigned→in_progress` as needed and insert/CAS review+scores together; audit/jobs. |
| `submitReview` | AC: CAS assignment and review to submitted with submitted timestamp; audit/jobs. |
| `getConflict` | R `evaluation_conflicts` unique assignment. |
| `abstainAssignment` | AC: CAS assignment to abstained + insert conflict; audit/jobs. |
| `getSuggestion`, `listSuggestions` | R suggestion/candidates/history. |
| `putSuggestion` | AC/CAS suggestion aggregate; audit + suggestion sync if enabled. |
| `resolveSuggestion` | AC: CAS suggestion; optional assignment CAS; optional review insert/CAS and score replacement; history/audit/jobs together. Reject may touch suggestion only. |
| `getDecision` | R unique plan/submission decision + transitions. |
| `putDecision` | AC/CAS decision + append transition by idempotency key; audit + decision, submission-outcome, and communication-trigger sync jobs. |

### SessionRepository

All getters/lists read their root and joins/history. All `put*` methods are AC/CAS root plus aggregate joins/history + audit + corresponding sync job. `deleteSession` tombstones `sessions.deleted_at`; `deleteRoom/Track/Format/Level/Tag` are version-qualified hard deletes that fail under `RESTRICT`, with audit and archive/delete sync job in the same batch. `putSettings` reconciles `session_settings` and `session_statuses` atomically. `appendAudit` is compatibility-only; `listAudit` reads `audit_events`. `listSpeakerIds` reads event `participants`/active `speaker_roster`.

### SpeakerRepository (including every optional store)

| Method family | Mapping |
| --- | --- |
| `getAccessScope`, `getOrganizerAccessScope`, portal scope/context methods | R existing `participant_grants`, `organization_memberships`, `portal_contexts` and scope joins. No business mutation. |
| submission methods / organizer read model | R CFP submission/participant/roster tables plus requested profile/task/asset joins. |
| profile create/get/update/ensure/biography | AC/CAS `speaker_profiles`; ensure also resolves/creates participant only under organization/event uniqueness; audit + speaker sync. |
| participant resolution | AC on `participants` and affected links/profile under unique normalized-email/source constraints; audit + participant/speaker sync. Ambiguity inserts no duplicate resolved identity. |
| task create/update aliases and gets/lists | AC/CAS `speaker_tasks` plus dependencies/offsets; reads task aggregate. Both alias names call the same implementation. |
| `transitionTask` | AC CAS task status + insert `speaker_task_transitions`; audit + task sync. |
| asset create/get/list/history/finalize | AC/CAS `speaker_assets`; object metadata immutable; family pointers and final state change together; audit + asset sync. |
| asset review aliases | AC CAS review version/pointers + audit. Release additionally emits publication rebuild/outbound facts and Airtable job in same D1 batch. |
| asset audit append/list | Insert/read `audit_events` filtered `speaker_asset`; consequential asset commands must not call append separately. |
| roster list/save/revoke | R or AC/CAS `speaker_roster`; revoke status, never delete; audit + speaker sync. |
| task form/response methods | R immutable form versions/responses; response save AC insert next version + task/audit/job updates if status changes. |
| asset comment list/create | R or AC insert comment + asset audit + asset job. |
| event resource/wiki methods | R resource tables. Their authoring command (outside current interface) must be AC. |
| generic and typed content methods | All aliases route to `speaker_content`/history. Update/restore is AC CAS current content + append history + audit + session/speaker sync. |
| reminder get/save | R/insert `speaker_reminder_receipts`; unique idempotency returns existing row. Delivery outbox remains separate and can join the same service command batch when queued. |

### AgendaRepository

`load` reads `agenda_states`, catalog roots, draft/entries/overrides, revisions, outbox, audit, suggestion runs/changes. `compareAndSwap` is AC: the Durable Object admits/serializes the command, then one D1 batch predicates `agenda_states.state_version`, updates root/draft, replaces mutable draft/catalog projections, inserts immutable revisions/suggestions/outbox/audit, and adds agenda/session Airtable sync jobs. D1 is authoritative; the Durable Object writes only a recoverable success receipt after D1 commit.

### ProgramPublicationRepository

`getState` reads publication state + releases and selected projections. `compareAndSwap` is AC/CAS `program_publication_states`, inserts/updates release lifecycle, immutable projections, publication audit, cache/outbox intent, and Airtable jobs. Pending→served/failed and rollback are version-qualified. A served release and its projections cannot be deleted.

### CommunicationRepository

| Method | Mapping |
| --- | --- |
| template list/get | R versioned templates; omitted version selects max version. |
| `saveTemplate` | AC insert next template version or validated draft update; audit + template sync. |
| recipient list/get | R recipient/audience joins; audience authorization is an `EXISTS` against configured event audiences. |
| preview get/save | R/insert preview and immutable recipient snapshots in one batch; preview audit is included; no Airtable job unless preview projection explicitly exists (default none). |
| send find/get | R send aggregate by idempotency or ID. |
| `saveSend` | AC insert/CAS send, recipient snapshots, deliveries/history, audit, generic communications outbox jobs, and Airtable send job if configured. Provider send is after commit. |

`ReminderRepository` continues to use existing `reminder_runs`/`reminder_dispatches`; inserts/updates are CAS/unique operations. A run creation with dispatches and generic communication outbox rows must be one batch. Airtable sync is emitted only for configured reminder projections.

### ReportRepository

Definition methods read/CAS `report_definitions`; create/update/delete are AC with audit + definition sync. `findDefinition` uses tenant/id/deleted index. `listProgramRecords` is a read projection over sessions, participants/speakers, assignments/reviews; it never reads CRM or materializes a report table. Run methods insert/read immutable `report_runs`; `recordRun` is AC with audit + optional report-run sync.

### CrmRepository

| Method family | Mapping |
| --- | --- |
| contact list/get/email/save | Indexed R; AC/CAS contact + tags + pipeline/history supplied by command + contact sync. |
| segment list/get/save/delete | R or AC/CAS segment; delete tombstones through command receipt when referenced, otherwise hard delete; audit/sync. |
| history/pipeline/note list/append | Indexed R; append is AC with audit and contact sync when externally visible. Service compound commands must batch append with root mutation. |
| projection/link methods | R/AC `crm_participant_links`; save validates participant/contact/event and writes history/audit/jobs. |
| `reconcileContactMerge` | AC across survivor/tombstone contacts, links, notes, pipeline, segment rule snapshots, projections, merge history/audit and jobs. Any participant conflict aborts before writes; no partial merge. |
| outreach methods | insert/CAS/read `crm_outreach`; save command batches audit/history/generic communications outbox/Airtable job; provider call after commit. |
| import methods | committed import is AC across every contact/tag/history row + import receipt + one command result + audit/jobs; preview writes nothing or an expiring preview receipt only. |
| command-result methods | exact PK read/insert; duplicate key returns prior result only after request fingerprint validation by service. |

### RemixRepository and RemixContentGateway

Candidate getters/lists read `remix_candidates`; `saveCandidate` is AC/CAS with audit/job (the separate `appendAudit` is compatibility-only). Audit list reads `remix_audit`. Content gateway reads sessions/speaker content. `applyRevision` is AC: CAS source revision, update source/join rows, insert `content_revisions`, CAS candidate to applied, insert remix+domain audit, and enqueue source/candidate Airtable jobs together.

### ReviewerPoolRepository

`getReviewerPool` reads `reviewer_pools` + members. `saveReviewerPool` is AC/CAS pool and replaces members; audit + review-plan job. It is the same physical round pool consumed by EvaluationRepository, not a duplicate member-domain table.

### WebhookRepository

Subscription methods CRUD `webhook_subscriptions`; secret rotation is CAS and audited. `createDelivery` uses unique `(subscription_id,event_id)` and returns existing on conflict atomically. `claimDueDelivery` conditionally updates one due row to delivering with immutable lease token. Completion methods require delivering status and matching internal claim token (the implementation may keep token outside the provider-neutral method argument in repository claim context), append failure rows as needed, and transition atomically. No Airtable job is generated for webhook operational state.

## 5. Atomic domain command requirements

The current interfaces sometimes expose `save` and `appendAudit` separately. D1 implementations must add/use command-level repository methods internally; a service must not sequence independent promises for consequential writes.

One `D1Database.batch()` must contain, in order:

1. all version predicates and domain root/child writes;
2. immutable domain history or transition rows;
3. one or more `audit_events` rows;
4. one `airtable_sync_jobs` insert per enabled affected projection, using `INSERT ... ON CONFLICT(deduplication_key) DO NOTHING`.

If any statement fails, **domain, history, audit, and all sync jobs roll back**. Queue send occurs only after batch success and carries only persisted job IDs. Queue failure does not roll back D1; the scheduled due-job sweeper recovers it.

Required compound commands include:

- event/CFP/settings aggregate replacement;
- submission version + audit;
- evaluation assignment replacement/distribution, review draft/submit/abstain, suggestion resolution, and decision transition;
- session/taxonomy/settings/content mutation;
- speaker profile/task/asset/roster/response/comment/content mutation;
- agenda CAS including revisions/suggestions/outbox;
- publication request/completion/failure/rollback;
- communication preview/send snapshot creation and delivery-state mutation;
- report definition/run;
- CRM import, add-to-event, outreach, pipeline/note, and especially complete contact merge/reconciliation;
- remix generate/regenerate/reject/apply;
- reviewer-pool replacement and webhook delivery creation/claim/completion.

Read-before-write validation may happen before the batch, but correctness cannot depend on it: the batch repeats version, uniqueness, ownership, and state predicates. A zero-row conditional update is a conflict and must prevent dependent inserts (use a guard statement or repository construction proven by rollback tests).

## 6. Airtable sync transaction/state mapping

- Domain batch creates absent→pending jobs only.
- Claim is one conditional update `pending|retry → claimed` where due, connection is connected, projection enabled, and connection version matches; it sets owner, random immutable token, and lease expiry.
- Success batches mapping upsert + `claimed→succeeded`, requiring owner/token/unexpired lease/connection version. Older source versions complete as stale no-ops. Equal version+hash is no-op. Equal version+different hash suspends config and creates reconciliation/conflict state.
- Retry/dead/cancel/reset transitions follow the approved state matrix and always predicate claim token/connection version.
- Disconnect increments `airtable_connections.connection_version`, clears credentials, and cancels pending/retry jobs in one batch. Claimed cancellation additionally predicates the captured connection version/token; late workers cannot complete.
- Initial export advances `airtable_initial_export_checkpoints` only after durable job insertion.
- Inbound notification receipt, cursor page persistence+advance, change claim/completion, and conflict resolution each use their own explicit atomic batch. External OAuth/token/Airtable calls never occur inside a D1 transaction.
- Conflict `use_d1`, `use_airtable`, or manual resolution executes a normal domain AC and resolves the conflict plus enqueues the fresh outbound version in that same batch.

## 7. Retention and purge summary

| Data | Minimum retention / deletion |
| --- | --- |
| active business roots | lifetime of organization; archive/tombstone by domain |
| submission/session/content/evaluation/agenda/publication versions, decisions, remix provenance | indefinite |
| generic/domain audit | indefinite unless an approved compliance policy supersedes it |
| communication sends/outreach/reminder receipts | 2 years; previews expiry + 7 days |
| report artifact body | 90 days; digest/audit metadata 2 years |
| private asset metadata | lifetime of object authorization plus 2 years; R2 object deletion does not delete audit metadata |
| webhook terminal deliveries | 90 days; aggregate audit 2 years |
| successful/cancelled Airtable jobs | 90 days; dead 1 year |
| Airtable mappings/config/connection metadata | connection lifetime + 2 years; credentials removed immediately on disconnect |
| OAuth terminal attempts | secrets immediately blanked; redacted row 30 days |
| webhook notification raw body | 30 days; digest/state 1 year |
| inbound changes/conflicts | changes 1 year; resolved conflicts 2 years |
| idempotency/command results | explicit expiry when safe, never earlier than referenced domain receipt |

Purges are bounded scheduled jobs, tenant-qualified, audit their counts, and never cascade into authoritative business rows.

## 8. Exhaustive interface method ledger

This ledger is a mechanical coverage aid. Each name below is governed by the detailed mapping in section 4; aliases on one line intentionally share one physical implementation.

| Interface | Covered methods |
| --- | --- |
| `EventRepository` | `getEvent`, `listEvents`, `findEventBySlug`, `saveEvent`, `appendAudit`, `listAudit` |
| `ProgramPublicationRepository` | `getState`, `compareAndSwap` |
| `CfpRepository` | `getEvent`, `getEventBySlug`, `saveEvent`, `getForm`, `listFormsByIds`, `listForms`, `saveForm`, `getReusableField`, `getSubmission`, `countOwnedSubmissions`, `saveSubmissionVersion`, `getOrganizerSubmissionsReadModel`, `listSubmissionsForEvent` |
| `SubmissionReviewSource` | `getSubmissionForReview`, `getSubmissionsForReview` |
| `EvaluationRepository` | `getPlan`, `listPlans`, `putPlan`, `getAssignment`, `listAssignments`, `replaceAssignment`, `applyAssignmentDistribution`, `getReview`, `listReviews`, `getSuggestion`, `listSuggestions`, `putSuggestion`, `resolveSuggestion`, `listReviewerWorkspaceRecords`, `listOrganizerWorkspaceRecords`, `putReview`, `saveReviewDraft`, `getConflict`, `abstainAssignment`, `submitReview`, `getDecision`, `putDecision` |
| `SessionRepository` | `getSession`, `listSessions`, `putSession`, `deleteSession`, `getRoom`, `listRooms`, `putRoom`, `deleteRoom`, `getTrack`, `listTracks`, `putTrack`, `deleteTrack`, `getFormat`, `listFormats`, `putFormat`, `deleteFormat`, `getLevel`, `listLevels`, `putLevel`, `deleteLevel`, `getTag`, `listTags`, `putTag`, `deleteTag`, `getSettings`, `putSettings`, `appendAudit`, `listAudit`, `listSpeakerIds` |
| `SpeakerRepository` | `getAccessScope`, `getOrganizerAccessScope`, `listSubmissions`, `getOrganizerReadModel`, `getSubmission`, `listProfiles`, `createProfile`, `getProfile`, `updateBiography`, `updateProfile`, `resolveEventParticipant`, `ensureOrganizerSpeakerProfile`, `listTasks`, `createTask`, `createSpeakerTask`, `updateTask`, `updateSpeakerTask`, `getTask`, `getTasksByIds`, `transitionTask`, `createPendingAsset`, `getAsset`, `listAssets`, `finalizeAsset`, `reviewAsset`, `updateAssetReview`, `appendAssetAudit`, `listAssetAudit`, `listPortalContexts`, `listPortalContextScopes`, `listRoster`, `listRosterForEvent`, `saveRoster`, `revokeRoster`, `getTaskForm`, `listTaskResponses`, `saveTaskResponse`, `listAssetHistory`, `listAssetComments`, `createAssetComment`, `listEventResources`, `listWikiPages`, `getContent`, `listContentHistory`, `updateContent`, `restoreContentVersion`, `getSessionContent`, `getSpeakerContent`, `listSessionContentHistory`, `listSpeakerContentHistory`, `updateSessionContent`, `updateSpeakerContent`, `restoreSessionContentVersion`, `restoreSpeakerContentVersion`, `getReminder`, `saveReminder` |
| `AgendaRepository` | `load`, `compareAndSwap` |
| `CommunicationRepository` | `listTemplates`, `getTemplate`, `saveTemplate`, `listRecipients`, `getRecipientsByIds`, `isAudienceAuthorized`, `getPreview`, `savePreview`, `findSendByIdempotency`, `getSend`, `saveSend` |
| `ReminderRepository` | `getRun`, `listRuns`, `insertRun`, `updateRun`, `getDispatch`, `findDispatchByIdempotency`, `findDispatchByProviderMessageId`, `listDispatches`, `insertDispatch`, `updateDispatch` |
| `ReportDefinitionRepository` | `listDefinitions`, `getDefinition`, `createDefinition`, `updateDefinition`, `deleteDefinition`, `findDefinition` |
| `ReportDataRepository` | `listProgramRecords` |
| `ReportRunRepository` | `recordRun`, `getRun`, `listRuns` |
| `CrmRepository` | `listContacts`, `getContact`, `findContactByEmail`, `saveContact`, `listSegments`, `getSegment`, `saveSegment`, `deleteSegment`, `listHistory`, `appendHistory`, `listPipelineHistory`, `appendPipeline`, `listNotes`, `appendNote`, `getProjection`, `saveProjection`, `listProjections`, `listParticipantContactLinks`, `reconcileContactMerge`, `saveOutreach`, `updateOutreach`, `getOutreachByIdempotencyKey`, `listOutreach`, `saveImport`, `getImportByIdempotencyKey`, `getCommandResult`, `saveCommandResult` |
| `RemixRepository` | `getCandidateById`, `getCandidate`, `listCandidates`, `saveCandidate`, `appendAudit`, `listAudit` |
| `RemixContentGateway` | `listSessions`, `listSpeakers`, `getSession`, `getSpeaker`, `applyRevision` |
| `ReviewerPoolRepository` | `getReviewerPool`, `saveReviewerPool` |
| `WebhookRepository` | `listSubscriptions`, `getSubscription`, `createSubscription`, `updateSubscription`, `deleteSubscription`, `createDelivery`, `claimDueDelivery`, `markDeliverySucceeded`, `markDeliveryRetry`, `markDeliveryFailed` |

## 9. Legacy Airtable inventory disposition

Every current Airtable model has an explicit migration destination; current table names are not copied into D1 merely for compatibility.

| Existing Airtable table(s) | D1 destination/disposition |
| --- | --- |
| Organizations, Memberships | Existing `organizations`, `organization_memberships`; identity/roles remain D1-owned. |
| Events, Embed Configurations | `events`, `event_embed_configurations`. |
| CFP Forms, Reusable Fields | `cfp_forms`, sections/fields/rules, `reusable_fields`. |
| Submissions, Participants | `submissions`, answers/versions/secondary contacts, `participants`, `submission_participants`. |
| Speaker Profiles, Session Roster, Portal Contexts | `speaker_profiles`, `speaker_roster`, `portal_contexts` and scope joins. |
| Review Plans, Review Assignments, Evaluations, Decisions | normalized `review_*`, `evaluation_*` and decision tables. |
| Speaker Tasks, Task Forms, Task Responses | `speaker_tasks`, dependencies/reminder offsets/transitions, forms/responses. |
| Sessions, Rooms, Tracks, Formats, Levels, Tags, Session Statuses, Session Settings | corresponding program/session root and join tables. |
| Agenda Versions, Agenda Entries, Publication Outbox | agenda state/draft/revision/entry/outbox/suggestion tables. |
| Published Speaker Projections, Program Releases | `program_speaker_projections`/entries and publication state/releases; agenda projections are normalized similarly. |
| Audit Records | existing extended `audit_events` plus immutable domain histories. |
| Portal Resources, Wiki Pages | `speaker_event_resources`, `speaker_wiki_pages`. |
| File Assets, Asset Families, File Versions, File Comments | `speaker_assets` uses `version_family_id` and explicit latest/current/approved/released pointers; immutable asset rows are versions; comments are `speaker_asset_comments`. No duplicate family table is required. |
| Email Templates, Email Send Snapshots | versioned communication templates, previews, sends, recipients, deliveries/history. |
| Report Definitions, Report Runs | `report_definitions`, immutable definition versions, `report_runs`. |
| Remix Candidates, Remix Audit | `remix_candidates`, `content_revisions`, `remix_audit`. |
| CRM Contacts, CRM Segments, CRM History, CRM Pipeline, CRM Notes | corresponding normalized CRM tables and contact tags. |
| CRM Event Projections | `crm_participant_links`; participant identity remains immutable while contact link is rewired on merge. |
| CRM Outreach, CRM Imports, CRM Commands | `crm_outreach`, `crm_imports`, `crm_command_results`. |

The six initial outbound Airtable presets (`Events`, `Sessions`, `Speakers`, `Submissions`, `Speaker Tasks`, `CRM Contacts`) are generated from these D1 roots and mappings. Other legacy Airtable tables are import sources and may become optional projections only through an explicit `airtable_projection_configs` row.

## 10. Evidence coverage

This contract was derived from:

- provider-neutral interfaces: `features/events/types.ts`, `cfp/service.ts`, `evaluations/repository.ts`, `sessions/types.ts`, `speaker/types.ts`, `agenda/types.ts`, `communications/types.ts`, `reports/types.ts`, `crm/types.ts`, `remix/types.ts`, `members/types.ts`, and `integrations/webhooks/types.ts`;
- domain entity/status shapes in the corresponding models/types;
- all 53 existing Airtable table definitions in `scripts/airtable/provision.mjs`, treated as migration inputs rather than a schema to reproduce blindly;
- current D1 conventions and retained operational tables in migrations `0001` through `0006`;
- the approved D1 authority, atomic command, OAuth, outbound job, inbound webhook, retention, and forward-only migration decisions in `.omo/plans/d1-airtable-adapter.md`.

Every repository method in the approved prerequisite list is mapped above, including compound evaluation operations, all optional SpeakerRepository stores and aliases, agenda versions/suggestions/outbox, program publication handoffs, communication recipient/template snapshots, CRM merge/import/outreach receipts, report/remix state, reviewer pools, and customer webhooks.
