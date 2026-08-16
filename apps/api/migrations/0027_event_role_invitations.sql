-- Account-bound event reviewer and speaker invitations are the authorization acceptance gate.
-- Existing reviewer state and active participant grants are preserved through accepted backfill.
PRAGMA foreign_keys = ON;

-- Preserve the grant generation across unrelated reviewer-pool edits. Re-adding a removed
-- reviewer receives a new timestamp, while retained grants keep their original timestamp.
ALTER TABLE reviewer_pool_members ADD COLUMN granted_at TEXT;
UPDATE reviewer_pool_members
   SET granted_at = (
     SELECT pool.updated_at
       FROM reviewer_pools pool
      WHERE pool.organization_id = reviewer_pool_members.organization_id
        AND pool.event_id = reviewer_pool_members.event_id
        AND pool.id = reviewer_pool_members.pool_id
   )
 WHERE granted_at IS NULL;
CREATE INDEX reviewer_pool_members_granted_at_idx
  ON reviewer_pool_members(organization_id, event_id, reviewer_id, granted_at DESC);

CREATE TABLE event_role_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('reviewer', 'speaker')),
  recipient_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  normalized_email TEXT NOT NULL COLLATE NOCASE CHECK (
    length(trim(normalized_email)) > 0 AND normalized_email = lower(trim(normalized_email))
  ),
  participant_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  creation_idempotency_key TEXT NOT NULL,
  invited_by_actor_type TEXT NOT NULL CHECK (invited_by_actor_type IN ('user', 'system')),
  invited_by_actor_id TEXT,
  invited_at TEXT NOT NULL,
  accepted_by_user_id TEXT REFERENCES auth_users(id) ON DELETE RESTRICT,
  accepted_at TEXT,
  declined_by_user_id TEXT REFERENCES auth_users(id) ON DELETE RESTRICT,
  declined_at TEXT,
  revoked_by_actor_type TEXT CHECK (
    revoked_by_actor_type IS NULL OR revoked_by_actor_type IN ('user', 'system')
  ),
  revoked_by_actor_id TEXT,
  revoked_at TEXT,
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id) REFERENCES events(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, participant_id)
    REFERENCES participants(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, event_id, id),
  UNIQUE (organization_id, event_id, creation_idempotency_key),
  CHECK (
    (role = 'reviewer' AND participant_id IS NULL)
    OR (role = 'speaker' AND participant_id IS NOT NULL)
  ),
  CHECK (
    (invited_by_actor_type = 'user' AND invited_by_actor_id IS NOT NULL)
    OR (invited_by_actor_type = 'system' AND invited_by_actor_id IS NULL)
  ),
  CHECK (
    (status = 'pending'
      AND accepted_by_user_id IS NULL AND accepted_at IS NULL
      AND declined_by_user_id IS NULL AND declined_at IS NULL
      AND revoked_by_actor_type IS NULL AND revoked_at IS NULL)
    OR
    (status = 'accepted'
      AND accepted_by_user_id = recipient_user_id AND accepted_at IS NOT NULL
      AND declined_by_user_id IS NULL AND declined_at IS NULL
      AND revoked_by_actor_type IS NULL AND revoked_at IS NULL)
    OR
    (status = 'declined'
      AND accepted_by_user_id IS NULL AND accepted_at IS NULL
      AND declined_by_user_id = recipient_user_id AND declined_at IS NOT NULL
      AND revoked_by_actor_type IS NULL AND revoked_at IS NULL)
    OR
    (status = 'revoked'
      AND declined_by_user_id IS NULL AND declined_at IS NULL
      AND revoked_by_actor_type IS NOT NULL AND revoked_at IS NOT NULL
      AND ((accepted_by_user_id IS NULL) = (accepted_at IS NULL)))
  )
) STRICT;

CREATE UNIQUE INDEX event_role_invitations_live_reviewer_account_uidx
  ON event_role_invitations(organization_id, event_id, recipient_user_id)
  WHERE role = 'reviewer' AND status IN ('pending', 'accepted');
CREATE UNIQUE INDEX event_role_invitations_live_speaker_account_participant_uidx
  ON event_role_invitations(organization_id, event_id, recipient_user_id, participant_id)
  WHERE role = 'speaker' AND status IN ('pending', 'accepted');
CREATE UNIQUE INDEX event_role_invitations_live_participant_uidx
  ON event_role_invitations(organization_id, event_id, participant_id)
  WHERE role = 'speaker' AND status IN ('pending', 'accepted');
