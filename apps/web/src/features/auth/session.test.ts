import { describe, expect, it } from "vitest";
import {
  normalizeSessionSpeakerGrants,
  sessionHasAuthenticatedUser,
  sessionHasSpeakerGrant,
} from "./session";

describe("authenticated session parsing", () => {
  it("accepts only a session payload containing a user", () => {
    expect(sessionHasAuthenticatedUser({ user: { id: "user-1" } })).toBe(true);
    expect(sessionHasAuthenticatedUser({ data: { user: { id: "user-1" } } })).toBe(true);
    expect(sessionHasAuthenticatedUser({ user: null })).toBe(false);
    expect(sessionHasAuthenticatedUser({ data: { user: null } })).toBe(false);
    expect(sessionHasAuthenticatedUser(null)).toBe(false);
  });

  it("requires an organization-scoped speaker profile grant", () => {
    expect(
      sessionHasSpeakerGrant({
        speakerGrants: [{ organizationId: "org-1", speakerProfileId: "speaker-1" }],
      }),
    ).toBe(true);
    expect(
      sessionHasSpeakerGrant({
        data: {
          speaker_grants: [{ organization_id: "org-2", speaker_profile_id: "speaker-2" }],
        },
      }),
    ).toBe(true);
    expect(sessionHasSpeakerGrant({ speakerGrants: [] })).toBe(false);
    expect(sessionHasSpeakerGrant({ speakerGrants: [{ organizationId: "org-1" }] })).toBe(false);
  });

  it("normalizes nested grants while excluding revoked grants", () => {
    const payload = {
      user: {
        speakerGrants: [
          { organizationId: "org-user", speakerProfileId: "profile-user" },
          {
            organizationId: "org-revoked",
            speakerProfileId: "profile-revoked",
            revokedAt: "2026-08-12T00:00:00.000Z",
          },
        ],
      },
      session: {
        speaker_grants: [{ organization_id: "org-session", speaker_profile_id: "profile-session" }],
      },
    };
    expect(normalizeSessionSpeakerGrants(payload)).toEqual([
      { organizationId: "org-user", speakerProfileId: "profile-user" },
      { organizationId: "org-session", speakerProfileId: "profile-session" },
    ]);
    expect(sessionHasSpeakerGrant(payload)).toBe(true);
    expect(
      normalizeSessionSpeakerGrants({
        session: {
          user: {
            speakerGrants: [{ organizationId: "org-nested", speakerProfileId: "profile-nested" }],
          },
        },
      }),
    ).toEqual([{ organizationId: "org-nested", speakerProfileId: "profile-nested" }]);
    expect(
      normalizeSessionSpeakerGrants({
        data: {
          session: {
            user: {
              speaker_grants: [{ organization_id: "org-data", speaker_profile_id: "profile-data" }],
            },
          },
        },
      }),
    ).toEqual([{ organizationId: "org-data", speakerProfileId: "profile-data" }]);
    expect(
      sessionHasSpeakerGrant({
        session: {
          speakerGrants: [
            {
              organizationId: "org-revoked",
              speakerProfileId: "profile-revoked",
              revoked: true,
            },
          ],
        },
      }),
    ).toBe(false);
  });
});
