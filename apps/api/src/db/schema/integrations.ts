import { desc, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { authUsers, organizations } from "./identity-access";
import { events } from "./program-core";

const timestampColumns = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const customerWebhookSubscriptions = sqliteTable(
  "webhook_subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.organizationId, { onDelete: "cascade" }),
    eventId: text("event_id"),
    endpoint: text("endpoint_url").notNull(),
    eventFilterJson: text("events_json").notNull(),
    isActive: integer("active").notNull(),
    encryptedSigningSecret: text("signing_secret_ciphertext").notNull(),
    signingSecretLastFour: text("signing_secret_last_four").notNull(),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    unique("webhook_subscriptions_organization_id_id_unique").on(table.organizationId, table.id),
    check(
      "webhook_subscriptions_events_json_check",
      sql`json_valid(${table.eventFilterJson}) AND json_type(${table.eventFilterJson}) = 'array'`,
    ),
    check("webhook_subscriptions_active_check", sql`${table.isActive} IN (0, 1)`),
    index("webhook_subscriptions_scope_idx").on(
      table.organizationId,
      table.eventId,
      table.isActive,
    ),
  ],
);

export const customerWebhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.organizationId, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").notNull(),
    eventExternalId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: text("occurred_at").notNull(),
    payloadJson: text("event_data_json").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    state: text("status", {
      enum: ["pending", "delivering", "retrying", "succeeded", "failed", "dead_letter"],
    }).notNull(),
    attempts: integer("attempt_count").notNull(),
    availableAt: text("next_attempt_at"),
    responseStatus: integer("last_response_status"),
    lastError: text("last_error"),
    lastResponseBody: text("last_response_body"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
    claimOwner: text("lease_owner"),
    claimToken: text("lease_token"),
    leaseExpiresAt: text("lease_expires_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.subscriptionId],
      foreignColumns: [
        customerWebhookSubscriptions.organizationId,
        customerWebhookSubscriptions.id,
      ],
    }).onDelete("cascade"),
    unique("webhook_deliveries_subscription_id_event_id_unique").on(
      table.subscriptionId,
      table.eventExternalId,
    ),
    check("webhook_deliveries_event_data_json_check", sql`json_valid(${table.payloadJson})`),
    check(
      "webhook_deliveries_status_check",
      sql`${table.state} IN ('pending', 'delivering', 'retrying', 'succeeded', 'failed', 'dead_letter')`,
    ),
    check("webhook_deliveries_attempt_count_check", sql`${table.attempts} >= 0`),
    check(
      "webhook_deliveries_resource_check",
      sql`(${table.resourceType} IS NULL AND ${table.resourceId} IS NULL) OR (${table.resourceType} IS NOT NULL AND ${table.resourceId} IS NOT NULL)`,
    ),
    check(
      "webhook_deliveries_lease_check",
      sql`(${table.state} = 'delivering' AND ${table.claimOwner} IS NOT NULL AND ${table.claimToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL) OR (${table.state} <> 'delivering' AND ${table.claimOwner} IS NULL AND ${table.claimToken} IS NULL AND ${table.leaseExpiresAt} IS NULL)`,
    ),
    index("webhook_deliveries_due_idx").on(table.state, table.availableAt, table.createdAt),
    index("webhook_deliveries_organization_time_idx").on(
      table.organizationId,
      desc(table.createdAt),
    ),
  ],
);

export const customerWebhookDeliveryFailures = sqliteTable(
  "webhook_delivery_failures",
  {
    deliveryId: text("delivery_id")
      .notNull()
      .references(() => customerWebhookDeliveries.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    attemptedAt: text("attempted_at").notNull(),
    responseStatus: integer("response_status"),
    error: text("error").notNull(),
    responseBody: text("response_body"),
    retryable: integer("retryable").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deliveryId, table.attempt] }),
    check("webhook_delivery_failures_attempt_check", sql`${table.attempt} > 0`),
    check("webhook_delivery_failures_retryable_check", sql`${table.retryable} IN (0, 1)`),
    index("webhook_delivery_failures_order_idx").on(table.deliveryId, desc(table.attempt)),
  ],
);

