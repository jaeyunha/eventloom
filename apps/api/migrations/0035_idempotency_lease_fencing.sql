PRAGMA foreign_keys = ON;

ALTER TABLE idempotency_records
  ADD COLUMN lease_id TEXT;

UPDATE idempotency_records
SET lease_id = lower(hex(randomblob(16)))
WHERE lease_id IS NULL
  AND state = 'processing';