CREATE INDEX event_role_invitations_recipient_status_idx
  ON event_role_invitations(recipient_user_id, status, invited_at DESC);
CREATE INDEX event_role_invitations_email_status_idx
  ON event_role_invitations(normalized_email, status, invited_at DESC);
CREATE INDEX event_role_invitations_event_status_idx
  ON event_role_invitations(organization_id, event_id, status, role, updated_at DESC);

CREATE TRIGGER event_role_invitations_validate_insert
BEFORE INSERT ON event_role_invitations
BEGIN
  SELECT RAISE(ABORT, 'event invitation recipient must be a verified account')
   WHERE NOT EXISTS (
     SELECT 1 FROM auth_users account
      WHERE account.id = NEW.recipient_user_id
        AND account.email_verified = 1
        AND lower(trim(account.email)) = NEW.normalized_email
   );
  SELECT RAISE(ABORT, 'event invitation speaker binding is invalid')
   WHERE NEW.role = 'speaker' AND NOT EXISTS (
     SELECT 1
       FROM participants participant
       JOIN speaker_profiles profile
         ON profile.organization_id = participant.organization_id
        AND profile.event_id = participant.event_id
        AND profile.participant_id = participant.id
      WHERE participant.organization_id = NEW.organization_id
        AND participant.event_id = NEW.event_id
        AND participant.id = NEW.participant_id
        AND participant.identity_state = 'resolved'
        AND participant.normalized_email = NEW.normalized_email
        AND profile.status <> 'revoked'
   );
END;

CREATE TRIGGER event_role_invitations_immutable_binding
BEFORE UPDATE ON event_role_invitations
WHEN NEW.organization_id <> OLD.organization_id
  OR NEW.event_id <> OLD.event_id
  OR NEW.role <> OLD.role
  OR NEW.recipient_user_id <> OLD.recipient_user_id
  OR NEW.normalized_email <> OLD.normalized_email
  OR NEW.participant_id IS NOT OLD.participant_id
  OR NEW.creation_idempotency_key <> OLD.creation_idempotency_key
  OR NEW.invited_by_actor_type <> OLD.invited_by_actor_type
  OR NEW.invited_by_actor_id IS NOT OLD.invited_by_actor_id
  OR NEW.invited_at <> OLD.invited_at
BEGIN
  SELECT RAISE(ABORT, 'event invitation binding is immutable');
END;

