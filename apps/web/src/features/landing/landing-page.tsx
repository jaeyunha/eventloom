import Link from "next/link";
import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { LandingInteractions } from "./landing-interactions";
import { LandingPublishingSections } from "./landing-publishing-sections";
import { LandingWorkflowSection } from "./landing-workflow-section";
import { LandingWorkspacesSection } from "./landing-workspaces-section";

export function LandingPage() {
  return (
    <div className="shell" id="eventloom-landing">
      <Link className="skip-link" href="#main">
        Skip to main content
      </Link>
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
          <span>Source-available program operations for conference teams.</span>
          <nav className="footer-links" aria-label="Footer navigation">
            <Link href="/events">Events</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="https://github.com/namuh-eng/eventloom">GitHub</a>
          </nav>
          <span>Elastic-2.0 (source-available)</span>
        </div>
      </footer>
      <LandingInteractions />
    </div>
  );
}
