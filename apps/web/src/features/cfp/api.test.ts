import { describe, expect, it, vi } from "vitest";
import {
  CFP_REQUEST_TIMEOUT_MS,
  CfpApiError,
  createCfpApi,
  isCfpSchemaVersionConflict,
} from "./api";

describe("CFP authenticated session", () => {
  it("loads the verified same-origin session without sending credentials again", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const api = createCfpApi("https://web.example.com", (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return Response.json({
        session: { id: "session-1" },
        user: {
          email: "Priya@Example.com",
          name: "Priya Raman",
          emailVerified: true,
        },
      });
    }) as typeof fetch);

    await expect(api.getSession()).resolves.toEqual({
      email: "priya@example.com",
      name: "Priya Raman",
      firstName: "Priya",
      lastName: "Raman",
    });
    expect(requestUrl).toBe("https://web.example.com/api/auth/get-session");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.credentials).toBe("include");
  });
  it("uses the same-origin gateway when no API origin is configured", async () => {
    let requestedUrl = "";
    let requestInit: RequestInit | undefined;
    const api = createCfpApi("", (async (input, init) => {
      requestedUrl = String(input);
      requestInit = init;
      return Response.json({
        data: {
          id: "event-1",
          tenantId: "org-1",
          version: 1,
          slug: "event-1",
          name: "Event",
          timezone: "UTC",
          opensAt: "2026-01-01T00:00:00.000Z",
          closesAt: "2026-02-01T00:00:00.000Z",
        },
      });
    }) as typeof fetch);

    await expect(
      api.getEvent({ organizationId: "org-1", eventId: "event-1" }),
    ).resolves.toMatchObject({
      id: "event-1",
    });
    expect(requestedUrl).toBe("/api/cfp/organizations/org-1/events/event-1/config");
    expect(requestInit?.credentials).toBe("include");
  });

  it("treats an anonymous session response as unauthenticated", async () => {
    const api = createCfpApi("https://web.example.com", (async () =>
      Response.json(null)) as typeof fetch);

    await expect(api.getSession()).resolves.toBeNull();
  });
  it("falls back from invalid credentials to sign-up and hands off verified session data", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const api = createCfpApi("https://web.example.com", (async (input, init) => {
      requests.push({ url: String(input), init });
      if (requests.length === 1) {
        return Response.json(
          { error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid credentials." } },
          { status: 401 },
        );
      }
      return Response.json({
        token: "signup-token",
        user: {
          email: "Ada@Example.com",
          name: "Ada Speaker",
          emailVerified: true,
        },
      });
    }) as typeof fetch);

    await expect(
      api.authenticateAccount({
        email: " Ada@Example.com ",
        password: "StrongPass1!",
        name: "Ada Speaker",
        verificationCallbackUrl:
          "https://web.example.com/cfp/organizations/org-1/events/evaluator-2026/account",
      }),
    ).resolves.toEqual({
      status: "authenticated",
      session: {
        email: "ada@example.com",
        name: "Ada Speaker",
        firstName: "Ada",
        lastName: "Speaker",
      },
    });
    expect(requests.map((request) => request.url)).toEqual([
      "https://web.example.com/api/auth/sign-in/email",
      "https://web.example.com/api/auth/sign-up/email",
    ]);
    expect(requests.every((request) => request.init?.credentials === "include")).toBe(true);
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[1]?.init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      email: "ada@example.com",
      password: "StrongPass1!",
    });
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      email: "ada@example.com",
      password: "StrongPass1!",
      name: "Ada Speaker",
      callbackURL: "https://web.example.com/cfp/organizations/org-1/events/evaluator-2026/account",
    });
  });

  it("falls back to sign-up when the gateway normalizes an anonymous sign-in", async () => {
    let requestCount = 0;
    const api = createCfpApi("https://web.example.com", (async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return Response.json(
          {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "The authentication request could not be completed.",
            },
          },
          { status: 401 },
        );
      }
      return Response.json({
        token: "signup-token",
        user: {
          email: "speaker@example.com",
          name: "New Speaker",
          emailVerified: true,
        },
      });
    }) as typeof fetch);

    await expect(
      api.authenticateAccount({
        email: "speaker@example.com",
        password: "StrongPass1!",
        name: "New Speaker",
      }),
    ).resolves.toMatchObject({ status: "authenticated" });
    expect(requestCount).toBe(2);
  });

  it("fails closed when a successful sign-in omits a usable verified session", async () => {
    let requestCount = 0;
    const api = createCfpApi("https://web.example.com", (async () => {
      requestCount += 1;
      return Response.json({ token: "token-without-user" });
    }) as typeof fetch);

    await expect(
      api.authenticateAccount({
        email: "ada@example.com",
        password: "StrongPass1!",
        name: "Ada Speaker",
      }),
    ).rejects.toMatchObject({
      code: "AUTH_SESSION_NOT_CREATED",
      status: 200,
    });
    expect(requestCount).toBe(1);
  });

  it("keeps sign-up verification required when the returned user is unverified", async () => {
    const api = createCfpApi("https://web.example.com", (async (input) => {
      if (String(input).endsWith("/sign-in/email")) {
        return Response.json({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } }, { status: 401 });
      }
      return Response.json({
        token: null,
        user: {
          email: "ada@example.com",
          name: "Ada Speaker",
          emailVerified: false,
        },
      });
    }) as typeof fetch);

    await expect(
      api.authenticateAccount({
        email: "ada@example.com",
        password: "StrongPass1!",
        name: "Ada Speaker",
      }),
    ).resolves.toEqual({ status: "verification_required" });
  });
});