CREATE TRIGGER event_role_invitations_validate_transition
BEFORE UPDATE OF status, version ON event_role_invitations
BEGIN
  SELECT RAISE(ABORT, 'event invitation version must advance once')
   WHERE NEW.status <> OLD.status AND NEW.version <> OLD.version + 1;
  SELECT RAISE(ABORT, 'event invitation transition is invalid')
   WHERE NOT (
     (NEW.status = OLD.status AND NEW.version = OLD.version)
     OR (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined', 'revoked'))
     OR (OLD.status = 'accepted' AND NEW.status = 'revoked')
   );
  SELECT RAISE(ABORT, 'event invitation recipient must remain verified')
   WHERE NEW.status IN ('accepted', 'declined') AND NOT EXISTS (
     SELECT 1 FROM auth_users account
      WHERE account.id = NEW.recipient_user_id
        AND account.email_verified = 1
        AND lower(trim(account.email)) = NEW.normalized_email
   );
  SELECT RAISE(ABORT, 'reviewer invitation recipient is no longer eligible')
   WHERE OLD.status = 'pending' AND NEW.status = 'accepted' AND NEW.role = 'reviewer'
     AND NOT (
       EXISTS (
         SELECT 1
           FROM organization_memberships membership
          WHERE membership.organization_id = NEW.organization_id
            AND membership.user_id = NEW.recipient_user_id
            AND membership.role = 'reviewer'
       )
       OR EXISTS (
         SELECT 1
           FROM auth_verifications verification
          WHERE json_extract(
                  CASE WHEN json_valid(verification.identifier)
                       THEN verification.identifier ELSE '{}' END,
                  '$.kind'
                ) = 'member_invitation'
            AND json_extract(
                  CASE WHEN json_valid(verification.identifier)
                       THEN verification.identifier ELSE '{}' END,
                  '$.invitation.organizationId'
                ) = NEW.organization_id
            AND json_extract(
                  CASE WHEN json_valid(verification.identifier)
                       THEN verification.identifier ELSE '{}' END,
                  '$.invitation.userId'
                ) = NEW.recipient_user_id
            AND json_extract(
                  CASE WHEN json_valid(verification.identifier)
                       THEN verification.identifier ELSE '{}' END,
                  '$.invitation.role'
                ) = 'reviewer'
            AND json_extract(
                  CASE WHEN json_valid(verification.identifier)
                       THEN verification.identifier ELSE '{}' END,
                  '$.invitation.status'
                ) IN ('pending', 'delivered')
       )
     );
END;

-- Terminal audit is derived from the persisted transition, never from a losing request.
CREATE TRIGGER event_role_invitations_audit_terminal_transition
AFTER UPDATE OF status ON event_role_invitations
WHEN (OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined', 'revoked'))
  OR (OLD.status = 'accepted' AND NEW.status = 'revoked')
BEGIN
  INSERT INTO audit_events (
    id, tenant_id, actor_type, actor_id, action, resource_type, resource_id,
    trace_id, details_json, occurred_at
  ) VALUES (
    'audit:event-role-invitation:' || NEW.id || ':' || NEW.status || ':' || NEW.version,
    NEW.organization_id,
    CASE WHEN NEW.status = 'revoked' THEN NEW.revoked_by_actor_type ELSE 'user' END,
    CASE WHEN NEW.status = 'accepted' THEN NEW.accepted_by_user_id
         WHEN NEW.status = 'declined' THEN NEW.declined_by_user_id
         ELSE NEW.revoked_by_actor_id END,
    NEW.status,
    'event_role_invitation',
    NEW.id,
    NULL,
    json_object('eventId', NEW.event_id, 'role', NEW.role, 'version', NEW.version),
    CASE WHEN NEW.status = 'accepted' THEN NEW.accepted_at
         WHEN NEW.status = 'declined' THEN NEW.declined_at
         ELSE NEW.revoked_at END
  );
END;

-- Preserve every active canonical speaker grant as an accepted account-bound invitation.
INSERT OR IGNORE INTO event_role_invitations (
  id, organization_id, event_id, role, recipient_user_id, normalized_email, participant_id,
  status, creation_idempotency_key, invited_by_actor_type, invited_by_actor_id, invited_at,
  accepted_by_user_id, accepted_at, declined_by_user_id, declined_at,
  revoked_by_actor_type, revoked_by_actor_id, revoked_at, version, updated_at
)
SELECT
  'migration:speaker:' || grant.organization_id || ':' || grant.event_id || ':' ||
    grant.participant_id || ':' || grant.user_id,
  grant.organization_id, grant.event_id, 'speaker', grant.user_id, lower(trim(account.email)),
  grant.participant_id, 'accepted',
  'migration:speaker:' || grant.participant_id || ':' || grant.user_id,
  'system', NULL, grant.created_at, grant.user_id, grant.created_at,
  NULL, NULL, NULL, NULL, NULL, 1, grant.updated_at
FROM participant_grants grant
JOIN auth_users account
  ON account.id = grant.user_id
 AND account.email_verified = 1
JOIN participants participant
  ON participant.organization_id = grant.organization_id
 AND participant.event_id = grant.event_id
 AND participant.id = grant.participant_id
 AND participant.identity_state = 'resolved'
 AND participant.normalized_email = lower(trim(account.email))
JOIN speaker_profiles profile
  ON profile.organization_id = grant.organization_id
 AND profile.event_id = grant.event_id
 AND profile.participant_id = grant.participant_id
 AND lower(trim(profile.email)) = lower(trim(account.email))
 AND profile.status <> 'revoked'
WHERE grant.revoked_at IS NULL;

-- Active speaker authority must have survived the exact verified/profile-compatible backfill.
UPDATE participant_grants
   SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE revoked_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM event_role_invitations invitation
      WHERE invitation.organization_id = participant_grants.organization_id
        AND invitation.event_id = participant_grants.event_id
        AND invitation.role = 'speaker'
        AND invitation.recipient_user_id = participant_grants.user_id
        AND invitation.participant_id = participant_grants.participant_id
        AND invitation.status = 'accepted'
   );

UPDATE participants
   SET claimed_user_id = NULL,
       version = version + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE claimed_user_id IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM speaker_profiles profile
      WHERE profile.organization_id = participants.organization_id
        AND profile.event_id = participants.event_id
        AND profile.participant_id = participants.id
   )
   AND NOT EXISTS (
     SELECT 1
       FROM participant_grants grant
       JOIN event_role_invitations invitation
         ON invitation.organization_id = grant.organization_id
        AND invitation.event_id = grant.event_id
        AND invitation.role = 'speaker'
        AND invitation.recipient_user_id = grant.user_id
        AND invitation.participant_id = grant.participant_id
        AND invitation.status = 'accepted'
      WHERE grant.organization_id = participants.organization_id
        AND grant.event_id = participants.event_id
        AND grant.participant_id = participants.id
        AND grant.user_id = participants.claimed_user_id
        AND grant.revoked_at IS NULL
   );

