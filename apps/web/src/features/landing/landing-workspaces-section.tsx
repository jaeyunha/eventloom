import { LandingIcon } from "./landing-icon";

function OrganizerPreview() {
  return (
    <div className="role-preview" aria-hidden="true">
      <span className="demo-card-label">Illustrative organizer overview</span>
      <div className="mini-metrics">
        <div className="mini-metric">
          <strong>42</strong>
          <span>SUBMISSIONS</span>
        </div>
        <div className="mini-metric">
          <strong>4</strong>
          <span>PENDING REVIEWS</span>
        </div>
        <div className="mini-metric">
          <strong>2</strong>
          <span>SPEAKER TASKS</span>
        </div>
      </div>
      <div className="mini-task">
        <LandingIcon name="alert" />
        <span>
          Resolve speaker tasks<small>2 open work items</small>
        </span>
      </div>
      <div className="mini-task">
        <LandingIcon name="agenda" />
        <span>
          Validate draft agenda<small>1 warning needs a decision</small>
        </span>
      </div>
    </div>
  );
}

function ReviewerPreview() {
  return (
    <div className="role-preview" aria-hidden="true">
      <div className="mini-authority">Human authority is required</div>
      <h4 className="submission-title">Designing reliable community systems</h4>
      <div className="rubric">
        {[
          ["Impact", 4],
          ["Clarity", 3],
        ].map(([label, selected]) => (
          <div className="rubric-row" key={label}>
            <span>{label}</span>
            <span className="score">
              {[1, 2, 3, 4].map((score) => (
                <i className={score === selected ? "selected" : undefined} key={score}>
                  {score}
                </i>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SpeakerPreview() {
  return (
    <div className="role-preview" aria-hidden="true">
      <span className="demo-card-label">Speaker tasks · 0% complete</span>
      <div className="mini-task">
        <LandingIcon name="file" />
        <span>
          Review your profile<small>Due Sep 2 · In progress</small>
        </span>
      </div>
      <div className="mini-task">
        <LandingIcon name="upload" />
        <span>
          Upload presentation slides<small>Due Sep 11 · Not started</small>
        </span>
      </div>
    </div>
  );
}

const roleCards = [
  {
    key: "organizer",
    kicker: "For organizers",
    title: "Operate the whole program without mystery state.",
    description:
      "See submissions, reviews, speaker work, agenda readiness, publication, and delivery from one event-scoped desk.",
    href: "/login",
    link: "Open organizer workspace",
    preview: <OrganizerPreview />,
  },
  {
    key: "reviewer",
    kicker: "For reviewers",
    title: "Focused evaluation, accountable decisions.",
    description: "Review assigned material and bounded rubrics without extra organizer context.",
    href: "/review",
    link: "Open reviewer workspace",
    preview: <ReviewerPreview />,
  },
  {
    key: "speaker",
    kicker: "For speakers",
    title: "A calm place to finish every event task.",
    description: "Follow accepted sessions, profiles, co-speakers, files, feedback, and deadlines.",
    href: "/portal",
    link: "Open speaker portal",
    preview: <SpeakerPreview />,
  },
] as const;

export function LandingWorkspacesSection() {
  return (
    <section className="section roles" id="workspaces" aria-labelledby="workspaces-title">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <p className="eyebrow">One program, every role</p>
          <h2 id="workspaces-title">
            <span className="workspaces-title-line">The right workspace for</span>
            <span className="workspaces-title-line">the person doing the work.</span>
          </h2>
          <p className="section-intro">
            Organizers, reviewers, and speakers share program context without sharing private notes,
            files, or authority they do not need.
          </p>
        </div>
        <div className="role-grid">
          {roleCards.map((role) => (
            <article className="role-card" data-reveal key={role.key}>
              {role.preview}
              <span className="role-kicker">{role.kicker}</span>
              <h3>{role.title}</h3>
              <p>{role.description}</p>
              <a className="role-link" href={role.href}>
                {role.link} <LandingIcon name="arrow-right" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
