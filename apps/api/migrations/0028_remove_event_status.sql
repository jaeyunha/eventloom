PRAGMA foreign_keys = ON;

-- Product code no longer reads or writes event lifecycle status. The physical
-- columns remain temporarily so the previous Worker stays rollback-compatible.
ALTER TABLE events ADD COLUMN legacy_retired_at TEXT;

UPDATE events
   SET legacy_retired_at = updated_at
 WHERE status = 'archived';

UPDATE airtable_sync_jobs
   SET state = 'cancelled',
       claim_owner = NULL,
       claim_token = NULL,
       lease_expires_at = NULL,
       completed_at = COALESCE(completed_at, updated_at),
       last_error_code = COALESCE(last_error_code, 'event_status_removed'),
       last_error = COALESCE(last_error, 'Event archive projection retired.')
 WHERE entity_type = 'event'
   AND operation = 'archive'
   AND state IN ('pending','claimed','retry');
