import type { ReminderDeliveryFact } from "./progress-reminder-delivery-fact";
import type { ReminderDeliveryResponse } from "./progress-reminder-delivery-response";

export function reminderDeliveryMessage(result: ReminderDeliveryResponse): string {
  const facts = [
    ...(result.facts ?? []),
    ...(result.reminders ?? []),
    {
      ...(result.runId === undefined ? {} : { runId: result.runId }),
      ...(result.outboxId === undefined ? {} : { outboxId: result.outboxId }),
      ...(result.providerId === undefined ? {} : { providerId: result.providerId }),
      ...(result.status === undefined ? {} : { status: result.status }),
      ...(result.timestamp === undefined ? {} : { timestamp: result.timestamp }),
      ...(result.createdAt === undefined ? {} : { createdAt: result.createdAt }),
    } satisfies ReminderDeliveryFact,
  ].filter((fact) =>
    Object.values(fact).some((value) => typeof value === "string" && value.trim().length > 0),
  );
  const delivered = facts.filter((fact) => fact.status?.toLowerCase() === "delivered");
  const failed = facts.filter((fact) => {
    const status = fact.status?.toLowerCase();
    return status === "failed" || status === "dead-letter";
  });
  if (delivered.length > 0) {
    return `Reminder delivery confirmed for ${delivered.length} reviewer${delivered.length === 1 ? "" : "s"}.`;
  }
  if (failed.length > 0) {
    return `Reminder delivery failed for ${failed.length} reviewer${failed.length === 1 ? "" : "s"}.`;
  }
  const queued = result.queued > 0 ? result.queued : facts.length;
  return `Reminder request queued for ${queued} reviewer${queued === 1 ? "" : "s"}; delivery is pending.`;
}
