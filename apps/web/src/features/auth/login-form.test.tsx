import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createLoginApi,
  getLoginCallbackUrl,
  LoginForm,
  LoginRequestError,
  resolveLoginConfig,
  resolveLoginLandingRoute,
  resolveLoginWorkspace,
  signInAndRedirect,
} from "./login-form";
import { safeLoginReturnTo } from "./return-path";

const API_ORIGIN = "https://api.example.com";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("organizer login", () => {
  it("submits credentials to the Better Auth email endpoint without a signup request", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return response(200, { token: "session-token", user: { id: "user-1" } });
    }) as typeof fetch;
    const api = createLoginApi(API_ORIGIN, fetcher);

    await expect(
      api.signInWithEmail({ email: " organizer@example.com ", password: "Passw0rd!" }),
    ).resolves.toBeUndefined();

    expect(requestUrl).toBe(`${API_ORIGIN}/api/auth/sign-in/email`);
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.credentials).toBe("include");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      email: " organizer@example.com ",
      password: "Passw0rd!",
    });
  });
  it("requests a magic link with the Better Auth callback payload", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return response(200, { status: true });
    }) as typeof fetch;
    const api = createLoginApi(API_ORIGIN, fetcher);

    await expect(
      api.requestMagicLink({
        email: "organizer@example.com",
        callbackURL: "https://app.example.com/admin",
      }),
    ).resolves.toBeUndefined();

    expect(requestUrl).toBe(`${API_ORIGIN}/api/auth/sign-in/magic-link`);
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.credentials).toBe("include");
    expect(requestInit?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      email: "organizer@example.com",
      callbackURL: "https://app.example.com/admin",
    });
  });

  it("returns password and magic-link authentication to the scoped CFP account route", async () => {
    const accountRoute = "/cfp/organizations/org-1/events/devflow-conf-2027/account";
    expect(safeLoginReturnTo(accountRoute)).toBe(accountRoute);
    expect(getLoginCallbackUrl("https://app.example.com/", accountRoute)).toBe(
      `https://app.example.com${accountRoute}`,
    );
    expect(
      resolveLoginLandingRoute(
        {
          session: { id: "session-1" },
          user: { id: "user-1" },
          memberships: [],
          speakerGrants: [],
        },
        accountRoute,
      ),
    ).toBe(accountRoute);
    expect(safeLoginReturnTo("/cfp/devflow-conf-2027/account")).toBe("/admin");
  });

  it("classifies magic-link network and server failures consistently", async () => {
    const networkApi = createLoginApi(API_ORIGIN, (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch);
    await expect(
      networkApi.requestMagicLink({
        email: "organizer@example.com",
        callbackURL: "https://app.example.com/admin",
      }),
    ).rejects.toMatchObject({ kind: "network" });

    const serverApi = createLoginApi(API_ORIGIN, (async () =>
      response(503, { code: "SERVICE_UNAVAILABLE" })) as typeof fetch);
    await expect(
      serverApi.requestMagicLink({
        email: "organizer@example.com",
        callbackURL: "https://app.example.com/admin",
      }),
    ).rejects.toMatchObject({
      kind: "server",
      message: expect.stringContaining("send a sign-in link"),
    });
  });
  it("fetches the authenticated session with credentials and preserves membership grants", async () => {
    const requests: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return response(200, {
        session: { id: "session-1" },
        user: {
          id: "user-1",
          memberships: [{ organizationId: "ai-engineer", role: "reviewer" }],
          speakerGrants: [],
        },
      });
    }) as typeof fetch;
    const api = createLoginApi(API_ORIGIN, fetcher);

    await expect(api.getSession()).resolves.toEqual({
      memberships: [{ organizationId: "ai-engineer", role: "reviewer" }],
      speakerGrants: [],
    });
    expect(requests).toEqual([`${API_ORIGIN}/api/auth/get-session`]);
  });
  it("creates an organizer account through Better Auth and returns a verification-required state", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return response(200, { user: { id: "user-1", email: "host@swyx.io" } });
    }) as typeof fetch;
    const api = createLoginApi(API_ORIGIN, fetcher);

    await expect(
      api.signUpWithEmail({
        name: "Host",
        email: " Host@SWYX.IO ",
        password: "Passw0rd!",
      }),
    ).resolves.toEqual({ verificationRequired: true });

    expect(requestUrl).toBe(`${API_ORIGIN}/api/auth/sign-up/email`);
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.credentials).toBe("include");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      name: "Host",
      email: "host@swyx.io",
      password: "Passw0rd!",
    });
  });

  it("allows any valid work email while leaving organization access to memberships", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    try {
      let requestCount = 0;
      const api = createLoginApi(API_ORIGIN, (async () => {
        requestCount += 1;
        return response(200, {});
      }) as typeof fetch);

      for (const email of ["host@example.com", "host@sub.swyx.io", "host@swyx.io.attacker"]) {
        await expect(
          api.signUpWithEmail({ name: "Host", email, password: "Passw0rd!" }),
        ).resolves.toEqual({ verificationRequired: true });
      }
      expect(requestCount).toBe(3);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("distinguishes invalid credentials, unverified email, and server failures", async () => {
    const cases = [
      {
        status: 401,
        body: { code: "INVALID_EMAIL_OR_PASSWORD" },
        kind: "invalid-credentials",
        message: "email or password is incorrect",
      },
      {
        status: 403,
        body: { code: "EMAIL_NOT_VERIFIED" },
        kind: "email-unverified",
        message: "not verified",
      },
      {
        status: 503,
        body: { code: "SERVICE_UNAVAILABLE" },
        kind: "server",
        message: "sign you in right now",
      },
    ] as const;

    for (const testCase of cases) {
      const api = createLoginApi(API_ORIGIN, (async () =>
        response(testCase.status, testCase.body)) as typeof fetch);
      const failure = await api
        .signInWithEmail({ email: "organizer@example.com", password: "Passw0rd!" })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LoginRequestError);
      expect(failure).toMatchObject({ kind: testCase.kind });
      expect((failure as Error).message.toLowerCase()).toContain(testCase.message);
    }
  });

  it("redirects only after a credential session is created", async () => {
    const navigate = vi.fn();
    const sessions = [
      { memberships: [{ role: "admin" as const }], speakerGrants: [] },
      { memberships: [], speakerGrants: [{ organizationId: "ai-engineer" }] },
    ];
    const api = {
      signInWithEmail: vi.fn(async () => undefined),
      getSession: vi.fn(async () => sessions.shift() ?? { memberships: [], speakerGrants: [] }),
    };

    await signInAndRedirect({
      api,
      email: "organizer@example.com",
      password: "Passw0rd!",
      navigate,
    });
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/admin");
    await signInAndRedirect({
      api,
      email: "speaker@example.com",
      password: "Passw0rd!",
      navigate,
      returnTo: "/portal/tasks?eventId=event-1",
    });
    expect(navigate).toHaveBeenLastCalledWith("/portal/tasks?eventId=event-1");
    expect(
      resolveLoginLandingRoute(
        { memberships: [], speakerGrants: [] },
        "/cfp/organizations/ai-engineer/events/devflow-conf-2027/account",
      ),
    ).toBe("/cfp/organizations/ai-engineer/events/devflow-conf-2027/account");
    expect(safeLoginReturnTo("https://evil.example")).toBe("/admin");
    expect(safeLoginReturnTo("//evil.example")).toBe("/admin");
  });

  it("chooses reviewer, organizer, and speaker defaults while rejecting unsafe next routes", () => {
    const reviewer = { memberships: [{ role: "reviewer" as const }], speakerGrants: [] };
    const organizer = { memberships: [{ role: "owner" as const }], speakerGrants: [] };
    const speaker = { memberships: [], speakerGrants: [{ organizationId: "ai-engineer" }] };

    expect(resolveLoginLandingRoute(reviewer)).toBe("/review");
    expect(resolveLoginLandingRoute(organizer)).toBe("/admin");
    expect(resolveLoginLandingRoute(speaker)).toBe("/portal");
    expect(resolveLoginLandingRoute(reviewer, "/admin/events")).toBe("/admin/events");
    expect(resolveLoginLandingRoute(reviewer, "https://evil.example")).toBe("/review");
    expect(resolveLoginLandingRoute(reviewer, "//evil.example")).toBe("/review");
  });

  it("fails closed for a missing or malformed authenticated session", () => {
    expect(() => resolveLoginLandingRoute(null)).toThrow(LoginRequestError);
    expect(() => resolveLoginLandingRoute({ memberships: "reviewer" })).toThrow(
      /verify your account access/i,
    );
  });
  it("renders concise access modes and shadcn form controls", () => {
    const markup = renderToStaticMarkup(createElement(LoginForm, { apiBaseUrl: API_ORIGIN }));

    expect(markup).toContain('id="login-main"');
    expect(markup).toContain('for="login-email"');
    expect(markup).toContain('autoComplete="email"');
    expect(markup).toContain('for="login-password"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="tabs-list"');
    expect(markup).toContain('data-slot="tabs-trigger"');
    expect(markup).toContain('data-slot="input"');
    expect(markup).toContain('data-slot="label"');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain("Email me a magic link");
    expect(markup).toContain("Account access mode");
    expect(markup).toContain("Create account");
    expect(markup).toContain("One account, separate workspaces");
    expect(markup).toContain("Sign in to Open Sessionboard");
    expect(markup).toContain("Organizers");
    expect(markup).toContain("Reviewers");
    expect(markup).toContain("applicant and speaker portal");
    expect(markup).toContain("Applicants and speakers");
    expect(markup).not.toContain("Welcome back to the program desk.");
    expect(markup).not.toContain("01");
    expect(markup).not.toContain("Google");
    expect(markup).not.toContain("sign-in/social");
    expect(markup).not.toContain("sign-up/email");
  });
  it("renders the explicit organizer signup mode and segmented sign-in tab", () => {
    const markup = renderToStaticMarkup(
      createElement(LoginForm, { apiBaseUrl: API_ORIGIN, initialMode: "sign-up" }),
    );

    expect(markup).toContain("Create organizer account");
    expect(markup).toContain('for="login-name"');
    expect(markup).toContain('autoComplete="new-password"');
    expect(markup).toContain("Sign in");
    expect(markup).toContain(
      "Use your work email. Organization access is granted by an owner or administrator.",
    );
    expect(markup).not.toContain("Google");
    expect(markup).not.toContain("Email me a magic link");
  });

  it("renders a distinct applicant and speaker sign-in mode for the portal destination", () => {
    const markup = renderToStaticMarkup(
      createElement(LoginForm, {
        apiBaseUrl: API_ORIGIN,
        returnTo: "/portal/submissions",
      }),
    );

    expect(resolveLoginWorkspace("/portal")).toBe("portal");
    expect(resolveLoginWorkspace("/portal/submissions?event=event-1")).toBe("portal");
    expect(resolveLoginWorkspace("/admin")).toBe("operator");
    expect(resolveLoginWorkspace("https://evil.example/portal")).toBe("operator");
    expect(markup).toContain('data-login-workspace="portal"');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain('href="/login?next=%2Fportal" aria-current="page"');
    expect(markup).not.toContain('data-slot="tabs-list"');
  });

  it("uses the same-origin gateway without browser API configuration", () => {
    expect(resolveLoginConfig({})).toEqual({ apiBaseUrl: "" });
    expect(resolveLoginConfig({ apiBaseUrl: "   " })).toEqual({ apiBaseUrl: "" });

    const markup = renderToStaticMarkup(createElement(LoginForm, { apiBaseUrl: "   " }));

    expect(markup).not.toContain('id="login-config-error"');
    expect(markup).not.toContain("NEXT_PUBLIC_API_URL");
  });
});
