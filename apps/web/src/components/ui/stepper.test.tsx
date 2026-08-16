import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Stepper } from "./stepper";

const stepperStyles = readFileSync(
  new URL("../../styles/design-system.module.css", import.meta.url),
  "utf8",
);
const sharedTokens = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");

describe("shared stepper", () => {
  it("exposes completed, current, and upcoming states semantically", () => {
    const markup = renderToStaticMarkup(
      <Stepper
        currentStep="proposal"
        steps={[
          { id: "account", label: "Account" },
          { id: "proposal", label: "Proposal" },
          { id: "review", label: "Review" },
        ]}
      />,
    );

    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain("Complete");
    expect(markup).toContain("Review");
  });

  it("uses dashboard semantic colors for legible states in both themes", () => {
    expect(stepperStyles).toMatch(/\.stepLink\s*\{[\s\S]*color:\s*var\(--foreground\);/u);
    expect(stepperStyles).toMatch(
      /\.stepMarker\s*\{[\s\S]*background:\s*var\(--background\);[\s\S]*color:\s*var\(--foreground\);/u,
    );
    expect(stepperStyles).toMatch(
      /\.stepCurrent \.stepLabel\s*\{[\s\S]*color:\s*var\(--foreground\);/u,
    );
    expect(stepperStyles).toMatch(
      /\.stepComplete \.stepMarker\s*\{[\s\S]*background:\s*var\(--primary\);[\s\S]*color:\s*var\(--primary-foreground\);/u,
    );
  });

  it("maps legacy form primitives onto the active dashboard theme", () => {
    expect(sharedTokens).toContain("--sb-color-ink: var(--foreground);");
    expect(sharedTokens).toContain("--sb-color-muted: var(--muted-foreground);");
    expect(sharedTokens).toContain("--sb-color-surface: var(--card);");
    expect(sharedTokens).toContain("--sb-color-surface-muted: var(--muted);");
    expect(sharedTokens).toContain("--sb-color-border: var(--border);");
  });
});
