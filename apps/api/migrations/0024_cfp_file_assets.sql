PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cfp_file_assets (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  owner TEXT NOT NULL CHECK (owner IN ('submission', 'participant')),
  participant_id TEXT,
  field_key TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  state TEXT NOT NULL CHECK (state IN ('pending_upload', 'ready', 'rejected')),
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  UNIQUE (organization_id, event_id, id),
  CHECK (
    (owner = 'submission' AND participant_id IS NULL)
    OR (owner = 'participant' AND participant_id IS NOT NULL)
  ),
  FOREIGN KEY (organization_id) REFERENCES organizations (organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id)
    REFERENCES events (organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, submission_id)
    REFERENCES submissions (organization_id, event_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, participant_id)
    REFERENCES participants (organization_id, event_id, id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS cfp_file_assets_submission_idx
  ON cfp_file_assets (organization_id, event_id, submission_id, created_at);

CREATE INDEX IF NOT EXISTS cfp_file_assets_participant_idx
  ON cfp_file_assets (organization_id, event_id, participant_id, created_at);

INSERT INTO cfp_file_assets (
  id,
  organization_id,
  event_id,
  submission_id,
  owner,
  participant_id,
  field_key,
  object_key,
  file_name,
  content_type,
  size_bytes,
  state,
  rejection_reason,
  created_at,
  finalized_at
)
SELECT
  speaker_assets.id,
  speaker_assets.organization_id,
  speaker_assets.event_id,
  speaker_assets.submission_id,
  CASE
    WHEN speaker_assets.participant_id = '__cfp_submission__' THEN 'submission'
    ELSE 'participant'
  END,
  CASE
    WHEN speaker_assets.participant_id = '__cfp_submission__' THEN NULL
    ELSE speaker_assets.participant_id
  END,
  MIN(submission_answers.field_key),
  speaker_assets.object_key,
  speaker_assets.file_name,
  speaker_assets.content_type,
  speaker_assets.size_bytes,
  speaker_assets.state,
  speaker_assets.rejection_reason,
  speaker_assets.created_at,
  speaker_assets.finalized_at
FROM speaker_assets
INNER JOIN submission_answers
  ON submission_answers.organization_id = speaker_assets.organization_id
  AND submission_answers.submission_id = speaker_assets.submission_id
  AND submission_answers.asset_id = speaker_assets.id
WHERE speaker_assets.submission_id IS NOT NULL
GROUP BY speaker_assets.id;
