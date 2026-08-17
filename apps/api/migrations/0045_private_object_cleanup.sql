-- Durable private-object cleanup coordination and queryable upload expiry.
ALTER TABLE private_uploads ADD COLUMN expires_at TEXT;

UPDATE private_uploads
   SET expires_at = COALESCE(
     CASE
       WHEN json_valid(scan_result_code) THEN json_extract(scan_result_code, '$.expiresAt')
       ELSE NULL
     END,
     updated_at
   )
 WHERE expires_at IS NULL;

CREATE INDEX private_uploads_expiry_idx
  ON private_uploads (state, expires_at, tenant_id);
