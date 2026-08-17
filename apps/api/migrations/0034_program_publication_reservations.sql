PRAGMA foreign_keys = ON;

ALTER TABLE program_releases ADD COLUMN reservation_owner_id TEXT;
ALTER TABLE program_releases ADD COLUMN reservation_expires_at TEXT;