-- Preserve organization reviewer access for every existing event review plan, plus explicit
-- reviewer pool/assignment access that may predate the organization membership projection.
INSERT OR IGNORE INTO event_role_invitations (
  id, organization_id, event_id, role, recipient_user_id, normalized_email, participant_id,
  status, creation_idempotency_key, invited_by_actor_type, invited_by_actor_id, invited_at,
  accepted_by_user_id, accepted_at, declined_by_user_id, declined_at,
  revoked_by_actor_type, revoked_by_actor_id, revoked_at, version, updated_at
)
SELECT
  'migration:reviewer:' || access.organization_id || ':' || access.event_id || ':' || access.user_id,
  access.organization_id, access.event_id, 'reviewer', access.user_id,
  lower(trim(account.email)), NULL, 'accepted',
  'migration:reviewer:' || access.user_id, 'system', NULL, access.created_at,
  access.user_id, access.created_at, NULL, NULL, NULL, NULL, NULL, 1, access.created_at
FROM (
  SELECT membership.organization_id, plan.event_id, membership.user_id,
         CASE WHEN membership.created_at < plan.created_at THEN membership.created_at ELSE plan.created_at END AS created_at
    FROM organization_memberships membership
    JOIN review_plans plan ON plan.organization_id = membership.organization_id
   WHERE membership.role = 'reviewer'
  UNION
  SELECT assignment.organization_id, assignment.event_id, assignment.reviewer_id, assignment.created_at
    FROM review_assignments assignment
  UNION
  SELECT member.organization_id, member.event_id, member.reviewer_id, pool.created_at
    FROM reviewer_pool_members member
    JOIN reviewer_pools pool
      ON pool.organization_id = member.organization_id
     AND pool.event_id = member.event_id
     AND pool.id = member.pool_id
) access
JOIN auth_users account ON account.id = access.user_id AND account.email_verified = 1;

-- Profile writes continue to synchronize participant identity, but can only reconcile a grant
-- that is backed by an accepted invitation for the exact account and participant.
CREATE TRIGGER event_role_invitations_speaker_profile_insert
AFTER INSERT ON speaker_profiles
WHEN NEW.email IS NOT NULL AND length(trim(NEW.email)) > 0
BEGIN
  UPDATE participants
     SET first_name = CASE WHEN instr(trim(NEW.display_name), ' ') = 0 THEN trim(NEW.display_name)
                           ELSE substr(trim(NEW.display_name), 1, instr(trim(NEW.display_name), ' ') - 1) END,
         last_name = CASE WHEN instr(trim(NEW.display_name), ' ') = 0 THEN ''
                          ELSE ltrim(substr(trim(NEW.display_name), instr(trim(NEW.display_name), ' ') + 1)) END,
         display_name = NEW.display_name, email = NEW.email,
         normalized_email = lower(trim(NEW.email)),
         claimed_user_id = CASE WHEN NEW.status = 'revoked' THEN NULL ELSE (
           SELECT invitation.recipient_user_id
             FROM event_role_invitations invitation
             JOIN auth_users account ON account.id = invitation.recipient_user_id
            WHERE invitation.organization_id = NEW.organization_id
              AND invitation.event_id = NEW.event_id
              AND invitation.role = 'speaker' AND invitation.participant_id = NEW.participant_id
              AND invitation.status = 'accepted' AND account.email_verified = 1
            LIMIT 1
         ) END,
         updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id AND event_id = NEW.event_id AND id = NEW.participant_id;
END;

