import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createPortalApi, type PortalApi, validatePortalSocialUrl } from "./api";
import { isPortalGenerationCurrent, PortalProvider } from "./portal-provider";
import {
  formatPortalFileSize,
  NoParticipantWorkspaceState,
  PageHeading,
  portalAssetStateLabel,
  portalNavigation,
  PortalFrame,
  Progress,
  SubmissionStatusBadge,
  signOutAndRedirect,
  TaskStatusBadge,
} from "./portal-ui";
import { groupPortalAssetVersions } from "./portal-workspace";
import type { PortalAsset, PortalProfile } from "./types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("speaker portal UI components", () => {
  it("round-trips the complete profile DTO and validates social profile URLs", async () => {
    const requests: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const updatedProfile: PortalProfile & {
      jobTitle: string;
      company: string;
      socialLinks: { twitter: string; linkedin: string };
    } = {
      id: "profile-1",
      eventId: "event-1",
      participantId: "participant-1",
      displayName: "Priya Raman",
      biography: "Updated biography",
      jobTitle: "Principal Engineer",
      company: "Latticework Systems",
      socialLinks: {
        twitter: "https://x.com/priya",
        linkedin: "https://www.linkedin.com/in/priya",
      },
      version: 2,
      updatedAt: "2026-08-09T01:00:00.000Z",
    };
    const api = createPortalApi("https://api.example.com", async (input, init) => {
      requests.push({ input, init });
      return jsonResponse({ data: updatedProfile });
    });

    await expect(
      api.updateProfile?.({
        eventId: "event one",
        participantId: "participant/one",
        biography: updatedProfile.biography,
        jobTitle: updatedProfile.jobTitle,
        company: updatedProfile.company,
        socialLinks: updatedProfile.socialLinks,
        headshotAssetId: "asset-headshot-v2",
        expectedVersion: 1,
      }),
    ).resolves.toEqual(updatedProfile);

    expect(String(requests[0]?.input)).toBe(
      "https://api.example.com/api/speaker/events/event%20one/profiles/participant%2Fone",
    );
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      biography: updatedProfile.biography,
      jobTitle: updatedProfile.jobTitle,
      company: updatedProfile.company,
      socialLinks: updatedProfile.socialLinks,
      headshotAssetId: "asset-headshot-v2",
      expectedVersion: 1,
    });
    expect(validatePortalSocialUrl("https://x.com/priya", "twitter")).toBeNull();
    expect(validatePortalSocialUrl("@priya", "twitter")).toBeNull();
    expect(validatePortalSocialUrl("https://www.linkedin.com/in/priya", "linkedin")).toBeNull();
    expect(validatePortalSocialUrl("javascript:alert(1)", "twitter")).toContain("HTTP or HTTPS");
    expect(validatePortalSocialUrl("https://example.com/priya", "linkedin")).toContain(
      "matching profile network",
    );
  });

  it("uses the private headshot grant, preserves superseding lineage, and issues fresh old-version downloads", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const first: PortalAsset = {
      id: "asset-headshot-v1",
      eventId: "event-1",
      participantId: "participant-1",
      kind: "headshot",
      fileName: "headshot.png",
      contentType: "image/png",
      sizeBytes: 100,
      state: "ready",
      createdAt: "2026-08-09T00:00:00.000Z",
      version: 1,
      versionFamilyId: "family-headshot",
    };
    const second: PortalAsset = {
      ...first,
      id: "asset-headshot-v2",
      state: "pending_upload",
      createdAt: "2026-08-09T01:00:00.000Z",
      version: 2,
      supersedesAssetId: first.id,
    };
    const api = createPortalApi("https://api.example.com", async (input, init) => {
      calls.push({ input, init });
      if (calls.length === 1) {
        return jsonResponse({
          data: {
            asset: second,
            grant: {
              method: "PUT",
              url: "https://uploads.example.com/private/headshot-v2",
              headers: { "content-type": "image/png" },
              expiresAt: "2026-08-09T01:05:00.000Z",
            },
          },
        });
      }
      if (calls.length === 2) return new Response(null, { status: 204 });
      if (calls.length === 3) return jsonResponse({ data: { ...second, state: "ready" } });
      return jsonResponse({
        data: {
          method: "GET",
          url: `https://downloads.example.com/${calls.length}`,
          expiresAt: "2026-08-09T01:15:00.000Z",
        },
      });
    });
    const file = new File(["headshot-v2"], "headshot.png", { type: "image/png" });

    await expect(
      api.uploadFile?.({
        eventId: "event-1",
        participantId: "participant-1",
        kind: "headshot",
        file,
        supersedesAssetId: first.id,
      }),
    ).resolves.toEqual(second);
    const uploadBody = JSON.parse(String(calls[0]?.init?.body));
    expect(uploadBody).toMatchObject({
      participantId: "participant-1",
      kind: "headshot",
      supersedesAssetId: first.id,
    });
    expect(uploadBody).not.toHaveProperty("objectKey");

    const finalized = await api.finalizeAsset?.({
      eventId: "event-1",
      assetId: second.id,
      state: "ready",
    });
    expect(finalized).toMatchObject({
      id: second.id,
      state: "ready",
      supersedesAssetId: first.id,
    });

    const families = groupPortalAssetVersions([first, second]);
    expect(families).toHaveLength(1);
    expect(families[0]?.versions.map((asset) => asset.id)).toEqual([first.id, second.id]);
    expect(families[0]?.current.id).toBe(second.id);

    const firstGrant = await api.getDownloadGrant?.("event-1", first.id);
    const secondGrant = await api.getDownloadGrant?.("event-1", first.id);
    expect(firstGrant?.url).not.toBe(secondGrant?.url);
    expect(calls.slice(3).map(({ input }) => String(input))).toEqual([
      "https://api.example.com/api/speaker/events/event-1/assets/asset-headshot-v1/download",
      "https://api.example.com/api/speaker/events/event-1/assets/asset-headshot-v1/download",
    ]);
  });

  it("renders a clear page heading hierarchy", () => {
    const markup = renderToStaticMarkup(
      createElement(PageHeading, {
        eyebrow: "Speaker portal",
        title: "Tasks",
        description: "Complete your accepted-speaker tasks.",
      }),
    );

    expect(markup).toContain("<h1>Tasks</h1>");
    expect(markup).toContain("Speaker portal");
    expect(markup).toContain("Complete your accepted-speaker tasks.");
  });

  it("exposes status labels as text rather than color alone", () => {
    const submission = renderToStaticMarkup(
      createElement(SubmissionStatusBadge, { status: "accepted" }),
    );
    const task = renderToStaticMarkup(createElement(TaskStatusBadge, { status: "needs_changes" }));

    expect(submission).toContain("Accepted");
    expect(task).toContain("Needs changes");
  });

  it("renders readiness with native progress semantics", () => {
    const markup = renderToStaticMarkup(
      createElement(Progress, { value: 60, label: "Speaker readiness" }),
    );

    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="60"');
    expect(markup).toContain('aria-label="Speaker readiness"');
  });

  it("keeps primary portal pages and restored operational workspaces visible", () => {
    expect(portalNavigation.map(({ label }) => label)).toEqual([
      "Home",
      "Sessions",
      "Tasks",
      "Profile",
      "Co-speakers",
      "Files",
      "Resources",
      "Wiki",
    ]);
    expect(portalNavigation.map(({ href }) => href)).toEqual([
      "/portal",
      "/portal/submissions",
      "/portal/tasks",
      "/portal/profile",
      "/portal?workspace=co-speakers",
      "/portal?workspace=files",
      "/portal?workspace=resources",
      "/portal?workspace=wiki",
    ]);
  });

  it("formats truthful private-asset metadata and states", () => {
    expect(formatPortalFileSize(1_536)).toBe("1.5 KiB");
    expect(formatPortalFileSize(-1)).toBe("Unknown size");
    expect(portalAssetStateLabel("pending_upload")).toBe("Upload pending");
    expect(portalAssetStateLabel("ready")).toBe("Ready");
    expect(portalAssetStateLabel("rejected")).toBe("Rejected");
  });
  it("renders the honest empty participant workspace state", () => {
    const markup = renderToStaticMarkup(createElement(NoParticipantWorkspaceState));

    expect(markup).toContain("<h1>No participant workspace</h1>");
    expect(markup).toContain("Your sessions, profile, and tasks will appear here");
    expect(markup).not.toContain("files");
  });

  it("does not render event navigation before an authorized context exists", () => {
    const api = {
      getPortal: async () => {
        throw new Error("The server render must not load an event without a context.");
      },
    } as unknown as PortalApi;
    const markup = renderToStaticMarkup(
      <PortalProvider api={api}>
        <PortalFrame>
          <p>Portal content</p>
        </PortalFrame>
      </PortalProvider>,
    );

    expect(markup).not.toContain('aria-label="Speaker portal"');
    expect(markup).toContain("Sign out");
  });

  it("posts sign-out with session credentials before navigating to login", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const navigate = vi.fn();

    await signOutAndRedirect(navigate);

    expect(fetcher).toHaveBeenCalledWith("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(navigate).toHaveBeenCalledWith("/login");
  });
  it("discards deferred portal completions after the active context generation changes", async () => {
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    const startedGeneration = 4;
    let activeGeneration = startedGeneration;
    const staleCompletion = completion.then(() =>
      isPortalGenerationCurrent(startedGeneration, activeGeneration),
    );

    activeGeneration += 1;
    resolveCompletion();

    await expect(staleCompletion).resolves.toBe(false);
    expect(isPortalGenerationCurrent(activeGeneration, activeGeneration)).toBe(true);
  });
});
