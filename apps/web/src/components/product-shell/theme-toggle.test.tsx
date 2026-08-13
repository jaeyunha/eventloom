import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

describe("public theme toggle", () => {
  it("renders an accessible control before the client theme resolves", () => {
    const markup = renderToStaticMarkup(<ThemeToggle />);

    expect(markup).toContain("<button");
    expect(markup).toContain('aria-label="Toggle color theme"');
    expect(markup).toContain('title="Toggle color theme"');
  });
});
