PRAGMA foreign_keys = ON;

-- Keep the rollback-only lifecycle status and the public retirement tombstone
-- synchronized while older Workers may still write status.
UPDATE events
SET legacy_retired_at = CASE
  WHEN status = 'archived' THEN COALESCE(legacy_retired_at, updated_at)
  ELSE NULL
END
WHERE
  (status = 'archived' AND legacy_retired_at IS NULL)
  OR (status <> 'archived' AND legacy_retired_at IS NOT NULL);

CREATE TRIGGER IF NOT EXISTS events_retirement_sync_after_insert
AFTER INSERT ON events
WHEN
  (NEW.status = 'archived' AND NEW.legacy_retired_at IS NULL)
  OR (NEW.status <> 'archived' AND NEW.legacy_retired_at IS NOT NULL)
BEGIN
  UPDATE events
  SET
    status = CASE
      WHEN NEW.legacy_retired_at IS NOT NULL THEN 'archived'
      ELSE NEW.status
    END,
    legacy_retired_at = CASE
      WHEN NEW.status = 'archived' OR NEW.legacy_retired_at IS NOT NULL
        THEN COALESCE(NEW.legacy_retired_at, NEW.updated_at)
      ELSE NULL
    END
  WHERE organization_id = NEW.organization_id
    AND id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS events_retirement_sync_after_status_update
AFTER UPDATE OF status ON events
WHEN
  (NEW.status = 'archived' AND NEW.legacy_retired_at IS NULL)
  OR (NEW.status <> 'archived' AND NEW.legacy_retired_at IS NOT NULL)
BEGIN
  UPDATE events
  SET legacy_retired_at = CASE
    WHEN NEW.status = 'archived' THEN COALESCE(NEW.legacy_retired_at, NEW.updated_at)
    ELSE NULL
  END
  WHERE organization_id = NEW.organization_id
    AND id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS events_retirement_sync_after_marker_update
AFTER UPDATE OF legacy_retired_at ON events
WHEN
  (NEW.legacy_retired_at IS NOT NULL AND NEW.status <> 'archived')
  OR (NEW.legacy_retired_at IS NULL AND NEW.status = 'archived')
BEGIN
  UPDATE events
  SET status = CASE
    WHEN NEW.legacy_retired_at IS NOT NULL THEN 'archived'
    WHEN NEW.status = 'archived' THEN 'active'
    ELSE NEW.status
  END
  WHERE organization_id = NEW.organization_id
    AND id = NEW.id;
END;
