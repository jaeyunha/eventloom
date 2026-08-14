PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  organization_id TEXT NOT NULL PRIMARY KEY
) STRICT;

CREATE TABLE events (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  UNIQUE (organization_id, id)
) STRICT;

CREATE TABLE participants (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  UNIQUE (organization_id, event_id, id)
) STRICT;

CREATE TABLE submissions (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, event_id, id)
) STRICT;

CREATE TABLE speaker_tasks (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  UNIQUE (organization_id, event_id, id)
) STRICT;

CREATE TABLE speaker_assets (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  submission_id TEXT,
  participant_id TEXT NOT NULL,
  task_id TEXT,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL,
  version_family_id TEXT NOT NULL,
  supersedes_asset_id TEXT,
  comment_thread_id TEXT NOT NULL,
  review_state TEXT,
  review_note TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_version INTEGER NOT NULL,
  latest_version_id TEXT,
  current_version_id TEXT,
  approved_version_id TEXT,
  released_version_id TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  FOREIGN KEY (organization_id, event_id) REFERENCES events (organization_id, id),
  FOREIGN KEY (organization_id, event_id, submission_id)
    REFERENCES submissions (organization_id, event_id, id),
  FOREIGN KEY (organization_id, event_id, participant_id)
    REFERENCES participants (organization_id, event_id, id),
  FOREIGN KEY (organization_id, event_id, task_id)
    REFERENCES speaker_tasks (organization_id, event_id, id)
) STRICT;

CREATE TABLE submission_answers (
  organization_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  asset_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, submission_id, field_key),
  FOREIGN KEY (asset_id) REFERENCES speaker_assets (id)
) STRICT;

INSERT INTO organizations (organization_id) VALUES ('tenant-file');
INSERT INTO events (id, organization_id) VALUES ('event-file', 'tenant-file');
INSERT INTO submissions (id, organization_id, event_id)
VALUES ('submission-file', 'tenant-file', 'event-file');
