import type { AggregateParticipant } from "./organizer-aggregate-participant";

export interface ApiSubmission {
  id: string;
  title: string;
  abstract: string;
  participants?: readonly AggregateParticipant[];
}