export const airtableConnections = sqliteTable(
  "airtable_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.organizationId, { onDelete: "cascade" }),
    state: text("status", {
      enum: [
        "disconnected",
        "authorizing",
        "connected",
        "refreshing",
        "paused",
        "reauthorization_required",
        "disconnecting",
      ],
    }).notNull(),
    authMode: text("auth_mode", { enum: ["oauth", "pat"] }).notNull(),
    credentialReference: text("credential_reference"),
    airtableUserId: text("airtable_user_id"),
    airtableAccountId: text("airtable_account_id"),
    baseId: text("base_id"),
    baseName: text("base_name"),
    grantedScopesJson: text("granted_scopes_json").notNull(),
    accessTokenExpiresAt: text("access_token_expires_at"),
    refreshTokenExpiresAt: text("refresh_token_expires_at"),
    connectionVersion: integer("connection_version").notNull(),
    refreshLeaseOwner: text("refresh_owner"),
    refreshLeaseToken: text("refresh_token"),
    refreshLeaseExpiresAt: text("refresh_lease_expires_at"),
    lastSchemaCheckAt: text("last_schema_check_at"),
    lastSuccessAt: text("last_success_at"),
    lastErrorCode: text("last_error_code"),
    lastError: text("last_error"),
    ...timestampColumns,
    disconnectedAt: text("disconnected_at"),
  },
  (table) => [
    unique("airtable_connections_organization_id_id_unique").on(table.organizationId, table.id),
    check(
      "airtable_connections_status_check",
      sql`${table.state} IN ('disconnected', 'authorizing', 'connected', 'refreshing', 'paused', 'reauthorization_required', 'disconnecting')`,
    ),
    check("airtable_connections_auth_mode_check", sql`${table.authMode} IN ('oauth', 'pat')`),
    check(
      "airtable_connections_granted_scopes_json_check",
      sql`json_valid(${table.grantedScopesJson}) AND json_type(${table.grantedScopesJson}) = 'array'`,
    ),
    check("airtable_connections_connection_version_check", sql`${table.connectionVersion} > 0`),
    check(
      "airtable_connections_refresh_lease_check",
      sql`(${table.refreshLeaseOwner} IS NULL AND ${table.refreshLeaseToken} IS NULL AND ${table.refreshLeaseExpiresAt} IS NULL) OR (${table.refreshLeaseOwner} IS NOT NULL AND ${table.refreshLeaseToken} IS NOT NULL AND ${table.refreshLeaseExpiresAt} IS NOT NULL)`,
    ),
    uniqueIndex("airtable_connections_active_organization_unique")
      .on(table.organizationId)
      .where(sql`${table.state} <> 'disconnected'`),
    index("airtable_connections_organization_status_idx").on(table.organizationId, table.state),
    index("airtable_connections_refresh_lease_idx").on(table.state, table.refreshLeaseExpiresAt),
  ],
);

export const airtableOauthAttempts = sqliteTable(
  "airtable_oauth_attempts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.organizationId, { onDelete: "cascade" }),
    initiatingUserId: text("initiating_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").notNull(),
    stateHash: text("state_hash").notNull(),
    encryptedPkceVerifier: text("pkce_verifier_ciphertext").notNull(),
    returnPath: text("return_path").notNull(),
    callbackCodeHash: text("callback_code_hash"),
    status: text("status", {
      enum: ["pending", "exchanging", "consumed", "failed", "expired"],
    }).notNull(),
    claimOwner: text("exchange_owner"),
    claimToken: text("exchange_token"),
    leaseExpiresAt: text("exchange_lease_expires_at"),
    attemptVersion: integer("attempt_version").notNull(),
    authorizationConnectionVersion: integer("authorization_connection_version").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    callbackResultJson: text("result_redirect"),
    lastError: text("error_code"),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.connectionId],
      foreignColumns: [airtableConnections.organizationId, airtableConnections.id],
    }).onDelete("cascade"),
    unique("airtable_oauth_attempts_state_hash_unique").on(table.stateHash),
    check(
      "airtable_oauth_attempts_status_check",
      sql`${table.status} IN ('pending', 'exchanging', 'consumed', 'failed', 'expired')`,
    ),
    check("airtable_oauth_attempts_attempt_version_check", sql`${table.attemptVersion} > 0`),
    check(
      "airtable_oauth_attempts_authorization_connection_version_check",
      sql`${table.authorizationConnectionVersion} > 0`,
    ),
    check(
      "airtable_oauth_attempts_exchange_lease_check",
      sql`(${table.status} = 'exchanging' AND ${table.claimOwner} IS NOT NULL AND ${table.claimToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL) OR (${table.status} <> 'exchanging' AND ${table.claimOwner} IS NULL AND ${table.claimToken} IS NULL AND ${table.leaseExpiresAt} IS NULL)`,
    ),
    check(
      "airtable_oauth_attempts_consumed_result_check",
      sql`(${table.status} = 'consumed' AND ${table.consumedAt} IS NOT NULL AND ${table.callbackResultJson} IS NOT NULL) OR (${table.status} <> 'consumed' AND ${table.consumedAt} IS NULL AND ${table.callbackResultJson} IS NULL)`,
    ),
    index("airtable_oauth_attempts_status_expiry_idx").on(table.status, table.expiresAt),
    index("airtable_oauth_attempts_connection_idx").on(table.connectionId, desc(table.createdAt)),
  ],
);

