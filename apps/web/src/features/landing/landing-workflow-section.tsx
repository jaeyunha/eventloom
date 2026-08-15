const workflowSteps = [
  {
    index: "01",
    title: "Collect without friction.",
    chip: "Applicant-facing",
    description:
      "Build conditional forms, preserve drafts, and collect participants and private files without exposing organizer work.",
  },
  {
    index: "02",
    title: "Review with human authority.",
    chip: "Reviewer-facing",
    description:
      "Assign bounded rubrics and blind-review context while every counted score and final decision remains accountable to a person.",
  },
  {
    index: "03",
    title: "Schedule against reality.",
    chip: "Organizer-facing",
    description:
      "Place accepted sessions into a versioned draft and validate speakers, rooms, travel, tracks, and capacity before publishing.",
  },
  {
    index: "04",
    title: "Publish deliberately.",
    chip: "Public-facing",
    description:
      "Release an immutable revision to the public agenda, calendar feeds, embeds, webhooks, and cache delivery surfaces.",
  },
] as const;

export function LandingWorkflowSection() {
  return (
    <section className="section workflow" id="workflow" aria-labelledby="workflow-title">
      <div className="wrap">
        <div className="section-head split" data-reveal>
          <div>
            <p className="eyebrow">The full program journey</p>
            <h2 id="workflow-title">One workflow from first proposal to public program.</h2>
          </div>
          <p className="section-intro">
            Every handoff is a real product surface—with clear authority, visible state, and an
            explicit boundary between private operations and published information.
          </p>
        </div>
        <div className="workflow-list">
          {workflowSteps.map((step) => (
            <article className="workflow-row" data-reveal key={step.index}>
              <span className="step-index">{step.index}</span>
              <div>
                <h3>{step.title}</h3>
                <span className="workflow-chip">{step.chip}</span>
              </div>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
