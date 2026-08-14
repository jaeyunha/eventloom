import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingGroup, SettingRow, SettingsShell } from "./settings-ui";

describe("settings UI", () => {
  it("renders a labelled settings destination with navigation and rows", () => {
    const markup = renderToStaticMarkup(
      createElement(
        SettingsShell,
        {
          navigation: createElement(
            "nav",
            { "aria-label": "Settings destinations" },
            createElement("a", { "aria-current": "page", href: "/settings/general" }, "General"),
          ),
        },
        createElement(
          SettingGroup,
          {
            title: "General",
            description: "Shared configuration.",
            action: createElement("button", { type: "button" }, "Add"),
          },
          createElement(
            "ul",
            null,
            createElement(SettingRow, {
              label: "Visibility",
              description: "Controls who can view this object.",
              controls: createElement("button", { type: "button" }, "Change"),
            }),
          ),
        ),
      ),
    );

    expect(markup).toContain('aria-label="Settings destinations"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("<section");
    expect(markup).toContain("<h2");
    expect(markup).toContain("Visibility");
    expect(markup).toContain('type="button"');
  });

  it("does not invent controls for read-only setting rows", () => {
    const markup = renderToStaticMarkup(
      createElement("ul", null, createElement(SettingRow, { label: "Event ID" })),
    );

    expect(markup).toContain("Event ID");
    expect(markup).not.toContain("<button");
  });
});