export const airtableProjectionConfigs = sqliteTable(
  "airtable_projection_configs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    connectionId: text("connection_id").notNull(),
    entityType: text("entity_type").notNull(),
    tableId: text("table_id").notNull(),
    tableName: text("table_name").notNull(),
    enabled: integer("enabled").notNull(),
    preset: text("preset").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    fieldMappingJson: text("field_mapping_json").notNull(),
    inboundFieldAllowlistJson: text("inbound_fields_json").notNull(),
    conflictPolicy: text("conflict_policy", {
      enum: ["manual", "d1_wins", "airtable_wins"],
    }).notNull(),
    projectionVersion: integer("projection_version").notNull(),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.connectionId],
      foreignColumns: [airtableConnections.organizationId, airtableConnections.id],
    }).onDelete("cascade"),
    unique("airtable_projection_configs_organization_id_id_unique").on(
      table.organizationId,
      table.id,
    ),
    unique("airtable_projection_configs_connection_entity_unique").on(
      table.connectionId,
      table.entityType,
    ),
    check("airtable_projection_configs_enabled_check", sql`${table.enabled} IN (0, 1)`),
    check("airtable_projection_configs_schema_version_check", sql`${table.schemaVersion} > 0`),
    check(
      "airtable_projection_configs_field_mapping_json_check",
      sql`json_valid(${table.fieldMappingJson}) AND json_type(${table.fieldMappingJson}) = 'object'`,
    ),
    check(
      "airtable_projection_configs_inbound_fields_json_check",
      sql`json_valid(${table.inboundFieldAllowlistJson}) AND json_type(${table.inboundFieldAllowlistJson}) = 'array'`,
    ),
    check(
      "airtable_projection_configs_conflict_policy_check",
      sql`${table.conflictPolicy} IN ('manual', 'd1_wins', 'airtable_wins')`,
    ),
    check(
      "airtable_projection_configs_projection_version_check",
      sql`${table.projectionVersion} > 0`,
    ),
    uniqueIndex("airtable_projection_configs_enabled_table_unique")
      .on(table.connectionId, table.tableId)
      .where(sql`${table.enabled} = 1`),
    index("airtable_projection_configs_enabled_entities_idx").on(
      table.connectionId,
      table.enabled,
      table.entityType,
    ),
  ],
);

