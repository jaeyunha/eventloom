import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createPortalApi } from "./api";
import { ProfileActions } from "./portal-profile-actions";
import {
  focusFirstInvalidProfileField,
  profileDraftFor,
  profilePayloadFor,
  validateProfileDraft,
} from "./portal-profile-model";
import { PrivateLogisticsSection, PublicProfileSection } from "./portal-profile-sections";
import type { PortalProfile } from "./types";

vi.mock("../../components/ui", () => {
  const element =
    (tag: string) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      createElement(tag, props, children);
  return {
    Card: element("div"),
    CardContent: element("div"),
    CardDescription: element("p"),
    CardHeader: element("div"),
    CardTitle: element("div"),
    Field: element("div"),
    FieldDescription: element("p"),
    FieldError: element("div"),
    FieldGroup: element("div"),
    FieldLabel: element("label"),
    Input: element("input"),
    Textarea: element("textarea"),
    Button: element("button"),
    Checkbox: ({
      checked,
      onCheckedChange: _onCheckedChange,
      ...props
    }: {
      checked?: boolean;
      onCheckedChange?: unknown;
    }) => createElement("input", { ...props, type: "checkbox", checked, readOnly: true }),
  };
});

const profile: PortalProfile = {
  id: "profile-1",
  eventId: "event-1",
  participantId: "participant-1",
  displayName: "Priya Raman",
  biography: "Builds reliable systems.",
  jobTitle: "Principal Engineer",
  company: "Latticework",
  socialLinks: {
    twitter: "@priya",
    linkedin: "https://linkedin.com/in/priya",
    website: "https://priya.example",
  },
  travelLogistics: {
    travelRequired: true,
    arrivalAt: "2026-09-10T14:00",
    departureAt: "2026-09-13T09:00",
    accommodation: "Conference hotel",
    dietaryRequirements: "Vegetarian",
    accessibilityNeeds: "Step-free route",
    travelNotes: "Train preferred",
  },
  version: 4,
  updatedAt: "2026-08-15T00:00:00.000Z",
};

describe("portal profile", () => {
  it("round-trips every public and private field through the existing save payload", () => {
    const draft = profileDraftFor(profile);
    expect(draft).toMatchObject({
      biography: profile.biography,
      jobTitle: profile.jobTitle,
      company: profile.company,
      twitter: profile.socialLinks?.twitter,
      linkedin: profile.socialLinks?.linkedin,
      travelRequired: true,
      arrivalAt: "2026-09-10T14:00",
      departureAt: "2026-09-13T09:00",
      accommodation: "Conference hotel",
      dietaryRequirements: "Vegetarian",
      accessibilityNeeds: "Step-free route",
      travelNotes: "Train preferred",
    });
    expect(profilePayloadFor(profile, draft)).toEqual({
      biography: "Builds reliable systems.",
      jobTitle: "Principal Engineer",
      company: "Latticework",
      socialLinks: profile.socialLinks,
      travelLogistics: profile.travelLogistics,
    });
  });

  it("sends private logistics through the versioned profile mutation contract", async () => {
    const requests: RequestInit[] = [];
    const api = createPortalApi("https://api.example.test", async (_input, init) => {
      requests.push(init ?? {});
      return new Response(JSON.stringify({ data: profile }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await api.updateProfile?.({
      eventId: profile.eventId,
      participantId: profile.participantId,
      ...profilePayloadFor(profile, profileDraftFor(profile)),
      expectedVersion: profile.version,
    });

    expect(JSON.parse(String(requests[0]?.body))).toMatchObject({
      biography: profile.biography,
      jobTitle: profile.jobTitle,
      company: profile.company,
      socialLinks: profile.socialLinks,
      travelLogistics: profile.travelLogistics,
      expectedVersion: 4,
    });
  });

  it("returns field-specific errors and focuses only the first invalid control", () => {
    const draft = {
      ...profileDraftFor(profile),
      twitter: "javascript:alert(1)",
      linkedin: "https://example.com/not-linkedin",
      departureAt: "2026-09-09T09:00",
    };
    const errors = validateProfileDraft(draft, null);
    expect(errors.twitter).toContain("HTTP or HTTPS");
    expect(errors.linkedin).toContain("matching profile network");
    expect(errors.departureAt).toContain("after arrival");

    const twitter = { focus: vi.fn() } as unknown as HTMLInputElement;
    const linkedin = { focus: vi.fn() } as unknown as HTMLInputElement;
    const refs = { twitter, linkedin };
    focusFirstInvalidProfileField(errors, refs);
    expect(twitter.focus).toHaveBeenCalledOnce();
    expect(linkedin.focus).not.toHaveBeenCalled();
  });

  it("exposes Save and Discard only for a dirty draft and announces its state", () => {
    const dirtyMarkup = renderToStaticMarkup(
      <ProfileActions
        saving={false}
        saved={false}
        dirty
        canEdit
        error={null}
        onDiscard={vi.fn()}
      />,
    );
    const cleanMarkup = renderToStaticMarkup(
      <ProfileActions
        saving={false}
        saved
        dirty={false}
        canEdit
        error={null}
        onDiscard={vi.fn()}
      />,
    );

    expect(dirtyMarkup).toContain("Unsaved changes.");
    expect(dirtyMarkup).toContain(">Save profile</button>");
    expect(dirtyMarkup).toContain(">Discard changes</button>");
    expect(cleanMarkup).toContain("Profile saved.");
    expect(cleanMarkup.match(/disabled/g)).toHaveLength(2);
  });

  it("renders distinct public and private sections with scoped invalid state", () => {
    const draft = profileDraftFor(profile);
    const publicMarkup = renderToStaticMarkup(
      <PublicProfileSection
        profile={profile}
        draft={draft}
        errors={{ twitter: "Enter a valid Twitter/X profile." }}
        disabled={false}
        selectedHeadshot={null}
        fieldRefs={{}}
        onChange={vi.fn()}
        onHeadshotChange={vi.fn()}
      />,
    );
    const privateMarkup = renderToStaticMarkup(
      <PrivateLogisticsSection
        draft={draft}
        errors={{}}
        disabled={false}
        fieldRefs={{}}
        onChange={vi.fn()}
      />,
    );

    expect(publicMarkup).toContain("Public program profile");
    expect(publicMarkup).toContain("Priya Raman");
    expect(publicMarkup).toContain('aria-invalid="true"');
    expect(publicMarkup).toContain('aria-describedby="profile-twitter-error"');
    expect(publicMarkup).not.toContain('id="profile-linkedin-error"');
    expect(privateMarkup).toContain("Private event logistics");
    expect(privateMarkup).toContain("not published");
    expect(privateMarkup).toContain("Dietary requirements");
    expect(privateMarkup).not.toContain("aria-invalid");
  });
});
