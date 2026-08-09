import { describe, expect, it } from "vitest";
import { CfpApiError, createCfpApi } from "./api";

describe("CFP Google sign-in", () => {
  it("starts Google OAuth with the exact callback URL", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return Response.json({
        url: "https://accounts.google.com/o/oauth2/v2/auth?state=verified",
        redirect: true,
      });
    }) as typeof fetch;
    const api = createCfpApi("https://api.example.com", fetcher);

    await expect(
      api.startGoogleSignIn({ callbackURL: "https://app.example.com/cfp/event/account" }),
    ).resolves.toBe("https://accounts.google.com/o/oauth2/v2/auth?state=verified");
    expect(requestUrl).toBe("https://api.example.com/api/auth/sign-in/social");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.credentials).toBe("include");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      provider: "google",
      callbackURL: "https://app.example.com/cfp/event/account",
    });
  });

  it("rejects a non-Google authorization URL", async () => {
    const api = createCfpApi("https://api.example.com", (async () =>
      Response.json({ url: "https://evil.example/authorize" })) as typeof fetch);

    const error = await api
      .startGoogleSignIn({ callbackURL: "https://app.example.com/cfp/event/account" })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(CfpApiError);
    expect(error).toMatchObject({
      code: "GOOGLE_SIGN_IN_FAILED",
      status: 502,
    });
  });
});