export const airtableRecordMappings = sqliteTable(
  "airtable_record_mappings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    connectionId: text("connection_id").notNull(),
    entityType: text("entity_type").notNull(),
    applicationId: text("application_id").notNull(),
    tableId: text("table_id").notNull(),
    recordId: text("record_id").notNull(),
    lastExportedVersion: integer("last_exported_version"),
    lastExportedHash: text("last_exported_hash"),
    lastObservedHash: text("last_observed_hash"),
    lastExportedAt: text("last_exported_at"),
    mappingVersion: integer("mapping_version").notNull(),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.connectionId],
      foreignColumns: [airtableConnections.organizationId, airtableConnections.id],
    }).onDelete("cascade"),
    unique("airtable_record_mappings_organization_id_id_unique").on(table.organizationId, table.id),
    unique("airtable_record_mappings_application_unique").on(
      table.connectionId,
      table.entityType,
      table.applicationId,
    ),
    unique("airtable_record_mappings_record_unique").on(
      table.connectionId,
      table.tableId,
      table.recordId,
    ),
    check(
      "airtable_record_mappings_last_exported_version_check",
      sql`${table.lastExportedVersion} IS NULL OR ${table.lastExportedVersion} > 0`,
    ),
    check("airtable_record_mappings_mapping_version_check", sql`${table.mappingVersion} > 0`),
    index("airtable_record_mappings_application_idx").on(
      table.connectionId,
      table.entityType,
      table.applicationId,
    ),
    index("airtable_record_mappings_record_idx").on(
      table.connectionId,
      table.tableId,
      table.recordId,
    ),
  ],
);

export const airtableSyncJobs = sqliteTable(
  "airtable_sync_jobs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    connectionId: text("connection_id").notNull(),
    connectionVersion: integer("connection_version").notNull(),
    entityType: text("entity_type").notNull(),
    applicationId: text("application_id").notNull(),
    sourceVersion: integer("source_version").notNull(),
    operation: text("operation", {
      enum: ["upsert", "archive", "delete", "reconcile"],
    }).notNull(),
    state: text("state", {
      enum: ["pending", "claimed", "succeeded", "retry", "dead", "cancelled"],
    }).notNull(),
    deduplicationKey: text("deduplication_key").notNull(),
    attempts: integer("attempt_count").notNull(),
    availableAt: text("available_at").notNull(),
    claimOwner: text("claim_owner"),
    claimToken: text("claim_token"),
    leaseExpiresAt: text("lease_expires_at"),
    payloadJson: text("payload_json").notNull(),
    payloadHash: text("payload_hash").notNull(),
    lastErrorCode: text("last_error_code"),
    lastError: text("last_error"),
    ...timestampColumns,
    completedAt: text("completed_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.connectionId],
      foreignColumns: [airtableConnections.organizationId, airtableConnections.id],
    }).onDelete("cascade"),
    unique("airtable_sync_jobs_deduplication_key_unique").on(table.deduplicationKey),
    check("airtable_sync_jobs_connection_version_check", sql`${table.connectionVersion} > 0`),
    check("airtable_sync_jobs_source_version_check", sql`${table.sourceVersion} > 0`),
    check(
      "airtable_sync_jobs_operation_check",
      sql`${table.operation} IN ('upsert', 'archive', 'delete', 'reconcile')`,
    ),
    check(
      "airtable_sync_jobs_state_check",
      sql`${table.state} IN ('pending', 'claimed', 'succeeded', 'retry', 'dead', 'cancelled')`,
    ),
    check("airtable_sync_jobs_attempt_count_check", sql`${table.attempts} >= 0`),
    check(
      "airtable_sync_jobs_payload_json_check",
      sql`json_valid(${table.payloadJson}) AND json_type(${table.payloadJson}) = 'object'`,
    ),
    check(
      "airtable_sync_jobs_claim_lease_check",
      sql`(${table.state} = 'claimed' AND ${table.claimOwner} IS NOT NULL AND ${table.claimToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL) OR (${table.state} <> 'claimed' AND ${table.claimOwner} IS NULL AND ${table.claimToken} IS NULL AND ${table.leaseExpiresAt} IS NULL)`,
    ),
    index("airtable_sync_jobs_claim_idx").on(table.state, table.availableAt, table.connectionId),
    index("airtable_sync_jobs_expired_lease_idx").on(table.state, table.leaseExpiresAt),
    index("airtable_sync_jobs_entity_source_idx").on(
      table.connectionId,
      table.entityType,
      table.applicationId,
      desc(table.sourceVersion),
    ),
    index("airtable_sync_jobs_connection_state_idx").on(
      table.connectionId,
      table.state,
      table.availableAt,
    ),
  ],
);

