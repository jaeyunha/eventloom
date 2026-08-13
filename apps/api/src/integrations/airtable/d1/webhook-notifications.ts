import type {
  AirtableWebhookNotificationInsert,
  AirtableWebhookNotificationInsertResult,
  AirtableWebhookNotificationStore,
} from "../inbound/webhook";
import type { AirtableD1Database } from "./adapters";

export class D1AirtableWebhookNotificationStore implements AirtableWebhookNotificationStore {
  constructor(private readonly db: AirtableD1Database) {}

  async insertNotification(
    notification: AirtableWebhookNotificationInsert,
  ): Promise<AirtableWebhookNotificationInsertResult> {
    const result = await this.db
      .prepare(`INSERT INTO airtable_webhook_notifications (
        id, organization_id, connection_id, registration_id,
        provider_notification_id, raw_body_hash, time_bucket, raw_body,
        content_mac, status, received_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT DO NOTHING`)
      .bind(
        notification.id,
        notification.organizationId,
        notification.connectionId,
        notification.registrationId,
        notification.providerNotificationId,
        notification.rawBodyHash,
        notification.timeBucket,
        notification.rawBody,
        notification.contentMac,
        notification.status,
        notification.receivedAt,
      )
      .run();

    return (result.meta?.changes ?? 0) > 0 ? "inserted" : "duplicate";
  }
}
