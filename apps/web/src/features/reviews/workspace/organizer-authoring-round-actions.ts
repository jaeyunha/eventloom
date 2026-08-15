"use client";

import type { ApiPlan } from "./api-api-plan";
import type { OrganizerAuthoringState } from "./organizer-authoring-state";
import type { RubricCriterion } from "./scorecard-rubric-criterion";

export function useOrganizerRoundActions(scope: OrganizerAuthoringState) {
  const { rounds, setRounds } = scope;
  function removeCriterion(roundIndex: number, criterionIndex: number): void {
    setRounds((currentRounds) =>
      currentRounds.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex || round.rubric.criteria.length <= 1) return round;
        return {
          ...round,
          rubric: {
            ...round.rubric,
            criteria: round.rubric.criteria.filter((_, index) => index !== criterionIndex),
          },
        };
      }),
    );
  }

  function updateRound(
    roundIndex: number,
    update: (round: ApiPlan["rounds"][number]) => ApiPlan["rounds"][number],
  ): void {
    setRounds((current) =>
      current.map((round, index) => (index === roundIndex ? update(round) : round)),
    );
  }

  function updateCriterion(
    roundIndex: number,
    criterionIndex: number,
    update: (criterion: RubricCriterion) => RubricCriterion,
  ): void {
    updateRound(roundIndex, (round) => ({
      ...round,
      rubric: {
        ...round.rubric,
        criteria: round.rubric.criteria.map((criterion, index) =>
          index === criterionIndex ? update(criterion) : criterion,
        ),
      },
    }));
  }

  function addRound(): void {
    const source = rounds[rounds.length - 1];
    if (source === undefined) return;
    const sequence = rounds.length + 1;
    setRounds((current) => [
      ...current,
      {
        ...source,
        id: `round-${sequence}`,
        name: `Round ${sequence}`,
        sequence,
        opensAt: null,
        closesAt: null,
        blindReview: source.blindReview,
        anonymization: source.anonymization,
        reviewerPool: source.reviewerPool,
        trackFilter: source.trackFilter,
        rubric: {
          ...source.rubric,
          id: `rubric-round-${sequence}`,
          name: `${source.rubric.name} ${sequence}`,
          criteria: source.rubric.criteria.map((criterion) => ({
            ...criterion,
          })),
        },
      },
    ]);
  }

  function addCriterion(roundIndex: number): void {
    updateRound(roundIndex, (round) => {
      const nextNumber = round.rubric.criteria.length + 1;
      return {
        ...round,
        rubric: {
          ...round.rubric,
          criteria: [
            ...round.rubric.criteria,
            {
              id: `${round.id}-criterion-${nextNumber}`,
              label: `Criterion ${nextNumber}`,
              description: "Describe the evidence reviewers should consider.",
              minimum: 1,
              maximum: 5,
              weight: 1,
              required: false,
            },
          ],
        },
      };
    });
  }
  return { ...scope, removeCriterion, updateRound, updateCriterion, addRound, addCriterion };
}
export type OrganizerRoundActions = ReturnType<typeof useOrganizerRoundActions>;
