import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

const rootLayoutSource = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
const themeToggleSource = readFileSync(new URL("./theme-toggle.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

describe("public theme toggle", () => {
  it("renders an accessible control before the client theme resolves", () => {
    const markup = renderToStaticMarkup(<ThemeToggle />);

    expect(markup).toContain("<button");
    expect(markup).toContain('aria-label="Choose color theme"');
    expect(markup).toContain('title="Choose color theme"');
  });

  it("offers light, dark, and system modes while defaulting new sessions to light", () => {
    expect(rootLayoutSource).toContain('defaultTheme="light"');
    expect(rootLayoutSource).toContain("enableSystem");
    expect(themeToggleSource).toContain('value: "light"');
    expect(themeToggleSource).toContain('value: "dark"');
    expect(themeToggleSource).toContain('value: "system"');
  });

  it("keeps the appearance trigger at a touch-safe size in every theme", () => {
    expect(globalStyles).toMatch(
      /\.product-theme-toggle\s*\{[\s\S]*min-width:\s*2\.75rem;[\s\S]*min-height:\s*2\.75rem;/u,
    );
  });
});
