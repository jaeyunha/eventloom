import type { ReminderDeliveryFact } from "./progress-reminder-delivery-fact";

export interface ReminderDeliveryResponse {
  readonly queued: number;
  readonly reviewerIds?: readonly string[];
  readonly runId?: string;
  readonly outboxId?: string;
  readonly providerId?: string;
  readonly status?: string;
  readonly timestamp?: string;
  readonly createdAt?: string;
  readonly facts?: readonly ReminderDeliveryFact[];
  readonly reminders?: readonly ReminderDeliveryFact[];
}
