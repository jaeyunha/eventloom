-- Sessions, normalized session joins/history, and versioned agenda state.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  content_status TEXT CHECK (content_status IN ('Approved', 'Needs changes')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  capacity_required INTEGER NOT NULL CHECK (capacity_required >= 0),
  room_id TEXT,
  format_id TEXT,
  level_id TEXT,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (organization_id, event_id) REFERENCES events(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, status) REFERENCES session_statuses(organization_id, event_id, value) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, room_id) REFERENCES rooms(organization_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, format_id) REFERENCES formats(organization_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, level_id) REFERENCES levels(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id)
) STRICT;
CREATE INDEX IF NOT EXISTS sessions_event_status_idx ON sessions(organization_id, event_id, status, deleted_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS sessions_room_idx ON sessions(organization_id, event_id, room_id, deleted_at);
CREATE INDEX IF NOT EXISTS sessions_format_idx ON sessions(organization_id, event_id, format_id, deleted_at);
CREATE INDEX IF NOT EXISTS sessions_level_idx ON sessions(organization_id, event_id, level_id, deleted_at);
CREATE INDEX IF NOT EXISTS sessions_title_idx ON sessions(organization_id, event_id, title, deleted_at);

CREATE TABLE IF NOT EXISTS session_tracks (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (organization_id, event_id, session_id, track_id),
  FOREIGN KEY (organization_id, event_id, session_id) REFERENCES sessions(organization_id, event_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, track_id) REFERENCES tracks(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, event_id, session_id, ordinal)
) STRICT;
CREATE INDEX IF NOT EXISTS session_tracks_track_idx ON session_tracks(organization_id, event_id, track_id, session_id);

CREATE TABLE IF NOT EXISTS session_tags (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (organization_id, event_id, session_id, tag_id),
  FOREIGN KEY (organization_id, event_id, session_id) REFERENCES sessions(organization_id, event_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, tag_id) REFERENCES tags(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, event_id, session_id, ordinal)
) STRICT;
CREATE INDEX IF NOT EXISTS session_tags_tag_idx ON session_tags(organization_id, event_id, tag_id, session_id);

CREATE TABLE IF NOT EXISTS session_speakers (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  speaker_id TEXT NOT NULL,
  display_name TEXT,
  role TEXT,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (organization_id, event_id, session_id, speaker_id),
  FOREIGN KEY (organization_id, event_id, session_id) REFERENCES sessions(organization_id, event_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, speaker_id) REFERENCES participants(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, event_id, session_id, ordinal)
) STRICT;
CREATE INDEX IF NOT EXISTS session_speakers_speaker_idx ON session_speakers(organization_id, event_id, speaker_id, session_id);

CREATE TABLE IF NOT EXISTS session_resources (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (organization_id, event_id, session_id, resource_id),
  FOREIGN KEY (organization_id, event_id, session_id) REFERENCES sessions(organization_id, event_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, event_id, session_id, ordinal)
) STRICT;
CREATE INDEX IF NOT EXISTS session_resources_resource_idx ON session_resources(organization_id, event_id, resource_id, session_id);

CREATE TABLE IF NOT EXISTS session_history (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('session', 'room', 'track', 'format', 'level', 'tag', 'settings')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'restored', 'approved', 'needs_changes', 'settings.updated')),
  version INTEGER NOT NULL CHECK (version > 0),
  actor_id TEXT NOT NULL,
  actor_label TEXT,
  occurred_at TEXT NOT NULL,
  prior_status TEXT,
  new_status TEXT,
  prior_content_status TEXT CHECK (prior_content_status IN ('Approved', 'Needs changes')),
  new_content_status TEXT CHECK (new_content_status IN ('Approved', 'Needs changes')),
  snapshot_json TEXT CHECK (snapshot_json IS NULL OR (json_valid(snapshot_json) AND json_type(snapshot_json) = 'object')),
  FOREIGN KEY (organization_id, event_id) REFERENCES events(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, event_id, entity_type, entity_id, version, action, id)
) STRICT;
CREATE INDEX IF NOT EXISTS session_history_entity_idx ON session_history(organization_id, event_id, entity_type, entity_id, version DESC, occurred_at DESC);
CREATE INDEX IF NOT EXISTS session_history_event_idx ON session_history(organization_id, event_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS agenda_states (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  state_version INTEGER NOT NULL CHECK (state_version > 0),
  time_zone TEXT NOT NULL,
  minimum_travel_minutes INTEGER NOT NULL CHECK (minimum_travel_minutes >= 0),
  current_published_revision_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, event_id),
  FOREIGN KEY (organization_id, event_id) REFERENCES events(organization_id, id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS agenda_drafts (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  time_zone TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (organization_id, event_id),
  FOREIGN KEY (organization_id, event_id) REFERENCES agenda_states(organization_id, event_id) ON DELETE CASCADE,
  UNIQUE (organization_id, event_id, version)
) STRICT;

CREATE TABLE IF NOT EXISTS agenda_entries (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  container_type TEXT NOT NULL CHECK (container_type IN ('draft', 'revision', 'suggestion_base', 'suggestion_proposed')),
  container_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  starts_at_local TEXT NOT NULL,
  ends_at_local TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  format TEXT NOT NULL,
  speaker_names_json TEXT NOT NULL CHECK (json_valid(speaker_names_json) AND json_type(speaker_names_json) = 'array'),
  room_name TEXT NOT NULL,
  track_names_json TEXT NOT NULL CHECK (json_valid(track_names_json) AND json_type(track_names_json) = 'array'),
  PRIMARY KEY (organization_id, event_id, container_type, container_id, id),
  FOREIGN KEY (organization_id, event_id, session_id) REFERENCES sessions(organization_id, event_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, room_id) REFERENCES rooms(organization_id, event_id, id) ON DELETE RESTRICT,
  CHECK (ends_at > starts_at),
  CHECK (ends_at_local > starts_at_local),
  CHECK ((container_type = 'draft' AND container_id = event_id) OR container_type <> 'draft')
) STRICT;
CREATE INDEX IF NOT EXISTS agenda_entries_container_idx ON agenda_entries(organization_id, event_id, container_type, container_id, starts_at, id);
CREATE INDEX IF NOT EXISTS agenda_entries_session_idx ON agenda_entries(organization_id, event_id, session_id, starts_at);
CREATE INDEX IF NOT EXISTS agenda_entries_room_idx ON agenda_entries(organization_id, event_id, room_id, starts_at);

CREATE TABLE IF NOT EXISTS agenda_entry_tracks (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  container_type TEXT NOT NULL,
  container_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (organization_id, event_id, container_type, container_id, entry_id, track_id),
  FOREIGN KEY (organization_id, event_id, container_type, container_id, entry_id) REFERENCES agenda_entries(organization_id, event_id, container_type, container_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, track_id) REFERENCES tracks(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, event_id, container_type, container_id, entry_id, ordinal)
) STRICT;
CREATE INDEX IF NOT EXISTS agenda_entry_tracks_track_idx ON agenda_entry_tracks(organization_id, event_id, track_id, container_type, container_id);

CREATE TABLE IF NOT EXISTS agenda_warning_overrides (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  draft_version INTEGER NOT NULL CHECK (draft_version > 0),
  warning_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, event_id, draft_version, warning_id),
  FOREIGN KEY (organization_id, event_id, draft_version) REFERENCES agenda_drafts(organization_id, event_id, version) ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS agenda_warning_overrides_draft_idx ON agenda_warning_overrides(organization_id, event_id, draft_version, created_at);

CREATE TABLE IF NOT EXISTS agenda_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  source_draft_version INTEGER NOT NULL CHECK (source_draft_version > 0),
  time_zone TEXT NOT NULL,
  published_at TEXT NOT NULL,
  published_by TEXT NOT NULL,
  rollback_of_revision_id TEXT,
  source_hash TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id) REFERENCES agenda_states(organization_id, event_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, rollback_of_revision_id) REFERENCES agenda_revisions(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id),
  UNIQUE (organization_id, event_id, revision_number),
  CHECK (rollback_of_revision_id IS NULL OR rollback_of_revision_id <> id)
) STRICT;
CREATE INDEX IF NOT EXISTS agenda_revisions_event_idx ON agenda_revisions(organization_id, event_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS agenda_revisions_source_draft_idx ON agenda_revisions(organization_id, event_id, source_draft_version);

CREATE TABLE IF NOT EXISTS agenda_suggestion_runs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'rejected', 'superseded', 'stale', 'applied')),
  base_draft_version INTEGER NOT NULL CHECK (base_draft_version > 0),
  base_draft_revision INTEGER NOT NULL CHECK (base_draft_revision > 0),
  criteria_json TEXT NOT NULL CHECK (json_valid(criteria_json) AND json_type(criteria_json) = 'object'),
  diff_json TEXT NOT NULL CHECK (json_valid(diff_json) AND json_type(diff_json) = 'object'),
  diagnostics_json TEXT NOT NULL CHECK (json_valid(diagnostics_json) AND json_type(diagnostics_json) = 'object'),
  generated_at TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  regeneration_of_run_id TEXT,
  accepted_change_ids_json TEXT NOT NULL CHECK (json_valid(accepted_change_ids_json) AND json_type(accepted_change_ids_json) = 'array'),
  applied_change_ids_json TEXT NOT NULL CHECK (json_valid(applied_change_ids_json) AND json_type(applied_change_ids_json) = 'array'),
  rejected_at TEXT,
  rejected_by TEXT,
  superseded_at TEXT,
  applied_at TEXT,
  applied_by TEXT,
  FOREIGN KEY (organization_id, event_id) REFERENCES agenda_states(organization_id, event_id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, event_id, regeneration_of_run_id) REFERENCES agenda_suggestion_runs(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id),
  CHECK (base_draft_revision = base_draft_version),
  CHECK (regeneration_of_run_id IS NULL OR regeneration_of_run_id <> id),
  CHECK ((status = 'rejected') = (rejected_at IS NOT NULL AND rejected_by IS NOT NULL)),
  CHECK ((status = 'applied') = (applied_at IS NOT NULL AND applied_by IS NOT NULL)),
  CHECK (status <> 'superseded' OR superseded_at IS NOT NULL)
) STRICT;
CREATE INDEX IF NOT EXISTS agenda_suggestion_runs_status_idx ON agenda_suggestion_runs(organization_id, event_id, status, generated_at DESC);
CREATE INDEX IF NOT EXISTS agenda_suggestion_runs_base_version_idx ON agenda_suggestion_runs(organization_id, event_id, base_draft_version, status);

