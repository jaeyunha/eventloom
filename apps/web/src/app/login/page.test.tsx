import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LoginPage from "./page";

describe("LoginPage", () => {
  it("does not expose the sign-in form before checking the existing session", async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(createElement(() => page));

    expect(markup).toContain('data-login-session-gate="checking"');
    expect(markup).not.toContain('data-login-workspace="operator"');
  });
});
