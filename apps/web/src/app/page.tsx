import { ProductNavigation } from "../components/product-shell/product-navigation";
export const dynamic = "force-dynamic";

const workflowSteps = [
  {
    number: "01",
    label: "Collect",
    description:
      "Open a clear call for speakers and keep drafts, participants, and uploads in their proper boundary.",
  },
  {
    number: "02",
    label: "Review",
    description:
      "Give reviewers focused assignments while human organizers remain the final decision-makers.",
  },
  {
    number: "03",
    label: "Schedule",
    description:
      "Turn accepted sessions into a versioned agenda with conflict checks before anything is published.",
  },
  {
    number: "04",
    label: "Publish",
    description:
      "Release an intentional public projection of the program, not private working data.",
  },
] as const;

const roleSurfaces = [
  {
    label: "For speakers",
    title: "A calm place to submit and prepare",
    description:
      "Speakers can follow their submission, profile, participant, and task work without seeing organizer-only notes.",
    href: "/portal",
    linkLabel: "Open speaker portal",
  },
  {
    label: "For organizers",
    title: "A program desk with clear authority",
    description:
      "Organizers coordinate the event, make final decisions, and publish only after the program is ready to share.",
    href: "/admin",
    linkLabel: "Open organizer workspace",
  },
  {
    label: "For reviewers",
    title: "Focused review, accountable decisions",
    description:
      "Reviewers see assigned work and submit human evaluations. Assistance can summarize, but it never accepts or rejects.",
    href: "/review",
    linkLabel: "Open reviewer workspace",
  },
] as const;

export default function Home() {
  return (
    <div className="home-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <ProductNavigation />

      <main className="home-main" id="main-content" tabIndex={-1}>
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="home-hero-copy">
            <p className="home-kicker">Open-source program operations</p>
            <h1 id="hero-title">Move from a call for speakers to a published agenda with care.</h1>
            <p className="home-lede">
              Open Sessionboard brings collecting, reviewing, scheduling, and publishing into one
              deliberate workflow for conference teams and speakers.
            </p>
            <div className="home-actions">
              <a className="home-button home-button-primary" href="/cfp/devflow-conf-2027">
                Open the CFP
              </a>
              <a className="home-button home-button-secondary" href="/login">
                Sign in
              </a>
            </div>
            <p className="home-note">
              Submitters create or use an account during the CFP. Accepted speakers return to the
              portal for profiles, tasks, and files.
            </p>
          </div>

          <aside className="home-hero-card" aria-label="Workflow guardrails">
            <div className="home-card-heading">
              <span className="home-card-label">Workflow map</span>
              <span className="home-card-meta">Human-led</span>
            </div>
            <p className="home-card-title">Four handoffs. No mystery state.</p>
            <ol className="home-mini-workflow">
              {workflowSteps.map((step, index) => (
                <li
                  className={
                    index === 0 ? "home-mini-step home-mini-step-current" : "home-mini-step"
                  }
                  key={step.label}
                >
                  <span className="home-mini-marker" aria-hidden="true">
                    {step.number}
                  </span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>
                      {index === 0
                        ? "Open the call and collect the work."
                        : index === 1
                          ? "Reviewers advise; people decide."
                          : index === 2
                            ? "Check conflicts before committing."
                            : "Share an explicit public projection."}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        <section
          className="home-section home-workflow-section"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <div className="home-section-heading">
            <p className="home-kicker">The operating model</p>
            <h2 id="workflow-title">
              One connected workflow, with the right person at each handoff.
            </h2>
            <p>
              The shell is intentionally straightforward: collect the material, review it with care,
              schedule around real constraints, then publish what the audience should see.
            </p>
          </div>
          <ol className="home-workflow-grid">
            {workflowSteps.map((step) => (
              <li className="home-workflow-card" key={step.label}>
                <span className="home-step-number">{step.number}</span>
                <h3>{step.label}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="home-section home-surfaces-section"
          id="workspaces"
          aria-labelledby="surfaces-title"
        >
          <div className="home-section-heading">
            <p className="home-kicker">A surface for every role</p>
            <h2 id="surfaces-title">
              Keep private work private, and make the next action obvious.
            </h2>
            <p>
              Different people need different views of the same program. Product surfaces stay
              scoped to the role and event they serve.
            </p>
          </div>
          <div className="home-role-grid">
            {roleSurfaces.map((surface) => (
              <article className="home-role-card" key={surface.label}>
                <span className="home-card-label">{surface.label}</span>
                <h3>{surface.title}</h3>
                <p>{surface.description}</p>
                <a className="home-inline-link" href={surface.href}>
                  {surface.linkLabel}
                  <span aria-hidden="true"> →</span>
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="home-boundaries" id="boundaries" aria-labelledby="boundaries-title">
          <div className="home-boundaries-copy">
            <p className="home-kicker">Designed for responsible publishing</p>
            <h2 id="boundaries-title">The public view is a projection, not the working table.</h2>
            <p>
              Drafts, reviewer notes, private uploads, and coordination details stay behind
              authorization. Public speaker and agenda surfaces expose only fields an organizer has
              explicitly published.
            </p>
          </div>
          <div className="home-boundary-list">
            <div className="home-boundary-item">
              <span className="home-boundary-mark" aria-hidden="true">
                01
              </span>
              <div>
                <h3>Human-authoritative review</h3>
                <p>
                  Tools may assist with summaries, but acceptance and rejection remain human
                  decisions.
                </p>
              </div>
            </div>
            <div className="home-boundary-item">
              <span className="home-boundary-mark" aria-hidden="true">
                02
              </span>
              <div>
                <h3>Conflict-safe scheduling</h3>
                <p>
                  Agenda changes are checked and versioned before the next published calendar is
                  made.
                </p>
              </div>
            </div>
            <div className="home-boundary-item">
              <span className="home-boundary-mark" aria-hidden="true">
                03
              </span>
              <div>
                <h3>Explicit public projections</h3>
                <p>
                  Publishing is a deliberate boundary, so private working context does not leak into
                  embeds.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="home-open-source" aria-labelledby="open-source-title">
          <div>
            <p className="home-kicker">Open by default</p>
            <h2 id="open-source-title">Program infrastructure should be inspectable.</h2>
          </div>
          <p>
            Open Sessionboard is open-source software for teams who want to understand their
            workflow, adapt it to their events, and keep operational decisions accountable.
          </p>
          <a className="home-button home-button-secondary" href="/login">
            Sign in to a workspace
          </a>
        </section>
      </main>

      <footer className="home-footer">
        <div>
          <strong>Open Sessionboard</strong>
          <span>Open-source program operations for conference teams.</span>
        </div>
        <span>AGPL-3.0-or-later</span>
      </footer>
    </div>
  );
}
