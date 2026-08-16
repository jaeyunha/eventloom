function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sessionHasAuthenticatedUser(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (isRecord(value.user)) return true;
  if (isRecord(value.session) && isRecord(value.session.user)) return true;
  return isRecord(value.data) && isRecord(value.data.user);
}

export interface NormalizedSpeakerGrant {
  readonly organizationId: string;
  readonly speakerProfileId: string;
}

export function normalizeSessionSpeakerGrants(value: unknown): readonly NormalizedSpeakerGrant[] {
  if (!isRecord(value)) return [];
  const candidates = [
    value,
    value.data,
    value.user,
    value.session,
    isRecord(value.session) ? value.session.user : undefined,
    isRecord(value.data) ? value.data.user : undefined,
    isRecord(value.data) ? value.data.session : undefined,
    isRecord(value.data) && isRecord(value.data.session) ? value.data.session.user : undefined,
  ].filter(isRecord);
  const grants = candidates.flatMap((candidate) => {
    if (Array.isArray(candidate.speakerGrants)) return candidate.speakerGrants;
    return Array.isArray(candidate.speaker_grants) ? candidate.speaker_grants : [];
  });
  const normalized: NormalizedSpeakerGrant[] = [];
  const seen = new Set<string>();
  for (const grant of grants) {
    if (!isRecord(grant) || grant.revoked === true || grant.revokedAt != null) continue;
    const organizationId =
      typeof grant.organizationId === "string"
        ? grant.organizationId.trim()
        : typeof grant.organization_id === "string"
          ? grant.organization_id.trim()
          : "";
    const speakerProfileId =
      typeof grant.speakerProfileId === "string"
        ? grant.speakerProfileId.trim()
        : typeof grant.speaker_profile_id === "string"
          ? grant.speaker_profile_id.trim()
          : "";
    if (!organizationId || !speakerProfileId) continue;
    const key = `${organizationId}\u0000${speakerProfileId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ organizationId, speakerProfileId });
  }
  return normalized;
}

export function sessionHasSpeakerGrant(value: unknown): boolean {
  return normalizeSessionSpeakerGrants(value).length > 0;
}
