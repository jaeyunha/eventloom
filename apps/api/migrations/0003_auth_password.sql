PRAGMA foreign_keys = ON;
-- Store Better Auth credential password hashes without retaining plaintext passwords.
ALTER TABLE auth_accounts ADD COLUMN password_hash TEXT;
