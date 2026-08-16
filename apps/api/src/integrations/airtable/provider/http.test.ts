import { describe, expect, it, vi } from "vitest";

import { AirtableHttpProvider } from "./http";

describe("AirtableHttpProvider", () => {
  it("builds a PKCE authorization URL and exchanges a code", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }),
    );
    const provider = new AirtableHttpProvider({
      clientId: "client",
      clientSecret: "secret",
      fetch: fetcher,
    });
    const url = new URL(
      provider.authorizationUrl({
        redirectUri: "https://example.test/callback",
        state: "state",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        scopes: ["data.records:read"],
      }),
    );
    expect(url.searchParams.get("state")).toBe("state");
    await expect(
      provider.exchangeAuthorizationCode({
        code: "code",
        codeVerifier: "verifier",
        redirectUri: "https://example.test/callback",
      }),
    ).resolves.toMatchObject({ accessToken: "access", refreshToken: "refresh" });
    const request = (fetcher.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>)[0];
    expect(String(request?.[0])).toContain("/oauth2/v1/token");
  });

  it("loads identity and base schema with bearer auth", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "usr", scopes: ["schema.bases:read"] }))
      .mockResolvedValueOnce(Response.json({ bases: [{ id: "app", name: "Program" }] }))
      .mockResolvedValueOnce(
        Response.json({
          tables: [
            {
              id: "tbl",
              name: "Events",
              fields: [{ id: "fld", name: "Application ID", type: "singleLineText" }],
            },
          ],
        }),
      );
    const provider = new AirtableHttpProvider({ clientId: "client", fetch: fetcher });
    await expect(
      provider.inspectCredential({ authMode: "pat", credential: "pat" }),
    ).resolves.toMatchObject({ userId: "usr" });
    await expect(
      provider.getBaseSchema({ authMode: "pat", credential: "pat", baseId: "app" }),
    ).resolves.toMatchObject({ id: "app", name: "Program", tables: [{ id: "tbl" }] });
    expect(fetcher.mock.calls.every((call) => call[1]?.headers)).toBe(true);
  });
});