CREATE TRIGGER event_role_invitations_speaker_profile_update
AFTER UPDATE OF display_name, email, status, updated_at ON speaker_profiles
BEGIN
  UPDATE event_role_invitations
     SET status = 'revoked',
         revoked_by_actor_type = 'system',
         revoked_by_actor_id = NULL,
         revoked_at = NEW.updated_at,
         version = version + 1,
         updated_at = NEW.updated_at
   WHERE (
       (NEW.status = 'revoked' AND OLD.status <> 'revoked')
       OR lower(trim(COALESCE(NEW.email, ''))) <> lower(trim(COALESCE(OLD.email, '')))
     )
     AND organization_id = NEW.organization_id AND event_id = NEW.event_id
     AND role = 'speaker' AND participant_id = NEW.participant_id
     AND status IN ('pending', 'accepted');
  UPDATE participants
     SET display_name = NEW.display_name, email = COALESCE(NEW.email, ''),
         normalized_email = lower(trim(COALESCE(NEW.email, ''))),
         claimed_user_id = CASE WHEN NEW.status = 'revoked' THEN NULL ELSE (
           SELECT invitation.recipient_user_id
             FROM event_role_invitations invitation
             JOIN auth_users account ON account.id = invitation.recipient_user_id
            WHERE invitation.organization_id = NEW.organization_id
              AND invitation.event_id = NEW.event_id
              AND invitation.role = 'speaker' AND invitation.participant_id = NEW.participant_id
              AND invitation.status = 'accepted' AND account.email_verified = 1
            LIMIT 1
         ) END,
         version = version + 1, updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id AND event_id = NEW.event_id AND id = NEW.participant_id;
  UPDATE participant_grants
     SET revoked_at = NEW.updated_at, updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id AND event_id = NEW.event_id
     AND participant_id = NEW.participant_id AND revoked_at IS NULL
     AND (NEW.status = 'revoked' OR NOT EXISTS (
       SELECT 1
         FROM event_role_invitations invitation
         JOIN auth_users account ON account.id = invitation.recipient_user_id
        WHERE invitation.organization_id = NEW.organization_id
          AND invitation.event_id = NEW.event_id
          AND invitation.role = 'speaker' AND invitation.participant_id = NEW.participant_id
          AND invitation.recipient_user_id = participant_grants.user_id
          AND invitation.status = 'accepted' AND account.email_verified = 1
     ));
  INSERT INTO participant_grants (
    organization_id, event_id, participant_id, user_id, permissions_json,
    created_at, updated_at, revoked_at
  )
  SELECT NEW.organization_id, NEW.event_id, NEW.participant_id, invitation.recipient_user_id,
         '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
         NEW.updated_at, NEW.updated_at, NULL
    FROM event_role_invitations invitation
    JOIN auth_users account ON account.id = invitation.recipient_user_id
   WHERE NEW.status <> 'revoked'
     AND invitation.organization_id = NEW.organization_id
     AND invitation.event_id = NEW.event_id
     AND invitation.role = 'speaker' AND invitation.participant_id = NEW.participant_id
     AND invitation.status = 'accepted' AND account.email_verified = 1
  ON CONFLICT(organization_id, event_id, participant_id, user_id) DO UPDATE SET
    permissions_json = excluded.permissions_json,
    updated_at = excluded.updated_at,
    revoked_at = NULL;
END;

CREATE TRIGGER event_role_invitations_auth_user_insert
AFTER INSERT ON auth_users
WHEN NEW.email_verified = 1
BEGIN
  INSERT INTO participant_grants (
    organization_id, event_id, participant_id, user_id, permissions_json,
    created_at, updated_at, revoked_at
  )
  SELECT invitation.organization_id, invitation.event_id, invitation.participant_id, NEW.id,
         '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
         NEW.updated_at, NEW.updated_at, NULL
    FROM event_role_invitations invitation
    JOIN speaker_profiles profile
      ON profile.organization_id = invitation.organization_id
     AND profile.event_id = invitation.event_id
     AND profile.participant_id = invitation.participant_id
     AND profile.status <> 'revoked'
   WHERE invitation.role = 'speaker' AND invitation.status = 'accepted'
     AND invitation.recipient_user_id = NEW.id
  ON CONFLICT(organization_id, event_id, participant_id, user_id) DO UPDATE SET
    permissions_json = excluded.permissions_json,
    updated_at = excluded.updated_at,
    revoked_at = NULL;
  UPDATE participants SET claimed_user_id = NEW.id, updated_at = NEW.updated_at
   WHERE EXISTS (
     SELECT 1
       FROM event_role_invitations invitation
       JOIN speaker_profiles profile
         ON profile.organization_id = invitation.organization_id
        AND profile.event_id = invitation.event_id
        AND profile.participant_id = invitation.participant_id
        AND profile.status <> 'revoked'
      WHERE invitation.organization_id = participants.organization_id
        AND invitation.event_id = participants.event_id
        AND invitation.participant_id = participants.id
        AND invitation.role = 'speaker' AND invitation.status = 'accepted'
        AND invitation.recipient_user_id = NEW.id
   );