export const airtableInitialSyncCheckpoints = sqliteTable(
  "airtable_initial_export_checkpoints",
  {
    connectionId: text("connection_id")
      .notNull()
      .references(() => airtableConnections.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    lastApplicationId: text("cursor_application_id"),
    state: text("state", {
      enum: ["pending", "running", "completed", "failed"],
    }).notNull(),
    scannedCount: integer("scanned_count").notNull(),
    enqueuedCount: integer("enqueued_count").notNull(),
    startedAt: text("started_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.entityType] }),
    check(
      "airtable_initial_export_checkpoints_state_check",
      sql`${table.state} IN ('pending', 'running', 'completed', 'failed')`,
    ),
    check(
      "airtable_initial_export_checkpoints_scanned_count_check",
      sql`${table.scannedCount} >= 0`,
    ),
    check(
      "airtable_initial_export_checkpoints_enqueued_count_check",
      sql`${table.enqueuedCount} >= 0`,
    ),
  ],
);

export const airtableWebhookRegistrations = sqliteTable(
  "airtable_webhook_registrations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    connectionId: text("connection_id").notNull(),
    webhookId: text("provider_webhook_id"),
    encryptedMacSecret: text("mac_secret_ciphertext"),
    expirationTime: text("expires_at"),
    specificationHash: text("specification_hash").notNull(),
    status: text("status", {
      enum: ["creating", "active", "refreshing", "expired", "invalid", "deleting", "deleted"],
    }).notNull(),
    refreshLeaseOwner: text("refresh_owner"),
    refreshLeaseToken: text("refresh_token"),
    refreshLeaseExpiresAt: text("refresh_lease_expires_at"),
    registrationVersion: integer("registration_version").notNull(),
    ...timestampColumns,
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.connectionId],
      foreignColumns: [airtableConnections.organizationId, airtableConnections.id],
    }).onDelete("cascade"),
    unique("airtable_webhook_registrations_scope_unique").on(
      table.organizationId,
      table.connectionId,
      table.id,
    ),
    check(
      "airtable_webhook_registrations_status_check",
      sql`${table.status} IN ('creating', 'active', 'refreshing', 'expired', 'invalid', 'deleting', 'deleted')`,
    ),
    check(
      "airtable_webhook_registrations_registration_version_check",
      sql`${table.registrationVersion} > 0`,
    ),
    check(
      "airtable_webhook_registrations_refresh_lease_check",
      sql`(${table.status} = 'refreshing' AND ${table.refreshLeaseOwner} IS NOT NULL AND ${table.refreshLeaseToken} IS NOT NULL AND ${table.refreshLeaseExpiresAt} IS NOT NULL) OR (${table.status} <> 'refreshing' AND ${table.refreshLeaseOwner} IS NULL AND ${table.refreshLeaseToken} IS NULL AND ${table.refreshLeaseExpiresAt} IS NULL)`,
    ),
    uniqueIndex("airtable_webhook_registrations_provider_unique")
      .on(table.connectionId, table.webhookId)
      .where(sql`${table.webhookId} IS NOT NULL`),
    index("airtable_webhook_registrations_expiry_status_idx").on(
      table.status,
      table.expirationTime,
    ),
  ],
);

export const airtableWebhookNotifications = sqliteTable(
  "airtable_webhook_notifications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    connectionId: text("connection_id").notNull(),
    registrationId: text("registration_id").notNull(),
    providerNotificationId: text("provider_notification_id"),
    notificationDigest: text("raw_body_hash").notNull(),
    timeBucket: text("time_bucket").notNull(),
    rawBody: text("raw_body").notNull(),
    contentMac: text("content_mac").notNull(),
    state: text("status", { enum: ["received", "processed", "rejected"] }).notNull(),
    receivedAt: text("received_at").notNull(),
    processedAt: text("processed_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.connectionId, table.registrationId],
      foreignColumns: [
        airtableWebhookRegistrations.organizationId,
        airtableWebhookRegistrations.connectionId,
        airtableWebhookRegistrations.id,
      ],
    }).onDelete("cascade"),
    check(
      "airtable_webhook_notifications_status_check",
      sql`${table.state} IN ('received', 'processed', 'rejected')`,
    ),
    uniqueIndex("airtable_webhook_notifications_provider_unique")
      .on(table.registrationId, table.providerNotificationId)
      .where(sql`${table.providerNotificationId} IS NOT NULL`),
    uniqueIndex("airtable_webhook_notifications_fallback_unique")
      .on(table.registrationId, table.notificationDigest, table.timeBucket)
      .where(sql`${table.providerNotificationId} IS NULL`),
    index("airtable_webhook_notifications_connection_status_idx").on(
      table.connectionId,
      table.state,
      table.receivedAt,
    ),
  ],
);

