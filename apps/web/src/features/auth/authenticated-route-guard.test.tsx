import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthenticatedRouteGuard } from "./authenticated-route-guard";

describe("authenticated route guard", () => {
  it("does not server-render protected children before session resolution", () => {
    const markup = renderToStaticMarkup(
      <AuthenticatedRouteGuard>
        <div data-protected-workspace="true">Protected workspace</div>
      </AuthenticatedRouteGuard>,
    );

    expect(markup).not.toContain("data-protected-workspace");
    expect(markup).toContain('data-authenticated-route-state="checking"');
  });
});
