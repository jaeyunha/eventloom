PRAGMA foreign_keys = ON;

ALTER TABLE idempotency_keys
  ADD COLUMN lease_id TEXT;

UPDATE idempotency_keys
SET lease_id = lower(hex(randomblob(16)))
WHERE lease_id IS NULL
  AND status = 'processing';