it("parses the published dynamic schema without dropping rules or reusable metadata", async () => {
  const fetcher = (async () =>
    Response.json({
      data: {
        organization: {
          id: "org-1",
          slug: "eventloom",
          name: "Eventloom",
        },
        event: {
          id: "event-1",
          slug: "event-1",
          name: "Dynamic Event",
          timezone: "UTC",
          opensAt: "2026-01-01T00:00:00.000Z",
          closesAt: "2026-02-01T00:00:00.000Z",
        },
        form: {
          id: "form-1",
          name: "Dynamic CFP",
          version: 7,
          status: "published",
          welcomeContent: "Welcome",
          settings: {
            speakerLimit: 3,
            maxSubmissionsPerAccount: 2,
            confirmationMessage: "Received",
            successContent: "Done",
            remindersEnabled: false,
            adminNotificationsEnabled: true,
          },
          sections: [
            { id: "proposal", title: "Proposal", description: "Session details" },
            { id: "files", title: "Files", description: "Optional materials" },
          ],
          submissionFields: [
            {
              id: "format",
              sectionId: "proposal",
              key: "format",
              label: "Format",
              kind: "select",
              required: true,
              options: [{ value: "workshop", label: "Workshop", description: "Hands-on" }, "Talk"],
              fieldRef: { id: "tenant.format", version: 3 },
              fieldVersion: 3,
            },
            {
              id: "deck",
              sectionId: "files",
              key: "deck",
              label: "Slide deck",
              kind: "file_request",
              required: false,
              options: [],
              fileRequest: {
                allowedMimeTypes: ["application/pdf"],
                maxBytes: 1000000,
                owner: "submission",
              },
            },
          ],
          participantFields: [
            {
              id: "participant-pronouns",
              sectionId: "proposal",
              key: "pronouns",
              label: "Pronouns",
              kind: "select",
              required: false,
              options: ["she/her", "they/them"],
              fieldRef: "tenant.pronouns",
              fieldVersion: 2,
            },
          ],
          rules: [
            {
              id: "show-deck",
              priority: 1,
              when: {
                type: "group",
                operator: "all",
                conditions: [
                  {
                    type: "predicate",
                    fieldKey: "format",
                    operator: "equals",
                    value: "workshop",
                  },
                ],
              },
              actions: [{ type: "show_field", fieldKey: "deck" }],
            },
          ],
        },
      },
    })) as typeof fetch;
  const api = createCfpApi("https://api.example.com", fetcher);
  const published = await api.getPublished({
    organizationId: "org-1",
    eventId: "event-1",
  });

  expect(published.form.sections).toHaveLength(2);
  expect(published.form.submissionFields[0]).toMatchObject({
    fieldRef: { id: "tenant.format", version: 3 },
    fieldVersion: 3,
  });
  expect(published.form.submissionFields[1]?.fileRequest).toMatchObject({
    allowedMimeTypes: ["application/pdf"],
    maxBytes: 1000000,
  });
  expect(published.form.participantFields[0]?.key).toBe("pronouns");
  expect(published.form.rules[0]).toMatchObject({ id: "show-deck" });
  expect(published.organization.name).toBe("Eventloom");
});
describe("CFP mutation schema versions", () => {
  const submission = {
    id: "submission-1",
    tenantId: "org-1",
    eventId: "event-1",
    formId: "form-1",
    ownerAccountId: "account-1",
    formVersion: 7,
    version: 1,
    status: "draft" as const,
    completedSteps: [],
    answers: { slides: { assetId: "asset-finalized" } },
    participants: [
      {
        id: "participant-1",
        firstName: "Ada",
        lastName: "Speaker",
        email: "ada@example.test",
        role: "primary" as const,
        biography: "",
        answers: { portfolio: { assetId: "asset-portfolio" } },
      },
    ],
    secondaryContacts: [],
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };

  it("includes the immutable formVersion in draft, participant, and submit bodies", async () => {
    const mutationBodies: Array<Record<string, unknown>> = [];
    const mutationUrls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      mutationUrls.push(String(input));
      if (init?.body === undefined) {
        return Response.json({ data: submission });
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      mutationBodies.push(body);
      if (init?.method === "POST" && String(input).endsWith("/submit")) {
        return Response.json({
          data: {
            submission: {
              ...submission,
              status: "submitted",
              version: 4,
              submittedAt: "2026-08-09T00:01:00.000Z",
            },
            receipt: {
              id: "receipt-1",
              submissionId: submission.id,
              version: 4,
              submittedAt: "2026-08-09T00:01:00.000Z",
            },
            confirmationQueued: true,
          },
        });
      }
      const version = mutationBodies.length + 1;
      return Response.json({ data: { ...submission, version } });
    }) as typeof fetch;
    const api = createCfpApi("https://api.example.com", fetcher);
    const created = await api.createDraft({
      organizationId: "org-1",
      eventId: "event-1",
      formId: "form-1",
      idempotencyKey: "create-1",
    });

    const draft = await api.saveDraft({
      organizationId: "org-1",
      eventId: "event-1",
      submissionId: submission.id,
      expectedVersion: created.version,
      formVersion: submission.formVersion,
      idempotencyKey: "draft-1",
      completedStep: "submission",
      answers: {
        topics: ["Accessibility"],
        slides: { assetId: "asset-finalized" },
      },
    });
    const participants = await api.saveDraft({
      organizationId: "org-1",
      eventId: "event-1",
      submissionId: submission.id,
      expectedVersion: draft.version,
      formVersion: submission.formVersion,
      idempotencyKey: "participants-1",
      participants: submission.participants,
      secondaryContacts: [],
    });
    await api.submit({
      organizationId: "org-1",
      eventId: "event-1",
      submissionId: submission.id,
      expectedVersion: participants.version,
      formVersion: submission.formVersion,
      idempotencyKey: "submit-1",
    });

    expect(mutationBodies).toHaveLength(3);
    expect(mutationUrls[0]).toBe(
      "https://api.example.com/api/cfp/organizations/org-1/events/event-1/forms/form-1/drafts",
    );
    expect(mutationBodies.every((body) => body.formVersion === submission.formVersion)).toBe(true);
    expect(mutationBodies[0]?.answers).toEqual({
      topics: ["Accessibility"],
      slides: { assetId: "asset-finalized" },
    });
    expect(mutationBodies[1]?.participants).toEqual(submission.participants);
    expect(mutationBodies[2]).toMatchObject({
      expectedVersion: participants.version,
      formVersion: submission.formVersion,
    });
  });
  it("keeps answer and participant writes distinct when one logical save supplies a key", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      const version = url.endsWith("/participants") ? 3 : 2;
      return Response.json({ data: { ...submission, version } });
    }) as typeof fetch;
    const api = createCfpApi("https://api.example.com", fetcher);

    await expect(
      api.saveDraft({
        organizationId: "org-1",
        eventId: "event-1",
        submissionId: submission.id,
        expectedVersion: 1,
        formVersion: submission.formVersion,
        idempotencyKey: "operation-1",
        answers: { title: "A durable title" },
        participants: submission.participants,
        secondaryContacts: [],
      }),
    ).resolves.toMatchObject({ version: 3 });

    expect(requests).toHaveLength(2);
    const firstHeaders = new Headers(requests[0]?.init?.headers);
    const secondHeaders = new Headers(requests[1]?.init?.headers);
    expect(firstHeaders.get("idempotency-key")).toBe("operation-1");
    expect(secondHeaders.get("idempotency-key")).toBe("operation-1:participants");
    expect(secondHeaders.get("idempotency-key")).not.toBe(firstHeaders.get("idempotency-key"));
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({
      expectedVersion: 2,
      formVersion: submission.formVersion,
    });
  });

  it("settles a mutation that never produces a response with an actionable timeout", async () => {
    vi.useFakeTimers();
    try {
      const api = createCfpApi(
        "https://api.example.com",
        (async () => new Promise<Response>(() => undefined)) as typeof fetch,
      );
      const pending = api.saveDraft({
        organizationId: "org-1",
        eventId: "event-1",
        submissionId: submission.id,
        expectedVersion: 1,
        formVersion: submission.formVersion,
        answers: { title: "A timeout-safe title" },
      });

      const rejection = expect(pending).rejects.toMatchObject({
        code: "CFP_REQUEST_TIMEOUT",
        status: 504,
      });
      await vi.advanceTimersByTimeAsync(CFP_REQUEST_TIMEOUT_MS);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
  it("settles account authentication when the auth response never completes", async () => {
    vi.useFakeTimers();
    try {
      const api = createCfpApi(
        "https://api.example.com",
        (async () => new Promise<Response>(() => undefined)) as typeof fetch,
      );
      const pending = api.authenticateAccount({
        email: "speaker@example.com",
        password: "Password1!",
        name: "Fresh Speaker",
      });

      const rejection = expect(pending).rejects.toMatchObject({
        code: "CFP_REQUEST_TIMEOUT",
        status: 504,
      });
      await vi.advanceTimersByTimeAsync(CFP_REQUEST_TIMEOUT_MS);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("identifies only schema-version conflicts as stale-form errors", () => {
    expect(
      isCfpSchemaVersionConflict(
        new CfpApiError("CONFLICT", "The submission schema version is stale.", 409),
      ),
    ).toBe(true);
    expect(
      isCfpSchemaVersionConflict(new CfpApiError("CONFLICT", "The submission has changed.", 409)),
    ).toBe(false);
    expect(
      isCfpSchemaVersionConflict(new CfpApiError("CONFLICT", "The form version is stale.", 400)),
    ).toBe(false);
  });
});
describe("CFP private file uploads", () => {
  it("authorizes, uploads directly, and finalizes a file without exposing a data URL", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/upload")) {
        return Response.json({
          data: {
            asset: { assetId: "asset-pending" },
            grant: {
              method: "PUT",
              url: "https://uploads.example.com/private/asset-pending",
              headers: { "content-type": "application/pdf" },
              expiresAt,
            },
          },
        });
      }
      if (url === "https://uploads.example.com/private/asset-pending") {
        return new Response(null, { status: 200 });
      }
      return Response.json({
        data: {
          assetId: "asset-pending",
          state: "ready",
          contentType: "application/pdf",
          sizeBytes: 3,
        },
      });
    }) as typeof fetch;
    const api = createCfpApi("https://api.example.com", fetcher);
    const file = new File(["pdf"], "slides.pdf", { type: "application/pdf" });

    await expect(
      api.uploadFile?.({
        organizationId: "org-1",
        eventId: "event-1",
        submissionId: "submission-1",
        fieldKey: "slides",
        file,
        idempotencyKey: "upload-1",
      }),
    ).resolves.toEqual({
      assetId: "asset-pending",
      state: "ready",
      contentType: "application/pdf",
      sizeBytes: 3,
      fileName: "slides.pdf",
    });

    expect(requests).toHaveLength(3);
    expect(requests[0]?.url).toBe(
      "https://api.example.com/api/cfp/organizations/org-1/events/event-1/submissions/submission-1/file-requests/slides/upload",
    );
    const issueHeaders = new Headers(requests[0]?.init?.headers);
    const finalizeHeaders = new Headers(requests[2]?.init?.headers);
    expect(issueHeaders.get("idempotency-key")).toBe("upload-1");
    expect(finalizeHeaders.get("idempotency-key")).toBe("upload-1:finalize");
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      fileName: "slides.pdf",
      contentType: "application/pdf",
      sizeBytes: 3,
    });
    expect(requests[1]?.init?.method).toBe("PUT");
    expect(requests[1]?.init?.credentials).toBe("omit");
    expect(requests[1]?.init?.body).toBe(file);
    expect(requests[2]?.url).toContain("/assets/asset-pending/finalize");
    expect(JSON.parse(String(requests[2]?.init?.body))).toEqual({ state: "ready" });
  });

  it("rejects expired authorization before contacting the private upload grant", async () => {
    const requests: string[] = [];
    const api = createCfpApi("https://api.example.com", (async (input) => {
      requests.push(String(input));
      return Response.json({
        data: {
          asset: { assetId: "asset-expired" },
          grant: {
            method: "PUT",
            url: "https://uploads.example.com/private/asset-expired",
            headers: {},
            expiresAt: new Date(Date.now() - 1_000).toISOString(),
          },
        },
      });
    }) as typeof fetch);

    await expect(
      api.uploadFile?.({
        organizationId: "org-1",
        eventId: "event-1",
        submissionId: "submission-1",
        fieldKey: "slides",
        file: new File(["pdf"], "slides.pdf", { type: "application/pdf" }),
      }),
    ).rejects.toMatchObject({ code: "CFP_FILE_UPLOAD_EXPIRED", status: 409 });
    expect(requests).toHaveLength(1);
  });
});
