PRAGMA foreign_keys = ON;

ALTER TABLE agenda_states
ADD COLUMN validated_draft_version INTEGER;

ALTER TABLE agenda_states
ADD COLUMN validated_at TEXT;

CREATE TRIGGER agenda_states_validation_marker_insert_guard
BEFORE INSERT ON agenda_states
WHEN
  (NEW.validated_draft_version IS NULL) <> (NEW.validated_at IS NULL)
  OR (NEW.validated_draft_version IS NOT NULL AND NEW.validated_draft_version <= 0)
  OR (NEW.validated_at IS NOT NULL AND length(trim(NEW.validated_at)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'invalid agenda validation marker');
END;

CREATE TRIGGER agenda_states_validation_marker_update_guard
BEFORE UPDATE OF validated_draft_version, validated_at ON agenda_states
WHEN
  (NEW.validated_draft_version IS NULL) <> (NEW.validated_at IS NULL)
  OR (NEW.validated_draft_version IS NOT NULL AND NEW.validated_draft_version <= 0)
  OR (NEW.validated_at IS NOT NULL AND length(trim(NEW.validated_at)) = 0)
BEGIN
  SELECT RAISE(ABORT, 'invalid agenda validation marker');
END;
