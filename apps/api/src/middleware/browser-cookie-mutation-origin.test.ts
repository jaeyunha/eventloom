import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { browserCookieMutationOriginProtection } from "./browser-cookie-mutation-origin";

type TestEnvironment = {
  Bindings: { APP_ENV: string; WEB_ORIGIN: string };
  Variables: { traceId: string };
};

function app() {
  const handler = vi.fn(() => new Response(null, { status: 204 }));
  const application = new Hono<TestEnvironment>();
  application.use("*", async (context, next) => {
    context.set("traceId", "trace-origin");
    await next();
  });
  application.use("*", browserCookieMutationOriginProtection());
  application.all("*", handler);
  return { application, handler };
}

const production = {
  APP_ENV: "production",
  WEB_ORIGIN: "https://web.example.test",
};

describe("browser cookie mutation origin protection", () => {
  it.each(["GET", "HEAD", "OPTIONS"])("allows safe %s requests", async (method) => {
    const { application, handler } = app();
    const response = await application.request(
      "https://api.example.test/resource",
      {
        method,
        headers: {
          cookie: "__Secure-better-auth.session_token=opaque",
          origin: "https://evil.example.test",
        },
      },
      production,
    );

    expect(response.status).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each(["better-auth.session_token", "__Secure-better-auth.session_token"])(
    "requires the exact deployed web origin for %s mutations",
    async (cookieName) => {
      const { application, handler } = app();
      const rejected = await application.request(
        "https://api.example.test/resource",
        {
          method: "POST",
          headers: {
            cookie: `${cookieName}=opaque`,
            origin: "https://evil.example.test",
            "content-type": "text/plain",
          },
          body: "{}",
        },
        production,
      );
      const allowed = await application.request(
        "https://api.example.test/resource",
        {
          method: "POST",
          headers: {
            cookie: `${cookieName}=opaque`,
            origin: production.WEB_ORIGIN,
            "content-type": "text/plain",
          },
          body: "{}",
        },
        production,
      );

      expect(rejected.status).toBe(403);
      await expect(rejected.json()).resolves.toMatchObject({
        error: { code: "ACCESS_DENIED", traceId: "trace-origin" },
      });
      expect(allowed.status).toBe(204);
      expect(handler).toHaveBeenCalledOnce();
    },
  );

  it.each([undefined, "null"])(
    "rejects deployed cookie mutations with origin %s",
    async (origin) => {
      const { application, handler } = app();
      const headers = new Headers({ cookie: "better-auth.session_token=opaque" });
      if (origin !== undefined) headers.set("origin", origin);
      const response = await application.request(
        "https://api.example.test/resource",
        { method: "POST", headers, body: "{}" },
        production,
      );

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("does not apply cookie CSRF policy to bearer or anonymous mutations", async () => {
    const { application, handler } = app();
    const bearer = await application.request(
      "https://api.example.test/resource",
      { method: "POST", headers: { authorization: "Bearer key" }, body: "{}" },
      production,
    );
    const anonymous = await application.request(
      "https://api.example.test/resource",
      { method: "POST", body: "{}" },
      production,
    );

    expect(bearer.status).toBe(204);
    expect(anonymous.status).toBe(204);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("preserves local cookie mutations without an origin", async () => {
    const { application, handler } = app();
    const response = await application.request(
      "http://127.0.0.1:8787/resource",
      {
        method: "POST",
        headers: { cookie: "better-auth.session_token=opaque" },
        body: "{}",
      },
      { APP_ENV: "local", WEB_ORIGIN: "http://127.0.0.1:3015" },
    );

    expect(response.status).toBe(204);
    expect(handler).toHaveBeenCalledOnce();
  });
});
