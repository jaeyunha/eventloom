import { LandingIcon, type LandingIconName } from "./landing-icon";

export type ProductPanel = "collect" | "review" | "schedule" | "publish";

const LANDING_PANEL_DELIVERIES: readonly [LandingIconName, string, string, string][] = [
  ["public-agenda", "Public agenda", "Privacy-safe projection", "Current"],
  ["agenda", "Calendar feeds", "Per-event time zone", "Current"],
  ["embeds", "Embeds and webhooks", "Versioned delivery", "Delivered"],
];

const LANDING_PANEL_CAPTIONS = {
  collect: ["Resumable proposal intake", "Applicant view · Step 3 of 4"],
  review: ["Human-led review", "Assigned reviewer · Blind context"],
  schedule: ["Draft agenda · Friday, September 18", "3 rooms · Event time zone"],
  publish: ["Immutable public revision", "Revision 7 · Published 2 minutes ago"],
} satisfies Record<ProductPanel, readonly [string, string]>;

function CollectPanel() {
  return (
    <div className="collect-grid">
      <div className="demo-card">
        <div className="progress-steps">
          <span className="done">Welcome</span>
          <span className="done">Account</span>
          <span className="done">Submission</span>
          <span>Participants</span>
        </div>
        <div className="field">
          <span className="field-label">Session title</span>
          <div className="field-box">Systems that stay understandable</div>
        </div>
        <div className="field">
          <span className="field-label">Abstract</span>
          <div className="field-box tall">
            Explain the problem, the audience, and what participants will leave able to do.
          </div>
        </div>
      </div>
      <div className="demo-card">
        <span className="demo-card-label">Submission readiness</span>
        <div className="delivery-row">
          <span>
            Required fields<small>All complete</small>
          </span>
          <strong className="delivery-status">Ready</strong>
        </div>
        <div className="delivery-row">
          <span>
            Participants<small>1 confirmed · 1 invited</small>
          </span>
          <strong className="delivery-status">In progress</strong>
        </div>
        <div className="delivery-row">
          <span>
            Private files<small>Visible to authorized organizers</small>
          </span>
          <strong className="delivery-status">Protected</strong>
        </div>
      </div>
    </div>
  );
}

function ReviewPanel() {
  return (
    <div className="review-grid">
      <div className="demo-card">
        <div className="authority-note">
          AI assistance is advisory. A human score is required for every counted criterion.
        </div>
        <h3 className="submission-title">Designing reliable community systems</h3>
        <p className="submission-copy">
          A practical session on making workflows legible, recoverable, and sustainable for
          volunteer-led communities.
        </p>
      </div>
      <div className="demo-card">
        <span className="demo-card-label">Rubric</span>
        <div className="rubric">
          {[
            ["Audience impact", 4],
            ["Clarity", 3],
            ["Program fit", 4],
          ].map(([label, selected]) => (
            <div className="rubric-row" key={label}>
              <span>{label}</span>
              <span className="score">
                {[1, 2, 3, 4, 5].map((score) => (
                  <i className={score === selected ? "selected" : undefined} key={score}>
                    {score}
                  </i>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SchedulePanel() {
  return (
    <>
      <figure className="agenda-board" aria-label="Illustrative agenda timetable">
        <div className="time-rail">
          <span className="room-head" />
          {["09:00", "10:00", "11:00", "12:00", "13:00"].map((time) => (
            <span className="time-cell" key={time}>
              {time}
            </span>
          ))}
        </div>
        <div className="room-column">
          <span className="room-head">Main stage</span>
          <span className="room-cell">
            <span className="session-card">
              <strong>Opening keynote</strong>
              <span>Morgan Lee · 45 min</span>
            </span>
          </span>
          <span className="room-cell" />
          <span className="room-cell">
            <span className="session-card warning">
              <strong>Systems that stay understandable</strong>
              <span>Travel warning · 45 min</span>
            </span>
          </span>
          <span className="room-cell" />
          <span className="room-cell" />
        </div>
        <div className="room-column">
          <span className="room-head">Studio</span>
          <span className="room-cell" />
          <span className="room-cell">
            <span className="session-card">
              <strong>Reliable CFP operations</strong>
              <span>Avery Kim · 60 min</span>
            </span>
          </span>
          <span className="room-cell" />
          <span className="room-cell" />
          <span className="room-cell">
            <span className="session-card">
              <strong>Community tooling lab</strong>
              <span>Panel · 45 min</span>
            </span>
          </span>
        </div>
        <div className="room-column">
          <span className="room-head">Forum</span>
          <span className="room-cell">
            <span className="session-card">
              <strong>Maintainer breakfast</strong>
              <span>Roundtable · 45 min</span>
            </span>
          </span>
          <span className="room-cell" />
          <span className="room-cell" />
          <span className="room-cell">
            <span className="session-card">
              <strong>Program design clinic</strong>
              <span>Workshop · 60 min</span>
            </span>
          </span>
          <span className="room-cell" />
        </div>
      </figure>
      <div className="demo-banner">
        <LandingIcon name="check" />
        Room capacity and speaker overlap checks are clear. One travel warning needs a human
        decision.
      </div>
    </>
  );
}

function PublishPanel() {
  return (
    <div className="publish-grid">
      <div className="demo-card">
        <span className="demo-card-label">Delivery surfaces</span>
        <div className="publish-stack">
          {LANDING_PANEL_DELIVERIES.map(([icon, title, detail, status]) => (
            <div className="delivery-row" key={title}>
              <LandingIcon name={icon} />
              <span>
                {title}
                <small>{detail}</small>
              </span>
              <strong className="delivery-status">{status}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="demo-card revision-card">
        <span className="demo-card-label">Published state</span>
        <div className="revision-orbit">
          <div className="revision-core">Revision 7</div>
        </div>
        <strong>Public projection is current</strong>
      </div>
    </div>
  );
}

const LANDING_PANEL_CONTENT = {
  collect: <CollectPanel />,
  review: <ReviewPanel />,
  schedule: <SchedulePanel />,
  publish: <PublishPanel />,
} satisfies Record<ProductPanel, React.ReactNode>;

export function LandingProductPanels({ activePanel }: Readonly<{ activePanel: ProductPanel }>) {
  return (
    <div
      className="demo-panel active"
      id={`panel-${activePanel}`}
      role="tabpanel"
      aria-labelledby={`tab-${activePanel}`}
    >
      <div className="demo-caption">
        <strong>{LANDING_PANEL_CAPTIONS[activePanel][0]}</strong>
        <span>{LANDING_PANEL_CAPTIONS[activePanel][1]}</span>
      </div>
      {LANDING_PANEL_CONTENT[activePanel]}
    </div>
  );
}