CREATE TABLE IF NOT EXISTS agenda_suggestion_changes (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('add', 'move', 'change', 'remove')),
  entry_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR (json_valid(before_json) AND json_type(before_json) = 'object')),
  after_json TEXT CHECK (after_json IS NULL OR (json_valid(after_json) AND json_type(after_json) = 'object')),
  summary TEXT NOT NULL,
  rationale TEXT,
  PRIMARY KEY (organization_id, event_id, run_id, id),
  FOREIGN KEY (organization_id, event_id, run_id) REFERENCES agenda_suggestion_runs(organization_id, event_id, id) ON DELETE CASCADE,
  CHECK ((kind = 'add' AND before_json IS NULL AND after_json IS NOT NULL) OR (kind = 'remove' AND before_json IS NOT NULL AND after_json IS NULL) OR (kind IN ('move', 'change') AND before_json IS NOT NULL AND after_json IS NOT NULL))
) STRICT;
CREATE INDEX IF NOT EXISTS agenda_suggestion_changes_run_idx ON agenda_suggestion_changes(organization_id, event_id, run_id, id);
CREATE INDEX IF NOT EXISTS agenda_suggestion_changes_session_idx ON agenda_suggestion_changes(organization_id, event_id, session_id, run_id);

CREATE TABLE IF NOT EXISTS agenda_outbox_events (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('calendar.agenda-updated', 'embed-cache.invalidate', 'public-agenda.updated')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id, revision_id) REFERENCES agenda_revisions(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id),
  UNIQUE (organization_id, event_id, idempotency_key)
) STRICT;
CREATE INDEX IF NOT EXISTS agenda_outbox_events_event_idx ON agenda_outbox_events(organization_id, event_id, created_at DESC);
