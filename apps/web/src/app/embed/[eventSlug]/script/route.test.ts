import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("script embed loader", () => {
  it("creates a sandboxed responsive iframe with allowlisted view and theme", async () => {
    const response = await GET(new Request("https://eventloom.example/embed/open/script"), {
      params: Promise.resolve({ eventSlug: "open/systems" }),
    });
    const source = await response.text();

    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(source).toContain('requestedView === "speakers"');
    expect(source).toContain('requestedView === "sessions"');
    expect(source).toContain('requestedView === "itinerary"');
    expect(source).toContain("iframe mode");
    expect(source).toContain('requestedTheme === "dark"');
    expect(source).toContain('frame.setAttribute("sandbox", "allow-scripts")');
    expect(source).toContain('frame.style.width = "100%"');
    expect(source).toContain('encodeURIComponent("open/systems")');
  });

  it("rejects iframe-only sessions and itinerary views from script requests", async () => {
    for (const view of ["sessions", "itinerary"] as const) {
      const response = await GET(
        new Request(`https://eventloom.example/embed/open/script?view=${view}`),
        {
          params: Promise.resolve({ eventSlug: "open/systems" }),
        },
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "UNSUPPORTED_EMBED_SCRIPT_VIEW",
          message:
            "Sessions and itinerary embeds use iframe mode; script mode supports only agenda and speakers.",
        },
      });
    }
  });
});
