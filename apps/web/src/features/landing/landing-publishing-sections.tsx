import { LandingIcon } from "./landing-icon";

const openSourceBenefits = [
  "AGPL-3.0-or-later",
  "Self-hostable",
  "Versioned API and webhooks",
  "Privacy-safe projections",
] as const;

export function LandingPublishingSections() {
  return (
    <>
      <section className="section" id="publishing" aria-labelledby="publishing-title">
        <div className="wrap boundary-panel" data-reveal>
          <div>
            <p className="eyebrow">Responsible publishing by design</p>
            <h2 id="publishing-title">Publish the program, not your working table.</h2>
            <p className="section-intro">
              Drafts, reviewer notes, private uploads, and coordination details stay behind
              authorization. Public surfaces read only an explicitly published, privacy-safe
              revision.
            </p>
          </div>
          <section className="revision-flow" aria-label="Private draft to public revision flow">
            <div className="revision-lane">
              <span>Draft v8</span>
              <strong>Private agenda workspace</strong>
              <small>Working sessions, notes, conflicts, and permissions</small>
            </div>
            <div className="revision-gate">
              <LandingIcon name="check" />
              Validate conflicts and permissions
            </div>
            <div className="revision-lane current">
              <span>Revision 7 · Current</span>
              <strong>Public program projection</strong>
              <small>Agenda, calendar, embeds, webhooks, and cache</small>
            </div>
          </section>
        </div>
      </section>

      <section className="section" id="open-source" aria-labelledby="open-source-title">
        <div className="wrap open-source">
          <div data-reveal>
            <p className="eyebrow">Open infrastructure, accountable operations</p>
            <h2 id="open-source-title">Own the workflow your conference depends on.</h2>
            <p className="section-intro">
              Eventloom is inspectable, adaptable software for teams replacing closed
              program-management systems without giving up operational rigor.
            </p>
            <ul className="check-list">
              {openSourceBenefits.map((benefit) => (
                <li key={benefit}>
                  <LandingIcon name="check" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
          <figure
            className="source-console"
            data-reveal
            aria-label="Illustrative deployment console"
          >
            <div className="console-head">
              <span>eventloom / deployment</span>
              <span>read-only preview</span>
            </div>
            <div className="console-body">
              <span className="console-muted">$ eventloom access list --profile work</span>
              <span className="console-good">✓ Fresh event access resolved</span>
              <span className="console-indent">organizer · Open Systems Summit</span>
              <span className="console-muted">$ eventloom organizer status</span>
              <span className="console-good">✓ Program workspace ready</span>
              <span className="console-indent">draft agenda · 1 warning</span>
              <span className="console-indent">public revision · current</span>
            </div>
          </figure>
        </div>
      </section>

      <section className="final-cta">
        <div className="wrap cta-panel" data-reveal>
          <div>
            <h2>Bring the full program into one accountable workflow.</h2>
            <p>
              Start with the public product surfaces, visit the GitHub repository, and decide how
              Eventloom fits your event operations.
            </p>
          </div>
          <a className="button button-primary" href="/events">
            Explore public events <LandingIcon name="arrow-right" />
          </a>
        </div>
      </section>
    </>
  );
}
