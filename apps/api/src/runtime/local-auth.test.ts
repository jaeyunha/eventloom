import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { createLocalDependencies } from "./local";

vi.setConfig({ testTimeout: 30_000 });

describe("local public applicant authentication", () => {
  const environment = {
    APP_ENV: "local" as const,
    WEB_ORIGIN: "http://127.0.0.1:3015",
  };

  it("resolves the seeded demo event for the local agenda boundary", async () => {
    const dependencies = createLocalDependencies();

    await expect(dependencies.agenda?.organizationIdForEvent("demo-event")).resolves.toBe(
      "local-organization",
    );
  });

  it("serves the seeded demo agenda through the composed local app", async () => {
    const app = createApp(createLocalDependencies());
    const response = await app.request(
      "/api/admin/organizations/local-organization/events/demo-event/agenda",
      {
        headers: { cookie: "better-auth.session_token=local-session" },
      },
      environment,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        event: {
          id: "demo-event",
          name: "Open Sessionboard Conference",
          timeZone: "America/Los_Angeles",
        },
      },
    });
  });

  it("authorizes organizer evaluations for the event id in the query", async () => {
    const app = createApp(createLocalDependencies());
    const response = await app.request(
      "/api/admin/evaluations/organizer/workspace?eventId=open-sessionboard-conf",
      {
        headers: { cookie: "better-auth.session_token=local-session" },
      },
      environment,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: {
        code: "NOT_FOUND",
      },
    });
  });

  it("creates and resolves an isolated applicant session", async () => {
    const dependencies = createLocalDependencies();
    const auth = dependencies.auth;
    expect(auth).toBeDefined();

    const signUp = await auth?.handler(
      new Request("http://127.0.0.1:8787/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new-speaker@example.test",
          password: "StrongPass1!",
          name: "New Speaker",
        }),
      }),
    );

    expect(signUp?.status).toBe(200);
    expect(signUp?.headers.get("set-cookie")).toContain("better-auth.session_token=");
    expect(await signUp?.json()).toMatchObject({
      user: {
        email: "new-speaker@example.test",
        name: "New Speaker",
        emailVerified: true,
      },
    });

    const cookie = signUp?.headers.get("set-cookie")?.split(";")[0] ?? "";
    const session = await auth?.handler(
      new Request("http://127.0.0.1:8787/api/auth/get-session", {
        headers: { cookie },
      }),
    );
    expect(session?.status).toBe(200);
    expect(await session?.json()).toMatchObject({
      user: {
        email: "new-speaker@example.test",
        name: "New Speaker",
      },
    });
  });

  it("accepts a newly issued applicant session on protected CFP routes", async () => {
    const app = createApp(createLocalDependencies());
    const signUp = await app.request(
      "/api/auth/sign-up/email",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "protected-speaker@example.test",
          password: "StrongPass1!",
          name: "Protected Speaker",
        }),
      },
      environment,
    );
    expect(signUp.status).toBe(200);
    const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";

    const draftResponse = await app.request(
      "/api/cfp/organizations/local-organization/events/demo-event/forms/main-cfp/drafts",
      {
        method: "POST",
        headers: {
          cookie,
          "idempotency-key": "local-applicant-protected-draft",
        },
      },
      environment,
    );

    expect(draftResponse.status).toBe(201);
    expect(await draftResponse.json()).toMatchObject({
      data: {
        ownerAccountId: expect.stringContaining("local-applicant-"),
        status: "draft",
      },
    });
  });

  it("does not infer reviewer workspace access from the local organizer membership", async () => {
    const app = createApp(createLocalDependencies());

    const response = await app.request(
      "/api/admin/evaluations/reviewer/workspace",
      {
        headers: {
          cookie: "better-auth.session_token=local-session",
        },
      },
      environment,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "ACCESS_DENIED",
      },
    });
  });

  it("consumes CFP upload capabilities through the local speaker asset route", async () => {
    const app = createApp(createLocalDependencies());
    const cookie = "better-auth.session_token=local-speaker-session";
    const draftResponse = await app.request(
      "/api/cfp/organizations/local-organization/events/demo-event/forms/main-cfp/drafts",
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          "idempotency-key": "local-upload-draft",
        },
        body: JSON.stringify({}),
      },
      environment,
    );
    expect(draftResponse.status).toBe(201);
    const draft = (await draftResponse.json()) as { data: { id: string } };

    const authorizationResponse = await app.request(
      `/api/cfp/organizations/local-organization/events/demo-event/submissions/${draft.data.id}/file-requests/slides/upload`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          "idempotency-key": "local-upload-authorization",
        },
        body: JSON.stringify({
          fileName: "slides.pdf",
          contentType: "application/pdf",
          sizeBytes: 13,
        }),
      },
      environment,
    );
    expect(authorizationResponse.status).toBe(201);
    const authorization = (await authorizationResponse.json()) as {
      data: {
        asset: { assetId: string };
        grant: { url: string; headers: Record<string, string> };
      };
    };

    const uploadResponse = await app.request(
      authorization.data.grant.url,
      {
        method: "PUT",
        headers: authorization.data.grant.headers,
        body: "%PDF-1.4\nEOF\n",
      },
      environment,
    );
    expect(uploadResponse.status).toBe(201);

    const finalizeResponse = await app.request(
      `/api/cfp/organizations/local-organization/events/demo-event/submissions/${draft.data.id}/file-requests/slides/assets/${authorization.data.asset.assetId}/finalize`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          "idempotency-key": "local-upload-finalize",
        },
        body: JSON.stringify({ state: "ready" }),
      },
      environment,
    );
    expect(finalizeResponse.status).toBe(200);
    expect(await finalizeResponse.json()).toMatchObject({
      data: { state: "ready" },
    });
  });
});
