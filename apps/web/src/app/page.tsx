import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  FileText,
  GitBranch,
  Grid2X2,
  LayoutDashboard,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRoundCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductNavigation } from "../components/product-shell/product-navigation";

export const dynamic = "force-dynamic";

const workflowSteps = [
  {
    number: "01",
    label: "Collect",
    title: "A CFP applicants can finish",
    description:
      "Build conditional forms, keep drafts resumable, and collect participants and files without exposing organizer work.",
    preview: "submission",
  },
  {
    number: "02",
    label: "Review",
    title: "Focused review with human authority",
    description:
      "Assign rubrics and blind-review boundaries while every score and final decision stays accountable to a person.",
    preview: "review",
  },
  {
    number: "03",
    label: "Schedule",
    title: "A private agenda that catches conflicts",
    description:
      "Place accepted sessions into a versioned draft and validate rooms, speakers, travel, tracks, and capacity.",
    preview: "schedule",
  },
  {
    number: "04",
    label: "Publish",
    title: "A deliberate public projection",
    description:
      "Publish an immutable revision to public agenda, calendar, embed, webhook, and cache delivery surfaces.",
    preview: "publish",
  },
] as const;

const capabilityItems = [
  "Conditional CFP",
  "Human-led review",
  "Speaker operations",
  "Conflict checks",
  "Public agenda & embeds",
] as const;

const openSourceBenefits = [
  "AGPL-3.0-or-later",
  "Self-hostable",
  "Versioned API and webhooks",
  "Privacy-safe public projections",
] as const;