END;

CREATE TRIGGER event_role_invitations_auth_user_update
AFTER UPDATE OF email, email_verified ON auth_users
BEGIN
  UPDATE participant_grants SET revoked_at = NEW.updated_at, updated_at = NEW.updated_at
   WHERE user_id = NEW.id AND revoked_at IS NULL AND (
     NEW.email_verified <> 1 OR NOT EXISTS (
       SELECT 1 FROM event_role_invitations invitation
        WHERE invitation.organization_id = participant_grants.organization_id
          AND invitation.event_id = participant_grants.event_id
          AND invitation.participant_id = participant_grants.participant_id
          AND invitation.role = 'speaker' AND invitation.status = 'accepted'
          AND invitation.recipient_user_id = NEW.id
     )
   );
  UPDATE participants SET claimed_user_id = NULL, updated_at = NEW.updated_at
   WHERE claimed_user_id = NEW.id AND (
     NEW.email_verified <> 1 OR NOT EXISTS (
       SELECT 1 FROM event_role_invitations invitation
        WHERE invitation.organization_id = participants.organization_id
          AND invitation.event_id = participants.event_id
          AND invitation.participant_id = participants.id
          AND invitation.role = 'speaker' AND invitation.status = 'accepted'
          AND invitation.recipient_user_id = NEW.id
     )
   );
  INSERT INTO participant_grants (
    organization_id, event_id, participant_id, user_id, permissions_json,
    created_at, updated_at, revoked_at
  )
  SELECT invitation.organization_id, invitation.event_id, invitation.participant_id, NEW.id,
         '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
         NEW.updated_at, NEW.updated_at, NULL
    FROM event_role_invitations invitation
    JOIN speaker_profiles profile
      ON profile.organization_id = invitation.organization_id
     AND profile.event_id = invitation.event_id
     AND profile.participant_id = invitation.participant_id
     AND profile.status <> 'revoked'
   WHERE NEW.email_verified = 1
     AND invitation.role = 'speaker' AND invitation.status = 'accepted'
     AND invitation.recipient_user_id = NEW.id
  ON CONFLICT(organization_id, event_id, participant_id, user_id) DO UPDATE SET
    permissions_json = excluded.permissions_json,
    updated_at = excluded.updated_at,
    revoked_at = NULL;
  UPDATE participants SET claimed_user_id = NEW.id, updated_at = NEW.updated_at
   WHERE NEW.email_verified = 1 AND EXISTS (
     SELECT 1
       FROM event_role_invitations invitation
       JOIN speaker_profiles profile
         ON profile.organization_id = invitation.organization_id
        AND profile.event_id = invitation.event_id
        AND profile.participant_id = invitation.participant_id
        AND profile.status <> 'revoked'
      WHERE invitation.organization_id = participants.organization_id
        AND invitation.event_id = participants.event_id
        AND invitation.participant_id = participants.id
        AND invitation.role = 'speaker' AND invitation.status = 'accepted'
        AND invitation.recipient_user_id = NEW.id
  );
END;

-- Keep legacy trigger behavior compatible while enforcing the accepted-invitation authority
-- invariant at the participant-grant and participant-claim boundaries.
CREATE TRIGGER event_role_invitations_guard_grant_insert
AFTER INSERT ON participant_grants
WHEN NEW.revoked_at IS NULL
BEGIN
  UPDATE participant_grants
     SET revoked_at = NEW.updated_at, updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id
     AND event_id = NEW.event_id
     AND participant_id = NEW.participant_id
     AND user_id = NEW.user_id
     AND revoked_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM event_role_invitations invitation
         JOIN auth_users account ON account.id = invitation.recipient_user_id
         JOIN speaker_profiles profile
           ON profile.organization_id = invitation.organization_id
          AND profile.event_id = invitation.event_id
          AND profile.participant_id = invitation.participant_id
          AND profile.status <> 'revoked'
        WHERE invitation.organization_id = NEW.organization_id
          AND invitation.event_id = NEW.event_id
          AND invitation.role = 'speaker'
          AND invitation.recipient_user_id = NEW.user_id
          AND invitation.participant_id = NEW.participant_id
          AND invitation.status = 'accepted'
          AND account.email_verified = 1
     );
