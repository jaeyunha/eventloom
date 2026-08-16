export interface ReminderDeliveryFact {
  readonly runId?: string;
  readonly outboxId?: string;
  readonly providerId?: string;
  readonly reviewerId?: string;
  readonly roundId?: string | null;
  readonly status?: string;
  readonly timestamp?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly completedAt?: string | null;
  readonly lastErrorCode?: string | null;
}
