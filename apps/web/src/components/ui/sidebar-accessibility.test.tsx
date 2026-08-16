import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SidebarInset } from "./sidebar";

describe("sidebar landmark accessibility", () => {
  it("does not add a nested main landmark around organizer content", () => {
    const markup = renderToStaticMarkup(
      createElement(
        SidebarInset,
        null,
        createElement("main", { id: "admin-content", tabIndex: -1 }, "Organizer content"),
      ),
    );

    expect((markup.match(/<main\b/g) ?? []).length).toBe(1);
    expect(markup).toContain('id="admin-content"');
    expect(markup).toContain('tabindex="-1"');
  });
});
