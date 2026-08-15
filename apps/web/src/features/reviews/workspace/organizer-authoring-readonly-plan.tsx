"use client";
import { Badge } from "../../../components/ui/badge";
import styles from "../review-workspace.module.css";
import { authoringDateLabel } from "./model-authoring-date-label";
import { criterionType } from "./model-criterion-type";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";

export function OrganizerReadonlyPlan({
  controller,
}: Readonly<{ controller: OrganizerAuthoringController }>) {
  const { name, planClosesAt, rounds, criterionCount, reviewerIdSet } = controller;
  return (
    <div className={styles.authoringReadOnly}>
      <section className={styles.authoringPanel} aria-labelledby="plan-overview-heading">
        <div className={styles.authoringPanelHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Plan</p>
            <h3 id="plan-overview-heading">Plan overview</h3>
          </div>
          <Badge variant="outline">Grading locked</Badge>
        </div>
        <dl className={styles.authoringOverviewGrid}>
          <div>
            <dt>Plan name</dt>
            <dd>{name}</dd>
          </div>
          <div>
            <dt>Overall review deadline</dt>
            <dd>{authoringDateLabel(planClosesAt)}</dd>
          </div>
          <div>
            <dt>Rounds</dt>
            <dd>{rounds.length}</dd>
          </div>
          <div>
            <dt>Criteria</dt>
            <dd>{criterionCount}</dd>
          </div>
        </dl>
      </section>
      <section className={styles.authoringRounds} aria-labelledby="review-rounds-heading">
        <div className={styles.authoringPanelHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Workflow</p>
            <h3 id="review-rounds-heading">Review rounds</h3>
            <p className={styles.authoringPanelDescription}>
              The live schedule and rubric reviewers are currently using.
            </p>
          </div>
        </div>
        <div className={styles.readOnlyRoundList}>
          {rounds.map((round, roundIndex) => {
            const selectedReviewerCount =
              round.reviewerPool?.reviewerIds.filter((reviewerId) => reviewerIdSet.has(reviewerId))
                .length ?? 0;
            const totalWeight = round.rubric.criteria.reduce(
              (total, criterion) => total + criterion.weight,
              0,
            );
            return (
              <article className={styles.readOnlyRound} key={round.id}>
                <header className={styles.readOnlyRoundHeader}>
                  <div>
                    <span className={styles.roundSequence}>Round {roundIndex + 1}</span>
                    <h4>{round.name}</h4>
                    <p>{round.rubric.name}</p>
                  </div>
                  <Badge variant="outline">
                    {round.anonymization === "double"
                      ? "Double-blind"
                      : round.anonymization === "single"
                        ? "Single-blind"
                        : "Identities visible"}
                  </Badge>
                </header>
                <dl className={styles.readOnlyRoundStats}>
                  <div>
                    <dt>Opens</dt>
                    <dd>{authoringDateLabel(round.opensAt)}</dd>
                  </div>
                  <div>
                    <dt>Deadline</dt>
                    <dd>{authoringDateLabel(round.closesAt)}</dd>
                  </div>
                  <div>
                    <dt>Reviewers</dt>
                    <dd>{selectedReviewerCount}</dd>
                  </div>
                  <div>
                    <dt>Total weight</dt>
                    <dd>{totalWeight}</dd>
                  </div>
                </dl>
                <div className={styles.readOnlyRubric}>
                  <div className={styles.readOnlyRubricHeader}>
                    <div>
                      <span>Rubric</span>
                      <strong>
                        {round.rubric.criteria.length}{" "}
                        {round.rubric.criteria.length === 1 ? "criterion" : "criteria"}
                      </strong>
                    </div>
                    <span>
                      {round.trackFilter?.trim().length ? round.trackFilter : "All tracks"}
                    </span>
                  </div>
                  <ul className={styles.readOnlyCriteria}>
                    {round.rubric.criteria.map((criterion) => (
                      <li key={criterion.id}>
                        <div>
                          <strong>{criterion.label}</strong>
                          <span>{criterion.description}</span>
                        </div>
                        <div className={styles.readOnlyCriterionMeta}>
                          <span>
                            {criterionType(criterion) === "numeric"
                              ? `Numeric ${criterion.minimum}-${criterion.maximum}`
                              : criterionType(criterion) === "dropdown"
                                ? `${criterion.options?.length ?? 0} options`
                                : "Written response"}
                          </span>
                          <span>Weight {criterion.weight}</span>
                          <span>{criterion.required ? "Required" : "Optional"}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
