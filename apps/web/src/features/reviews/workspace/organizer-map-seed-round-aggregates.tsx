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
  return mapRoundAggregates(submissionRows, seed.assignments, aggregates, roundId);
}
