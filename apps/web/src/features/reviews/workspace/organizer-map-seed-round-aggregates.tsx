import type { ApiAggregate } from "./api-api-aggregate";
import type { AggregateRow } from "./organizer-aggregate-row";
import { mapRoundAggregates } from "./organizer-map-round-aggregates";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";

export function mapSeedRoundAggregates(
  seed: ReviewPlanSeed,
  aggregates: readonly ApiAggregate[],
  roundId: string,
): readonly AggregateRow[] {
  const submissionRows = seed.aggregates.map((aggregate) => ({
    id: aggregate.id,
    title: aggregate.title,
    abstract: "",
    ...(aggregate.participants === undefined ? {} : { participants: aggregate.participants }),
  }));
  const mapped = mapRoundAggregates(submissionRows, seed.assignments, aggregates, roundId);
  const referenceById = new Map(
    seed.aggregates.map((aggregate) => [aggregate.id, aggregate.reference]),
  );
  return mapped.map((aggregate) => ({
    ...aggregate,
    reference: referenceById.get(aggregate.id) ?? aggregate.reference,
  }));
}
