-- Durable calendar invitation identity, publication history, and delivery handoff.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS calendar_invitations (
  uid TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  organizer TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('REQUEST', 'UPDATE', 'CANCEL')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  ical TEXT NOT NULL,
  content_type TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  last_idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id) REFERENCES events(organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, event_id, session_id)
) STRICT;
CREATE INDEX IF NOT EXISTS calendar_invitations_event_state_idx
  ON calendar_invitations(organization_id, event_id, method, session_id);

CREATE TABLE IF NOT EXISTS calendar_invitation_publications (
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  uid TEXT NOT NULL REFERENCES calendar_invitations(uid) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  method TEXT NOT NULL CHECK (method IN ('REQUEST', 'UPDATE', 'CANCEL')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  ical TEXT NOT NULL,
  content_type TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, idempotency_key)
) STRICT;
CREATE INDEX IF NOT EXISTS calendar_invitation_publications_uid_sequence_idx
  ON calendar_invitation_publications(uid, sequence);
