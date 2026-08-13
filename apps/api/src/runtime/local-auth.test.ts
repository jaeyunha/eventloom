import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createLocalDependencies } from "./local";

describe("local public applicant authentication", () => {
  const environment = {
    APP_ENV: "local" as const,
    WEB_ORIGIN: "http://localhost:3015",
  };

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
