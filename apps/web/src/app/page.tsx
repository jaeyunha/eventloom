import { getInvalidEnvironmentFields, readWebEnvironment } from "../env";

const workflowSteps = ["Collect", "Review", "Schedule", "Publish"];

export default function Home() {
  const environment = readWebEnvironment();
  const invalidFields = environment.success ? [] : getInvalidEnvironmentFields();

  return (
    <main>
      <nav className="site-nav" aria-label="Primary navigation">
        <a className="wordmark" href="#top" aria-label="Open Sessionboard home">
          <span aria-hidden="true">OS</span>
          Open Sessionboard
        </a>
        <a className="nav-link" href="#foundation">
          Platform foundation
        </a>
      </nav>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="eyebrow">Open program operations</div>
        <h1 id="hero-title">A clear path from call for speakers to published agenda.</h1>
        <p className="hero-copy">
          A fast, accessible workspace for conference organizers and speakers, built around
          deliberate review and conflict-safe publishing.
        </p>
        <div className="workflow" aria-label="Program workflow">
          {workflowSteps.map((step, index) => (
            <div className="workflow-step" key={step}>
              <span>{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
      </section>

      <section className="foundation" id="foundation" aria-labelledby="foundation-title">
        <div>
          <div className="eyebrow">Application foundation</div>
          <h2 id="foundation-title">Independent surfaces. Explicit boundaries.</h2>
          <p>
            The browser application is a dedicated Next.js deployment. Program workflows and
            provider access belong to the standalone Cloudflare Worker API.
          </p>
        </div>

        <div className="boundary-grid">
          <article className="boundary-card">
            <span className="card-label">Web</span>
            <h3>Accessible interface</h3>
            <p>Sessionboard-inspired patterns without direct access to data providers or secrets.</p>
          </article>
          <article className="boundary-card">
            <span className="card-label">API</span>
            <h3>Cloudflare Worker</h3>
            <p>Hono owns validation, authorization, workflow orchestration, and integrations.</p>
          </article>
          <article className="boundary-card">
            <span className="card-label">Authority</span>
            <h3>Airtable records</h3>
            <p>Business data remains separate from Cloudflare operational and coordination state.</p>
          </article>
        </div>

        {environment.success ? (
          <div className="status-banner status-ready" role="status">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>Foundation configured</strong>
              <span>
                API boundary: <code>{environment.data.NEXT_PUBLIC_API_URL}</code>
              </span>
            </div>
          </div>
        ) : (
          <div className="status-banner status-warning" role="status">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>Local configuration required</strong>
              <span>Set {invalidFields.join(", ")} before connecting the application.</span>
            </div>
          </div>
        )}
      </section>

      <footer>
        <span>Open Sessionboard</span>
        <span>AGPL-3.0-or-later</span>
      </footer>
    </main>
  );
}