function AgendaProductFrame() {
  return (
    <div className="home-product-stage" aria-hidden="true">
      <div className="home-product-frame">
        <div className="home-product-toolbar">
          <div className="home-browser-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="home-product-toolbar-title">
            <span className="home-product-live-dot" aria-hidden="true" />
            Open Sessionboard · Organizer workspace
          </div>
          <span className="home-product-toolbar-meta">Demo organization</span>
        </div>

        <div className="home-demo-shell">
          <aside className="home-demo-sidebar">
            <div className="home-demo-brand">
              <span>OS</span>
              <strong>Open Sessionboard</strong>
            </div>
            <small>Workspace</small>
            <div className="home-demo-navigation">
              <span className="is-active">
                <LayoutDashboard />
                Overview
              </span>
              <span>
                <Grid2X2 />
                Events
              </span>
            </div>
            <div className="home-demo-sidebar-foot">
              <strong>Organization workspace</strong>
              <span>Live event context</span>
            </div>
          </aside>

          <div className="home-demo-main">
            <div className="home-demo-heading">
              <div>
                <small>Organizer workspace</small>
                <h2>Organization overview</h2>
                <p>Live operational data across events, submissions, reviews, and speaker work.</p>
              </div>
              <Button variant="outline" size="sm" tabIndex={-1}>
                View events
                <ArrowRight />
              </Button>
            </div>

            <div className="home-demo-metrics">
              {[
                ["Events", "2", "Live event records"],
                ["Submissions", "42", "Across this organization"],
                ["Pending reviews", "4", "Awaiting attention"],
                ["Speaker tasks", "2", "Open work items"],
              ].map(([label, value, detail]) => (
                <Card className="home-demo-metric-card" key={label} size="sm">
                  <CardHeader>
                    <CardTitle>{label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <strong>{value}</strong>
                    <span>{detail}</span>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="home-demo-grid">
              <Card className="home-demo-action-card" size="sm">
                <CardHeader>
                  <span className="home-demo-overline">Action queue</span>
                  <CardTitle>Tasks that need you</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="home-demo-action-row">
                    <CircleAlert />
                    <span>
                      <strong>Resolve speaker tasks</strong>
                      <small>2 speaker tasks remain open.</small>
                    </span>
                    <Badge variant="secondary">Open</Badge>
                  </div>
                  <div className="home-demo-action-row">
                    <CalendarDays />
                    <span>
                      <strong>Publish remaining sessions</strong>
                      <small>2 sessions are not in the public agenda.</small>
                    </span>
                    <Badge variant="secondary">Open</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="home-demo-context-card" size="sm">
                <CardHeader>
                  <span className="home-demo-overline">Organization</span>
                  <CardTitle>Keep your program moving</CardTitle>
                </CardHeader>
                <CardContent>
                  Open an event agenda to review its draft, validate conflicts, and publish the next
                  revision.
                </CardContent>
              </Card>
            </div>

            <Card className="home-demo-events-card" size="sm">
              <CardHeader>
                <span className="home-demo-overline">Live event data</span>
                <CardTitle>Events</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Program</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        <strong>Open Systems Summit</strong>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">Published</Badge>
                      </TableCell>
                      <TableCell>18 sessions</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>
                        <strong>Community Systems Lab</strong>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">Draft</Badge>
                      </TableCell>
                      <TableCell>12 sessions</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Card className="home-demo-float-card home-demo-float-left" size="sm">
        <CardContent>
          <span className="home-float-icon">
            <UserRoundCheck />
          </span>
          <span>
            <small>Speaker tasks</small>
            <strong>2 need attention</strong>
          </span>
        </CardContent>
      </Card>

      <Card className="home-demo-float-card home-demo-float-right" size="sm">
        <CardContent>
          <span className="home-float-icon home-float-icon-success">
            <Check />
          </span>
          <span>
            <small>Program status</small>
            <strong>18 sessions published</strong>
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkflowPreview({
  preview,
}: Readonly<{ preview: (typeof workflowSteps)[number]["preview"] }>) {
  if (preview === "submission") {
    return (
      <div className="home-proof-ui home-proof-form" aria-hidden="true">
        <div className="home-proof-progress">
          <span className="is-done">Welcome</span>
          <span className="is-done">Account</span>
          <span className="is-current">Submission</span>
          <span>Participants</span>
        </div>
        <span className="home-proof-label">Session title</span>
        <span className="home-proof-input">Designing reliable community systems</span>
        <span className="home-proof-label">Abstract</span>
        <span className="home-proof-textarea" />
      </div>
    );
  }

  if (preview === "review") {
    return (
      <div className="home-proof-ui home-proof-review" aria-hidden="true">
        <span className="home-proof-callout">
          <ShieldCheck />
          Human authority is required
        </span>
        <strong>Score this submission</strong>
        <span className="home-proof-score-row">
          <span>Audience impact</span>
          <small>Human score</small>
        </span>
        <span className="home-proof-score-row">
          <span>Clarity</span>
          <small>AI prefill · uncounted</small>
        </span>
      </div>
    );
  }

  if (preview === "schedule") {
    return (
      <div className="home-proof-ui home-proof-schedule" aria-hidden="true">
        <span className="home-proof-day">Friday, September 18</span>
        <span className="home-proof-session">
          <time>9:00</time>
          <span>
            <strong>Systems that stay understandable</strong>
            <small>Main stage · Morgan Lee</small>
          </span>
        </span>
        <span className="home-proof-session">
          <time>10:00</time>
          <span>
            <strong>Reliable CFP operations</strong>
            <small>Workshop studio · Avery Kim</small>
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="home-proof-ui home-proof-publish" aria-hidden="true">
      <span className="home-proof-status">
        <Check />
        Revision 1 is public
      </span>
      <strong>Agenda delivery</strong>
      <span>
        <CalendarDays />
        Public agenda
        <small>Current</small>
      </span>
      <span>
        <GitBranch />
        Webhook delivery
        <small>Queued</small>
      </span>
    </div>
  );
}

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
            <p className="home-kicker">Open-source conference program operations</p>
            <h1 id="hero-title">
              Run your speaker program from first submission to published agenda.
            </h1>
            <p className="home-lede">
              Collect proposals, coordinate speakers, run human-led reviews, resolve scheduling
              conflicts, and publish a privacy-safe program from one connected workspace.
            </p>
            <div className="home-actions">
              <a className="home-button home-button-primary" href="/events">
                Explore the live product
                <ArrowRight aria-hidden="true" />
              </a>
              <a
                className="home-button home-button-secondary"
                href="https://github.com/jaeyunha/open-sessionboard"
              >
                View the source
              </a>
            </div>
            <p className="home-note">
              No fake trial or gated tour. Browse a published program, then inspect the source.
            </p>
          </div>

          <AgendaProductFrame />

          <ul className="home-capability-strip" aria-label="Core capabilities">
            {capabilityItems.map((item) => (
              <li key={item}>
                <Check aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section
          className="home-section home-workflow-section"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <div className="home-section-heading home-section-heading-split">
            <div>
              <p className="home-kicker">The full program journey</p>
              <h2 id="workflow-title">One workflow from CFP to public program.</h2>
            </div>
            <p>
              Each handoff is a real product surface, with clear authority and an explicit boundary
              between private operations and published information.
            </p>
          </div>
          <ol className="home-workflow-list">
            {workflowSteps.map((step) => (
              <li className="home-workflow-row" key={step.label}>
                <div className="home-workflow-copy">
                  <span className="home-step-number">
                    {step.number} · {step.label}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
                <WorkflowPreview preview={step.preview} />
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
            <p className="home-kicker">One program, every role</p>
            <h2 id="surfaces-title">The right workspace for the person doing the work.</h2>
            <p>
              Organizers, reviewers, and speakers share program context without sharing private
              notes, files, or authority they do not need.
            </p>
          </div>

          <div className="home-role-grid">
            <article className="home-role-card home-role-card-organizer">
              <div className="home-role-preview" aria-hidden="true">
                <div className="home-role-nav">
                  <LayoutDashboard />
                  <span className="is-active">Overview</span>
                  <span>Events</span>
                  <span>Agenda</span>
                </div>
                <div className="home-role-dashboard">
                  <span className="home-role-overline">Organizer workspace</span>
                  <strong>Tasks that need you</strong>
                  <span className="home-role-metrics">
                    <small>
                      <b>42</b> Submissions
                    </small>
                    <small>
                      <b>4</b> Pending reviews
                    </small>
                    <small>
                      <b>2</b> Speaker tasks
                    </small>
                  </span>
                  <span className="home-role-action">
                    <CircleAlert />
                    Resolve speaker tasks
                    <small>Open</small>
                  </span>
                </div>
              </div>
              <span className="home-card-label">For organizers</span>
              <h3>Operate the whole program without mystery state.</h3>
              <p>
                See submissions, reviews, speaker work, agenda readiness, publication, and delivery
                from one event-scoped desk.
              </p>
              <a className="home-inline-link" href="/login">
                Open organizer workspace <ArrowRight aria-hidden="true" />
              </a>
            </article>

            <article className="home-role-card home-role-card-reviewer">
              <div className="home-role-preview" aria-hidden="true">
                <span className="home-review-authority">
                  <ShieldCheck />
                  Human authority is required
                </span>
                <strong>Designing reliable community systems</strong>
                <span className="home-review-rubric">
                  <small>Audience impact</small>
                  <span>Human score</span>
                </span>
                <span className="home-review-rubric">
                  <small>Clarity</small>
                  <span>AI prefill · uncounted</span>
                </span>
              </div>
              <span className="home-card-label">For reviewers</span>
              <h3>Focused evaluation, accountable decisions.</h3>
              <p>
                Reviewers see assigned material and bounded rubrics. Assistance can summarize, but
                it never accepts, rejects, or counts without human confirmation.
              </p>
              <a className="home-inline-link" href="/review">
                Open reviewer workspace <ArrowRight aria-hidden="true" />
              </a>
            </article>

            <article className="home-role-card home-role-card-speaker">
              <div className="home-role-preview" aria-hidden="true">
                <div className="home-speaker-progress">
                  <span>
                    <strong>2</strong> tasks
                  </span>
                  <small>0% complete</small>
                </div>
                <span className="home-speaker-task">
                  <FileText />
                  <span>
                    <strong>Review your speaker profile</strong>
                    <small>Due Sep 2 · In progress</small>
                  </span>
                </span>
                <span className="home-speaker-task">
                  <Upload />
                  <span>
                    <strong>Upload presentation slides</strong>
                    <small>Due Sep 11 · Not started</small>
                  </span>
                </span>
              </div>
              <span className="home-card-label">For speakers</span>
              <h3>A calm place to finish every event task.</h3>
              <p>
                Speakers follow accepted sessions, profiles, co-speakers, forms, files, feedback,
                and deadlines without seeing organizer-only context.
              </p>
              <a className="home-inline-link" href="/portal">
                Open speaker portal <ArrowRight aria-hidden="true" />
              </a>
            </article>
          </div>
        </section>

        <section className="home-boundaries" id="boundaries" aria-labelledby="boundaries-title">
          <div className="home-boundaries-copy">
            <p className="home-kicker">Designed for responsible publishing</p>
            <h2 id="boundaries-title">Publish the program, not your working table.</h2>
            <p>
              Drafts, reviewer notes, private uploads, and coordination details stay behind
              authorization. Public surfaces read only an explicitly published, privacy-safe
              revision.
            </p>
          </div>

          <div className="home-boundary-visual" aria-hidden="true">
            <div className="home-revision-lane">
              <span className="home-revision-status home-revision-status-draft">Draft v3</span>
              <strong>Private agenda workspace</strong>
              <small>2 sessions · updated 9:00 PM</small>
            </div>
            <span className="home-revision-connector">
              <ShieldCheck />
              Validate conflicts and permissions
            </span>
            <div className="home-revision-lane home-revision-lane-public">
              <span className="home-revision-status">Revision 1 · Current</span>
              <strong>Public agenda projection</strong>
              <small>Agenda, calendar, embeds, and webhooks</small>
            </div>
          </div>

          <div className="home-boundary-list">
            <div className="home-boundary-item">
              <span className="home-boundary-mark">
                <UserRoundCheck />
              </span>
              <div>
                <h3>Human-authoritative review</h3>
                <p>
                  Suggestions remain advisory until a human confirms every consequential action.
                </p>
              </div>
            </div>
            <div className="home-boundary-item">
              <span className="home-boundary-mark">
                <ShieldCheck />
              </span>
              <div>
                <h3>Conflict-safe scheduling</h3>
                <p>
                  Hard blockers stop publication; warnings require an explicit audited override.
                </p>
              </div>
            </div>
            <div className="home-boundary-item">
              <span className="home-boundary-mark">
                <LockKeyhole />
              </span>
              <div>
                <h3>Explicitly published projections</h3>
                <p>
                  Public pages never read drafts, private files, reviewer notes, or contact data.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="home-open-source" aria-labelledby="open-source-title">
          <div className="home-open-source-copy">
            <p className="home-kicker">Open infrastructure, accountable operations</p>
            <h2 id="open-source-title">Own the workflow your conference depends on.</h2>
            <p>
              Open Sessionboard is inspectable, adaptable software for teams replacing expensive
              closed program-management systems without giving up operational rigor.
            </p>
            <ul>
              {openSourceBenefits.map((benefit) => (
                <li key={benefit}>
                  <Check aria-hidden="true" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          <div className="home-source-card">
            <span className="home-source-icon" aria-hidden="true">
              <Sparkles />
            </span>
            <div>
              <span className="home-card-label">Open Sessionboard</span>
              <strong>Conference program operations, end to end.</strong>
              <p>
                Start with a real public event surface, inspect the source, and deploy the stack on
                infrastructure you control.
              </p>
            </div>
            <div className="home-source-actions">
              <a className="home-button home-button-primary" href="/events">
                Explore events
              </a>
              <a
                className="home-button home-button-secondary"
                href="https://github.com/jaeyunha/open-sessionboard"
              >
                View GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div>
          <strong>Open Sessionboard</strong>
          <span>Open-source program operations for conference teams.</span>
        </div>
        <nav aria-label="Footer navigation">
          <a href="/events">Events</a>
          <a href="/login">Sign in</a>
          <a href="https://github.com/jaeyunha/open-sessionboard">Source</a>
        </nav>
        <span>AGPL-3.0-or-later</span>
      </footer>
    </div>
  );
}
