import { z } from "zod";
import { LandingIcon } from "./landing-icon";
import { LandingProductDemo } from "./landing-product-demo";

const repositoryApiUrl = "https://api.github.com/repos/namuh-eng/eventloom";
const GITHUB_STAR_COUNT_FORMATTER = new Intl.NumberFormat("en-US");
const repositoryResponseSchema = z.object({
  stargazers_count: z.number().int().nonnegative(),
});

type RepositoryBadge = {
  readonly accessibleLabel: string;
  readonly label: string;
};

async function resolveRepositoryBadge(): Promise<RepositoryBadge> {
  try {
    const response = await fetch(repositoryApiUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(2_500),
    });

    if (response.status === 404) {
      return {
        accessibleLabel: "Private GitHub repository",
        label: "Private",
      };
    }

    if (!response.ok) {
      return {
        accessibleLabel: "GitHub star count unavailable",
        label: "—",
      };
    }

    const repository = repositoryResponseSchema.safeParse(await response.json());
    if (!repository.success) {
      return {
        accessibleLabel: "GitHub star count unavailable",
        label: "—",
      };
    }

    const label = GITHUB_STAR_COUNT_FORMATTER.format(repository.data.stargazers_count);
    return {
      accessibleLabel: `${label} GitHub stars`,
      label,
    };
  } catch {
    // no-excuse-ok: catch -- GitHub availability must never block the landing page.
    return {
      accessibleLabel: "GitHub star count unavailable",
      label: "—",
    };
  }
}

export async function LandingHero() {
  const repositoryBadge = await resolveRepositoryBadge();

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="wrap">
        <div className="hero-copy">
          <p className="eyebrow">Source-available conference program operations</p>
          <h1 id="hero-title">
            <span className="hero-title-line">Shape the program.</span>
            <span className="hero-title-line">Keep every handoff connected.</span>
          </h1>
          <p className="hero-lede">
            Collect proposals, coordinate speakers, run human-led reviews, resolve agenda conflicts,
            and publish a privacy-safe program from one operational workspace.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#product-proof">
              See the workflow
              <LandingIcon name="arrow-right" />
            </a>
            <a
              className="button button-secondary github-button"
              href="https://github.com/namuh-eng/eventloom"
              aria-label={`GitHub · ${repositoryBadge.accessibleLabel}`}
            >
              <LandingIcon name="github" />
              GitHub
              <span className="github-stars">
                <LandingIcon name="star" />
                <span>{repositoryBadge.label}</span>
              </span>
            </a>
          </div>
          <a className="hero-update" href="#product-proof">
            <strong>New</strong>
            Agenda workspace
            <LandingIcon name="arrow-right" />
          </a>
        </div>
        <LandingProductDemo />
      </div>
    </section>
  );
}
