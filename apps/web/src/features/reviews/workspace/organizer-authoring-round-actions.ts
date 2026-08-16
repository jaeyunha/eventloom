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
  function removeRound(roundIndex: number): void {
    const removedRoundId = rounds[roundIndex]?.id;
    if (removedRoundId === undefined) return;
    setRounds((currentRounds) => {
      if (currentRounds.length <= 1) return currentRounds;
      const nextRounds = currentRounds.filter((round) => round.id !== removedRoundId);
      if (nextRounds.length === currentRounds.length) return currentRounds;
      return nextRounds.map((round, index) => ({
        ...round,
        sequence: index + 1,
      }));
    });
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
    setRounds((currentRounds) => {
      const sequence = currentRounds.length + 1;
      let suffix = sequence;
      const existingIds = new Set(currentRounds.map((round) => round.id));
      const existingNames = new Set(currentRounds.map((round) => round.name.trim().toLowerCase()));
      while (
        existingIds.has(`round-${suffix}`) ||
        existingNames.has(`round ${suffix}`.toLowerCase())
      ) {
        suffix += 1;
      }
      const id = `round-${suffix}`;
      const name = `Round ${suffix}`;
      return [
        ...currentRounds,
        {
          id,
          name,
          sequence,
          opensAt: null,
          closesAt: null,
          blindReview: false,
          anonymization: "none",
          reviewerPool: { reviewerIds: [] },
          trackFilter: null,
          rubric: {
            id: `rubric-${id}`,
            name: "Evaluation rubric",
            criteria: [
              {
                id: `${id}-criterion-overall-quality`,
                label: "Overall quality",
                description: "Describe the evidence reviewers should consider.",
                minimum: 1,
                maximum: 5,
                weight: 1,
                required: true,
                inputType: "numeric",
              },
            ],
          },
        },
      ];
    });
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
  return {
    ...scope,
    removeCriterion,
    removeRound,
    updateRound,
    updateCriterion,
    addRound,
    addCriterion,
  };
}
export type OrganizerRoundActions = ReturnType<typeof useOrganizerRoundActions>;
