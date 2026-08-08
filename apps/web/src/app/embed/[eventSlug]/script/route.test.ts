import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("script embed loader", () => {
  it("creates a sandboxed responsive iframe with allowlisted view and theme", async () => {
    const response = await GET(new Request("https://sessionboard.example/embed/open/script"), {
      params: Promise.resolve({ eventSlug: "open/systems" }),
    });
    const source = await response.text();

    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(source).toContain('requestedView === "speakers"');
    expect(source).toContain('requestedTheme === "dark"');
    expect(source).toContain('frame.setAttribute("sandbox", "allow-scripts")');
    expect(source).toContain('frame.style.width = "100%"');
    expect(source).toContain('encodeURIComponent("open/systems")');
  });
});
