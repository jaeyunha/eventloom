import { LandingIcon } from "./landing-icon";
import { LandingProductDemo } from "./landing-product-demo";

export function LandingHero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="wrap">
        <div className="hero-copy">
          <p className="eyebrow">Open-source conference program operations</p>
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
              href="https://github.com/jaeyunha/open-sessionboard"
            >
              <LandingIcon name="github" />
              GitHub
              <span className="github-stars">
                <LandingIcon name="star" />
                <span>Private</span>
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
