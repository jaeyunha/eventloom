import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { LandingInteractions } from "./landing-interactions";
import { LandingPublishingSections } from "./landing-publishing-sections";
import { LandingWorkflowSection } from "./landing-workflow-section";
import { LandingWorkspacesSection } from "./landing-workspaces-section";

export function LandingPage() {
  return (
    <div className="shell" id="eventloom-landing">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <LandingHeader />
      <main id="main" tabIndex={-1}>
        <LandingHero />
        <LandingWorkflowSection />
        <LandingWorkspacesSection />
        <LandingPublishingSections />
      </main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <strong>Eventloom</strong>
          <span>Open-source program operations for conference teams.</span>
          <nav className="footer-links" aria-label="Footer navigation">
            <a href="/events">Events</a>
            <a href="/login">Sign in</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="https://github.com/jaeyunha/open-sessionboard">GitHub</a>
          </nav>
          <span>AGPL-3.0-or-later</span>
        </div>
      </footer>
      <LandingInteractions />
    </div>
  );
}