END;

CREATE TRIGGER event_role_invitations_guard_grant_update
AFTER UPDATE OF revoked_at, updated_at ON participant_grants
BEGIN
  UPDATE participant_grants
     SET revoked_at = NEW.updated_at, updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id
     AND event_id = NEW.event_id
     AND participant_id = NEW.participant_id
     AND user_id = NEW.user_id
     AND revoked_at IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM event_role_invitations invitation
         JOIN auth_users account ON account.id = invitation.recipient_user_id
         JOIN speaker_profiles profile
           ON profile.organization_id = invitation.organization_id
          AND profile.event_id = invitation.event_id
          AND profile.participant_id = invitation.participant_id
          AND profile.status <> 'revoked'
        WHERE invitation.organization_id = NEW.organization_id
          AND invitation.event_id = NEW.event_id
          AND invitation.role = 'speaker'
          AND invitation.recipient_user_id = NEW.user_id
          AND invitation.participant_id = NEW.participant_id
          AND invitation.status = 'accepted'
          AND account.email_verified = 1
     );
  UPDATE participant_grants
     SET revoked_at = NULL, updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id
     AND event_id = NEW.event_id
     AND participant_id = NEW.participant_id
     AND user_id = NEW.user_id
     AND revoked_at IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM event_role_invitations invitation
         JOIN auth_users account ON account.id = invitation.recipient_user_id
         JOIN speaker_profiles profile
           ON profile.organization_id = invitation.organization_id
          AND profile.event_id = invitation.event_id
          AND profile.participant_id = invitation.participant_id
          AND profile.status <> 'revoked'
        WHERE invitation.organization_id = NEW.organization_id
          AND invitation.event_id = NEW.event_id
          AND invitation.role = 'speaker'
          AND invitation.recipient_user_id = NEW.user_id
          AND invitation.participant_id = NEW.participant_id
          AND invitation.status = 'accepted'
          AND account.email_verified = 1
     );
END;

CREATE TRIGGER event_role_invitations_guard_participant_claim
AFTER UPDATE OF claimed_user_id ON participants
WHEN EXISTS (
  SELECT 1
    FROM speaker_profiles profile
   WHERE profile.organization_id = NEW.organization_id
     AND profile.event_id = NEW.event_id
     AND profile.participant_id = NEW.id
)
BEGIN
  UPDATE participants
     SET claimed_user_id = NULL, updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id
     AND event_id = NEW.event_id
     AND id = NEW.id
     AND claimed_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM participant_grants grant
         JOIN event_role_invitations invitation
           ON invitation.organization_id = grant.organization_id
          AND invitation.event_id = grant.event_id
          AND invitation.role = 'speaker'
          AND invitation.recipient_user_id = grant.user_id
          AND invitation.participant_id = grant.participant_id
          AND invitation.status = 'accepted'
         JOIN auth_users account
           ON account.id = invitation.recipient_user_id
          AND account.email_verified = 1
         JOIN speaker_profiles profile
           ON profile.organization_id = invitation.organization_id
          AND profile.event_id = invitation.event_id
          AND profile.participant_id = invitation.participant_id
          AND profile.status <> 'revoked'
        WHERE grant.organization_id = NEW.organization_id
          AND grant.event_id = NEW.event_id
          AND grant.participant_id = NEW.id
          AND grant.user_id = participants.claimed_user_id
          AND grant.revoked_at IS NULL
     );
  UPDATE participants
     SET claimed_user_id = (
       SELECT invitation.recipient_user_id
         FROM event_role_invitations invitation
         JOIN auth_users account
           ON account.id = invitation.recipient_user_id
          AND account.email_verified = 1
         JOIN speaker_profiles profile
           ON profile.organization_id = invitation.organization_id
          AND profile.event_id = invitation.event_id
          AND profile.participant_id = invitation.participant_id
          AND profile.status <> 'revoked'
        WHERE invitation.organization_id = NEW.organization_id
          AND invitation.event_id = NEW.event_id
          AND invitation.role = 'speaker'
          AND invitation.participant_id = NEW.id
          AND invitation.status = 'accepted'
        ORDER BY invitation.accepted_at, invitation.id
        LIMIT 1
     ),
         updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id
     AND event_id = NEW.event_id
     AND id = NEW.id
     AND claimed_user_id IS NULL
     AND EXISTS (
       SELECT 1
         FROM event_role_invitations invitation
         JOIN auth_users account
           ON account.id = invitation.recipient_user_id
          AND account.email_verified = 1
         JOIN speaker_profiles profile
           ON profile.organization_id = invitation.organization_id
          AND profile.event_id = invitation.event_id
          AND profile.participant_id = invitation.participant_id
          AND profile.status <> 'revoked'
        WHERE invitation.organization_id = NEW.organization_id
          AND invitation.event_id = NEW.event_id
          AND invitation.role = 'speaker'
          AND invitation.participant_id = NEW.id
          AND invitation.status = 'accepted'
     );
