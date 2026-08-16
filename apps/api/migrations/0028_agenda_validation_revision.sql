PRAGMA foreign_keys = ON;

ALTER TABLE agenda_states
ADD COLUMN validated_draft_version INTEGER;

ALTER TABLE agenda_states
ADD COLUMN validated_at TEXT;