export const airtableWebhookCursors = sqliteTable(
  "airtable_webhook_cursors",
  {
    registrationId: text("registration_id")
      .primaryKey()
      .references(() => airtableWebhookRegistrations.id, { onDelete: "cascade" }),
    nextCursor: text("next_cursor").notNull(),
    rowVersion: integer("row_version").notNull(),
    claimOwner: text("claim_owner"),
    claimToken: text("claim_token"),
    leaseExpiresAt: text("lease_expires_at"),
    lastFetchedAt: text("last_fetched_at"),
    reconciliationRequired: integer("reconciliation_required").notNull(),
  },
  (table) => [
    check("airtable_webhook_cursors_row_version_check", sql`${table.rowVersion} > 0`),
    check(
      "airtable_webhook_cursors_reconciliation_required_check",
      sql`${table.reconciliationRequired} IN (0, 1)`,
    ),
    check(
      "airtable_webhook_cursors_claim_lease_check",
      sql`(${table.claimOwner} IS NULL AND ${table.claimToken} IS NULL AND ${table.leaseExpiresAt} IS NULL) OR (${table.claimOwner} IS NOT NULL AND ${table.claimToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
    index("airtable_webhook_cursors_lease_idx").on(table.leaseExpiresAt),
  ],
);

export const airtableInboundChanges = sqliteTable(
  "airtable_inbound_changes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    connectionId: text("connection_id").notNull(),
    registrationId: text("registration_id").notNull(),
    baseTransactionNumber: integer("base_transaction_number").notNull(),
    tableId: text("table_id").notNull(),
    recordId: text("record_id").notNull(),
    fieldId: text("field_id").notNull(),
    entityType: text("entity_type"),
    applicationId: text("application_id"),
    payloadJson: text("source_value_json").notNull(),
    sourceHash: text("source_hash").notNull(),
    state: text("state", {
      enum: ["pending", "claimed", "applied", "noop", "conflict", "retry", "dead", "cancelled"],
    }).notNull(),
    attempts: integer("attempt_count").notNull(),
    availableAt: text("available_at").notNull(),
    claimOwner: text("claim_owner"),
    claimToken: text("claim_token"),
    leaseExpiresAt: text("lease_expires_at"),
    lastError: text("last_error"),
    ...timestampColumns,
    completedAt: text("completed_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.connectionId, table.registrationId],
      foreignColumns: [
        airtableWebhookRegistrations.organizationId,
        airtableWebhookRegistrations.connectionId,
        airtableWebhookRegistrations.id,
      ],
    }).onDelete("cascade"),
    unique("airtable_inbound_changes_source_unique").on(
      table.registrationId,
      table.baseTransactionNumber,
      table.tableId,
      table.recordId,
      table.fieldId,
    ),
    check(
      "airtable_inbound_changes_base_transaction_number_check",
      sql`${table.baseTransactionNumber} >= 0`,
    ),
    check(
      "airtable_inbound_changes_source_value_json_check",
      sql`json_valid(${table.payloadJson})`,
    ),
    check(
      "airtable_inbound_changes_state_check",
      sql`${table.state} IN ('pending', 'claimed', 'applied', 'noop', 'conflict', 'retry', 'dead', 'cancelled')`,
    ),
    check("airtable_inbound_changes_attempt_count_check", sql`${table.attempts} >= 0`),
    check(
      "airtable_inbound_changes_entity_application_check",
      sql`(${table.entityType} IS NULL AND ${table.applicationId} IS NULL) OR (${table.entityType} IS NOT NULL AND ${table.applicationId} IS NOT NULL)`,
    ),
    check(
      "airtable_inbound_changes_claim_lease_check",
      sql`(${table.state} = 'claimed' AND ${table.claimOwner} IS NOT NULL AND ${table.claimToken} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL) OR (${table.state} <> 'claimed' AND ${table.claimOwner} IS NULL AND ${table.claimToken} IS NULL AND ${table.leaseExpiresAt} IS NULL)`,
    ),
    index("airtable_inbound_changes_due_idx").on(
      table.state,
      table.availableAt,
      table.connectionId,
    ),
    index("airtable_inbound_changes_expired_lease_idx").on(table.state, table.leaseExpiresAt),
    index("airtable_inbound_changes_record_idx").on(
      table.connectionId,
      table.tableId,
      table.recordId,
      table.baseTransactionNumber,
    ),
    index("airtable_inbound_changes_entity_idx").on(
      table.connectionId,
      table.entityType,
      table.applicationId,
      table.state,
    ),
  ],
);

export const airtableSyncConflicts = sqliteTable(
  "airtable_sync_conflicts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    connectionId: text("connection_id").notNull(),
    entityType: text("entity_type").notNull(),
    applicationId: text("application_id").notNull(),
    fieldId: text("field_id").notNull(),
    sourceTransactionNumber: integer("source_transaction").notNull(),
    d1Version: integer("d1_version").notNull(),
    d1ValueJson: text("d1_value_json").notNull(),
    airtableValueJson: text("airtable_value_json").notNull(),
    state: text("status", { enum: ["open", "resolving", "resolved"] }).notNull(),
    resolution: text("resolution", { enum: ["use_d1", "use_airtable", "manual"] }),
    resolvedBy: text("resolver_id"),
    detectedAt: text("detected_at").notNull(),
    resolvingAt: text("resolving_at"),
    resolvedAt: text("resolved_at"),
    resolutionCommandId: text("resolution_command_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.connectionId],
      foreignColumns: [airtableConnections.organizationId, airtableConnections.id],
    }).onDelete("cascade"),
    check(
      "airtable_sync_conflicts_source_transaction_check",
      sql`${table.sourceTransactionNumber} >= 0`,
    ),
    check("airtable_sync_conflicts_d1_version_check", sql`${table.d1Version} > 0`),
    check("airtable_sync_conflicts_d1_value_json_check", sql`json_valid(${table.d1ValueJson})`),
    check(
      "airtable_sync_conflicts_airtable_value_json_check",
      sql`json_valid(${table.airtableValueJson})`,
    ),
    check(
      "airtable_sync_conflicts_status_check",
      sql`${table.state} IN ('open', 'resolving', 'resolved')`,
    ),
    check(
      "airtable_sync_conflicts_resolution_check",
      sql`${table.resolution} IS NULL OR ${table.resolution} IN ('use_d1', 'use_airtable', 'manual')`,
    ),
    check(
      "airtable_sync_conflicts_lifecycle_check",
      sql`(${table.state} = 'open' AND ${table.resolution} IS NULL AND ${table.resolvedBy} IS NULL AND ${table.resolvingAt} IS NULL AND ${table.resolvedAt} IS NULL AND ${table.resolutionCommandId} IS NULL) OR (${table.state} = 'resolving' AND ${table.resolution} IS NOT NULL AND ${table.resolvedBy} IS NOT NULL AND ${table.resolvingAt} IS NOT NULL AND ${table.resolvedAt} IS NULL AND ${table.resolutionCommandId} IS NOT NULL) OR (${table.state} = 'resolved' AND ${table.resolution} IS NOT NULL AND ${table.resolvedBy} IS NOT NULL AND ${table.resolvingAt} IS NOT NULL AND ${table.resolvedAt} IS NOT NULL AND ${table.resolutionCommandId} IS NOT NULL)`,
    ),
    uniqueIndex("airtable_sync_conflicts_unresolved_unique")
      .on(table.connectionId, table.entityType, table.applicationId, table.fieldId)
      .where(sql`${table.state} IN ('open', 'resolving')`),
    uniqueIndex("airtable_sync_conflicts_resolution_command_unique")
      .on(table.connectionId, table.resolutionCommandId)
      .where(sql`${table.resolutionCommandId} IS NOT NULL`),
    index("airtable_sync_conflicts_status_time_idx").on(
      table.connectionId,
      table.state,
      desc(table.detectedAt),
    ),
    index("airtable_sync_conflicts_entity_idx").on(
      table.connectionId,
      table.entityType,
      table.applicationId,
      table.state,
    ),
  ],
);
