import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingHero } from "./landing-hero";

describe("LandingHero repository badge", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders the current star count when GitHub exposes the repository", async () => {
    // Given
    const fetcher = vi.fn(async () =>
      Response.json({
        stargazers_count: 27,
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    // When
    const markup = renderToStaticMarkup(await LandingHero());

    // Then
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.github.com/repos/namuh-eng/eventloom",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(markup).toContain(">27<");
  });

  it("renders the private fallback when GitHub hides the repository", async () => {
    // Given
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          message: "Not Found",
        },
        { status: 404 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);

    // When
    const markup = renderToStaticMarkup(await LandingHero());

    // Then
    expect(fetcher).toHaveBeenCalledOnce();
    expect(markup).toContain(">Private<");
  });

  it("does not report a public repository as private when GitHub is unavailable", async () => {
    // Given
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          message: "API rate limit exceeded",
        },
        { status: 403 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);

    // When
    const markup = renderToStaticMarkup(await LandingHero());

    // Then
    expect(markup).not.toContain(">Private<");
  });
});
