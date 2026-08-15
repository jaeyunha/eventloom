const MEMBERSHIP_ROLES = new Set(["owner", "admin", "reviewer"]);

export function createSqlBuilders({ requiredString, fail }) {
  function sqlLiteral(value, label) {
    return `'${requiredString(value, label).replaceAll("'", "''")}'`;
  }

  function scope(command) {
    return {
      organizationId: requiredString(command.organizationId, "Organization ID"),
      eventId: requiredString(command.eventId, "Event ID"),
      userId: requiredString(command.userId, "User ID"),
      email: requiredString(command.email, "Email"),
    };
  }

  function membershipSql(command) {
    const input = scope(command);
    const role = requiredString(command.role, "Membership role").toLowerCase();
    if (!MEMBERSHIP_ROLES.has(role)) {
      fail("COMMAND_INVALID", "Membership role is unsupported.");
    }
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    return `INSERT INTO organization_memberships
  (organization_id, user_id, role, created_at, updated_at)
VALUES (${sqlLiteral(input.organizationId, "Organization ID")}, ${sqlLiteral(input.userId, "User ID")}, ${sqlLiteral(role, "Membership role")}, ${now}, ${now})
ON CONFLICT (organization_id, user_id) DO UPDATE SET
  role = excluded.role,
  updated_at = excluded.updated_at;`;
  }

  function speakerGrantSql(command) {
    const input = scope(command);
    const speakerProfileId = requiredString(command.speakerProfileId, "Speaker profile ID");
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    return `INSERT INTO speaker_grants
  (organization_id, speaker_profile_id, user_id, created_at, revoked_at)
VALUES (${sqlLiteral(input.organizationId, "Organization ID")}, ${sqlLiteral(speakerProfileId, "Speaker profile ID")}, ${sqlLiteral(input.userId, "User ID")}, ${now}, NULL)
ON CONFLICT (organization_id, speaker_profile_id, user_id) DO UPDATE SET
  revoked_at = NULL;`;
  }

  function accountVerificationSql(command) {
    const input = scope(command);
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    return `UPDATE auth_users
SET email_verified = 1, updated_at = ${now}
WHERE id = ${sqlLiteral(input.userId, "User ID")}
  AND email = ${sqlLiteral(input.email, "Email")} COLLATE NOCASE;`;
  }

  function userIdLookupSql(email) {
    return `SELECT id
FROM auth_users
WHERE email = ${sqlLiteral(email, "Email")} COLLATE NOCASE
LIMIT 2;`;
  }

  function sqlForCommand(command) {
    switch (command.type) {
      case "membership":
        return membershipSql(command);
      case "speaker-grant":
        return speakerGrantSql(command);
      case "account-verification":
        return accountVerificationSql(command);
      default:
        fail("COMMAND_UNSUPPORTED", "The local D1 command type is unsupported.");
    }
  }

  function sqlitePlan(commandType, command, statement, parameters) {
    return Object.freeze({
      commandType,
      idempotencyKey: requiredString(command.idempotencyKey, "Idempotency key"),
      parameters: Object.freeze(parameters),
      statement,
    });
  }

  function sqliteMembershipPlan(command) {
    const input = scope(command);
    const role = requiredString(command.role, "Membership role").toLowerCase();
    if (!MEMBERSHIP_ROLES.has(role)) {
      fail("COMMAND_INVALID", "Membership role is unsupported.");
    }
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    return sqlitePlan(
      "membership",
      command,
      `INSERT INTO organization_memberships
  (organization_id, user_id, role, created_at, updated_at)
VALUES (?, ?, ?, ${now}, ${now})
ON CONFLICT (organization_id, user_id) DO UPDATE SET
  role = excluded.role,
  updated_at = excluded.updated_at`,
      [input.organizationId, input.userId, role],
    );
  }

  function sqliteSpeakerGrantPlan(command) {
    const input = scope(command);
    const speakerProfileId = requiredString(command.speakerProfileId, "Speaker profile ID");
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    return sqlitePlan(
      "speaker-grant",
      command,
      `INSERT INTO speaker_grants
  (organization_id, speaker_profile_id, user_id, created_at, revoked_at)
VALUES (?, ?, ?, ${now}, NULL)
ON CONFLICT (organization_id, speaker_profile_id, user_id) DO UPDATE SET
  revoked_at = NULL`,
      [input.organizationId, speakerProfileId, input.userId],
    );
  }

  function sqliteAccountVerificationPlan(command) {
    const input = scope(command);
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    return sqlitePlan(
      "account-verification",
      command,
      `UPDATE auth_users
SET email_verified = 1, updated_at = ${now}
WHERE id = ? AND email = ? COLLATE NOCASE`,
      [input.userId, input.email],
    );
  }

  function sqliteCommandPlan(command) {
    switch (command.type) {
      case "membership":
        return sqliteMembershipPlan(command);
      case "speaker-grant":
        return sqliteSpeakerGrantPlan(command);
      case "account-verification":
        return sqliteAccountVerificationPlan(command);
      default:
        fail("COMMAND_UNSUPPORTED", "The local D1 command type is unsupported.");
    }
  }

  function sqliteUserIdLookupPlan(email) {
    return Object.freeze({
      parameters: Object.freeze([requiredString(email, "Email")]),
      statement: "SELECT id FROM auth_users WHERE email = ? COLLATE NOCASE LIMIT 2",
    });
  }

  return Object.freeze({
    accountVerificationSql,
    sqliteCommandPlan,
    sqliteUserIdLookupPlan,
    sqlForCommand,
    userIdLookupSql,
  });
}
