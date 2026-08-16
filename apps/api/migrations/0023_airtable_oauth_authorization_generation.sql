PRAGMA foreign_keys = ON;

ALTER TABLE airtable_oauth_attempts
  ADD COLUMN authorization_connection_version INTEGER NOT NULL DEFAULT 1
  CHECK (authorization_connection_version > 0);

UPDATE airtable_oauth_attempts
SET authorization_connection_version = COALESCE(
  (
    SELECT connection_version
    FROM airtable_connections
    WHERE airtable_connections.id = airtable_oauth_attempts.connection_id
      AND airtable_connections.organization_id = airtable_oauth_attempts.organization_id
  ),
  1
);