END;

CREATE TRIGGER event_role_invitations_accept
AFTER UPDATE OF status ON event_role_invitations
WHEN OLD.status = 'pending' AND NEW.status = 'accepted'
BEGIN
  INSERT OR IGNORE INTO organization_memberships (
    organization_id,
    user_id,
    role,
    created_at,
    updated_at
  )
  SELECT NEW.organization_id, NEW.recipient_user_id, 'reviewer', NEW.accepted_at, NEW.accepted_at
   WHERE NEW.role = 'reviewer';

  UPDATE organization_memberships
     SET role = 'reviewer',
         updated_at = NEW.accepted_at
   WHERE NEW.role = 'reviewer'
     AND organization_id = NEW.organization_id
     AND user_id = NEW.recipient_user_id
     AND role NOT IN ('owner', 'admin');

  UPDATE auth_verifications
     SET identifier = json_set(
           identifier,
           '$.invitation.status', 'accepted',
           '$.invitation.acceptedAt', NEW.accepted_at,
           '$.invitation.updatedAt', NEW.accepted_at
         ),
         updated_at = NEW.accepted_at
   WHERE NEW.role = 'reviewer'
     AND json_valid(identifier)
     AND json_extract(identifier, '$.kind') = 'member_invitation'
     AND json_extract(identifier, '$.invitation.organizationId') = NEW.organization_id
     AND json_extract(identifier, '$.invitation.userId') = NEW.recipient_user_id
     AND lower(trim(json_extract(identifier, '$.invitation.email'))) = NEW.normalized_email
     AND json_extract(identifier, '$.invitation.role') = 'reviewer'
     AND json_extract(identifier, '$.invitation.status') IN ('pending', 'delivered');

  INSERT OR IGNORE INTO participant_grants (
    organization_id, event_id, participant_id, user_id, permissions_json,
    created_at, updated_at, revoked_at
  )
  SELECT NEW.organization_id, NEW.event_id, NEW.participant_id, NEW.recipient_user_id,
         '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
         NEW.accepted_at, NEW.accepted_at, NULL
   WHERE NEW.role = 'speaker';

  UPDATE participant_grants
     SET permissions_json =
           '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
         updated_at = NEW.accepted_at,
         revoked_at = NULL
   WHERE NEW.role = 'speaker'
     AND organization_id = NEW.organization_id
     AND event_id = NEW.event_id
     AND participant_id = NEW.participant_id
     AND user_id = NEW.recipient_user_id;

  UPDATE participants SET claimed_user_id = NEW.recipient_user_id, updated_at = NEW.accepted_at
   WHERE NEW.role = 'speaker' AND organization_id = NEW.organization_id
     AND event_id = NEW.event_id AND id = NEW.participant_id;
END;

CREATE TRIGGER event_role_invitations_revoke
AFTER UPDATE OF status ON event_role_invitations
WHEN NEW.status = 'revoked' AND OLD.status <> 'revoked'
BEGIN
  UPDATE participant_grants SET revoked_at = NEW.revoked_at, updated_at = NEW.revoked_at
   WHERE NEW.role = 'speaker' AND organization_id = NEW.organization_id
     AND event_id = NEW.event_id AND participant_id = NEW.participant_id
     AND user_id = NEW.recipient_user_id AND revoked_at IS NULL;
  UPDATE participants SET claimed_user_id = NULL, updated_at = NEW.revoked_at
   WHERE NEW.role = 'speaker' AND organization_id = NEW.organization_id
     AND event_id = NEW.event_id AND id = NEW.participant_id
     AND claimed_user_id = NEW.recipient_user_id;
END;
