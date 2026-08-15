import type { AggregateParticipant } from "./organizer-aggregate-participant";

export interface AggregateRow {
  id: string;
  reference: string;
  title: string;
  countedScore: string;
  possibleScore: string;
  countedReviews: number;
  expectedReviews: number;
  conflicts: number;
  abstentions: number;
  participants?: readonly AggregateParticipant[];
  readonly roundId?: string;
  readonly roundRevision?: number;
  readonly rubricRevision?: number;
}
