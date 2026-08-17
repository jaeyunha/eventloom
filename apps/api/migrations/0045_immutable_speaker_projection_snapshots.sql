PRAGMA foreign_keys = ON;

-- A single agenda revision can have multiple immutable speaker snapshots while
-- a failed or expired publication reservation is recovered. Projection IDs are
-- content-addressed, so revision and source-hash uniqueness would incorrectly
-- collide with a newer retry and retain the orphaned snapshot.
DROP INDEX IF EXISTS program_speaker_projections_revision_uidx;
DROP INDEX IF EXISTS program_speaker_projections_hash_uidx;
