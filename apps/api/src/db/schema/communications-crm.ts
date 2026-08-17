import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const purposes = sql`purpose IN ('verification','receipt','reminder','decision','task','schedule_publish','schedule_update','schedule_cancel','organizer_group_email')`;
const audiences = sql`audience IN ('all_participants','accepted_participants','waitlisted_participants','rejected_participants','task_assignees','scheduled_participants')`;
const pipelineStages = sql`pipeline_stage IN ('new','contacted','qualified','invited','registered','accepted','declined','won','lost')`;

export const communicationTemplates = sqliteTable(
  "communication_templates",
  {
    id: text("id").notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    status: text("status").notNull(),
    sender: text("sender").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    variablesJson: text("variables_json").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.version] }),
    uniqueIndex("communication_templates_scope_uidx").on(
      t.organizationId,
      t.eventId,
      t.id,
      t.version,
    ),
    check("communication_templates_version_check", sql`${t.version} > 0`),
    check("communication_templates_purpose_check", purposes),
    check(
      "communication_templates_status_check",
      sql`${t.status} IN ('draft','approved','archived')`,
    ),
    check(
      "communication_templates_sender_check",
      sql`${t.sender} = trim(${t.sender}) AND length(${t.sender}) BETWEEN 3 AND 320 AND ${t.sender} NOT LIKE '%@%@%' AND instr(${t.sender}, '@') > 1 AND substr(${t.sender}, 1, 1) <> '.' AND substr(${t.sender}, instr(${t.sender}, '@') - 1, 1) GLOB '[A-Za-z0-9_+-]' AND substr(${t.sender}, 1, instr(${t.sender}, '@') - 1) NOT GLOB '*[^A-Za-z0-9_+.''-]*' AND ${t.sender} NOT LIKE '%..%' AND substr(${t.sender}, instr(${t.sender}, '@') + 1) LIKE '%.%' AND substr(${t.sender}, instr(${t.sender}, '@') + 1) NOT GLOB '*[^A-Za-z0-9.-]*' AND substr(${t.sender}, instr(${t.sender}, '@') + 1, 1) GLOB '[A-Za-z0-9]' AND substr(${t.sender}, -1, 1) GLOB '[A-Za-z]' AND substr(${t.sender}, -2, 1) GLOB '[A-Za-z]' AND substr(rtrim(substr(${t.sender}, instr(${t.sender}, '@') + 1), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'), -1, 1) = '.' AND substr(${t.sender}, instr(${t.sender}, '@') + 1) NOT LIKE '.%' AND substr(${t.sender}, instr(${t.sender}, '@') + 1) NOT LIKE '%.' AND substr(${t.sender}, instr(${t.sender}, '@') + 1) NOT LIKE '-%' AND substr(${t.sender}, instr(${t.sender}, '@') + 1) NOT LIKE '%-' AND substr(${t.sender}, instr(${t.sender}, '@') + 1) NOT LIKE '%.-%' AND substr(${t.sender}, instr(${t.sender}, '@') + 1) NOT LIKE '%-.%'`,
    ),
    check(
      "communication_templates_variables_json_check",
      sql`json_valid(${t.variablesJson}) AND json_type(${t.variablesJson}) = 'array'`,
    ),
    check(
      "communication_templates_approval_check",
      sql`(${t.status} = 'approved') = (${t.approvedBy} IS NOT NULL AND ${t.approvedAt} IS NOT NULL)`,
    ),
    index("communication_templates_lookup_idx").on(
      t.organizationId,
      t.eventId,
      t.purpose,
      t.status,
      t.version,
    ),
  ],
);

export const communicationRecipients = sqliteTable(
  "communication_recipients",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    participantId: text("participant_id"),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    dataJson: text("data_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("communication_recipients_scope_uidx").on(t.organizationId, t.eventId, t.id),
    check(
      "communication_recipients_data_json_check",
      sql`json_valid(${t.dataJson}) AND json_type(${t.dataJson}) = 'object'`,
    ),
    index("communication_recipients_email_idx").on(t.organizationId, t.eventId, t.email),
    index("communication_recipients_participant_idx").on(
      t.organizationId,
      t.eventId,
      t.participantId,
    ),
  ],
);

export const communicationRecipientAudiences = sqliteTable(
  "communication_recipient_audiences",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    audience: text("audience").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId, t.recipientId, t.audience] }),
    check("communication_recipient_audiences_audience_check", audiences),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.recipientId],
      foreignColumns: [
        communicationRecipients.organizationId,
        communicationRecipients.eventId,
        communicationRecipients.id,
      ],
    }).onDelete("cascade"),
    index("communication_recipient_audiences_reverse_idx").on(
      t.organizationId,
      t.eventId,
      t.audience,
      t.recipientId,
    ),
  ],
);

export const communicationPreviews = sqliteTable(
  "communication_previews",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    purpose: text("purpose").notNull(),
    templateId: text("template_id").notNull(),
    templateVersion: integer("template_version").notNull(),
    audience: text("audience").notNull(),
    renderDataJson: text("render_data_json").notNull(),
    recipientCount: integer("recipient_count").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("communication_previews_scope_uidx").on(t.organizationId, t.eventId, t.id),
    check("communication_previews_purpose_check", purposes),
    check("communication_previews_audience_check", audiences),
    check("communication_previews_count_check", sql`${t.recipientCount} >= 0`),
    check(
      "communication_previews_data_json_check",
      sql`json_valid(${t.renderDataJson}) AND json_type(${t.renderDataJson}) = 'object'`,
    ),
    foreignKey({
      columns: [t.templateId, t.templateVersion],
      foreignColumns: [communicationTemplates.id, communicationTemplates.version],
    }).onDelete("restrict"),
    index("communication_previews_expiry_idx").on(t.expiresAt),
  ],
);

export const communicationPreviewRecipients = sqliteTable(
  "communication_preview_recipients",
  {
    previewId: text("preview_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    participantId: text("participant_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    audiencesJson: text("audiences_json").notNull(),
    dataJson: text("data_json").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.previewId, t.recipientId] }),
    uniqueIndex("communication_preview_recipients_ordinal_uidx").on(t.previewId, t.ordinal),
    foreignKey({ columns: [t.previewId], foreignColumns: [communicationPreviews.id] }).onDelete(
      "cascade",
    ),
    check("communication_preview_recipients_ordinal_check", sql`${t.ordinal} >= 0`),
    check(
      "communication_preview_recipients_audiences_json_check",
      sql`json_valid(${t.audiencesJson}) AND json_type(${t.audiencesJson}) = 'array'`,
    ),
    check(
      "communication_preview_recipients_data_json_check",
      sql`json_valid(${t.dataJson}) AND json_type(${t.dataJson}) = 'object'`,
    ),
  ],
);

export const communicationSends = sqliteTable(
  "communication_sends",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    purpose: text("purpose").notNull(),
    audience: text("audience"),
    templateId: text("template_id").notNull(),
    templateVersion: integer("template_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    previewId: text("preview_id"),
    dataJson: text("data_json").notNull(),
    status: text("status").notNull(),
    recipientCount: integer("recipient_count").notNull(),
    queuedCount: integer("queued_count").notNull(),
    deliveredCount: integer("delivered_count").notNull(),
    failedCount: integer("failed_count").notNull(),
    terminal: integer("terminal").notNull(),
    templateName: text("template_name").notNull(),
    templatePurpose: text("template_purpose").notNull(),
    templateSender: text("template_sender").notNull(),
    templateSubject: text("template_subject").notNull(),
    templateHtml: text("template_html").notNull(),
    templateText: text("template_text").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("communication_sends_idempotency_uidx").on(
      t.organizationId,
      t.eventId,
      t.idempotencyKey,
    ),
    check("communication_sends_purpose_check", purposes),
    check(
      "communication_sends_audience_check",
      sql`${t.audience} IS NULL OR ${t.audience} IN ('all_participants','accepted_participants','waitlisted_participants','rejected_participants','task_assignees','scheduled_participants')`,
    ),
    check(
      "communication_sends_status_check",
      sql`${t.status} IN ('queued','delivered','partial','failed')`,
    ),
    check("communication_sends_terminal_check", sql`${t.terminal} IN (0,1)`),
    check(
      "communication_sends_counts_check",
      sql`${t.recipientCount} >= 0 AND ${t.queuedCount} >= 0 AND ${t.deliveredCount} >= 0 AND ${t.failedCount} >= 0 AND ${t.queuedCount} + ${t.deliveredCount} + ${t.failedCount} = ${t.recipientCount}`,
    ),
    check(
      "communication_sends_data_json_check",
      sql`json_valid(${t.dataJson}) AND json_type(${t.dataJson}) = 'object'`,
    ),
    check(
      "communication_sends_template_sender_check",
      sql`${t.templateSender} = trim(${t.templateSender}) AND length(${t.templateSender}) BETWEEN 3 AND 320 AND ${t.templateSender} NOT LIKE '%@%@%' AND instr(${t.templateSender}, '@') > 1 AND substr(${t.templateSender}, 1, 1) <> '.' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') - 1, 1) GLOB '[A-Za-z0-9_+-]' AND substr(${t.templateSender}, 1, instr(${t.templateSender}, '@') - 1) NOT GLOB '*[^A-Za-z0-9_+.''-]*' AND ${t.templateSender} NOT LIKE '%..%' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1) LIKE '%.%' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1) NOT GLOB '*[^A-Za-z0-9.-]*' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1, 1) GLOB '[A-Za-z0-9]' AND substr(${t.templateSender}, -1, 1) GLOB '[A-Za-z]' AND substr(${t.templateSender}, -2, 1) GLOB '[A-Za-z]' AND substr(rtrim(substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'), -1, 1) = '.' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1) NOT LIKE '.%' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1) NOT LIKE '%.' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1) NOT LIKE '-%' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1) NOT LIKE '%-' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1) NOT LIKE '%.-%' AND substr(${t.templateSender}, instr(${t.templateSender}, '@') + 1) NOT LIKE '%-.%'`,
    ),
    foreignKey({
      columns: [t.templateId, t.templateVersion],
      foreignColumns: [communicationTemplates.id, communicationTemplates.version],
    }).onDelete("restrict"),
    foreignKey({ columns: [t.previewId], foreignColumns: [communicationPreviews.id] }).onDelete(
      "set null",
    ),
    index("communication_sends_status_idx").on(t.organizationId, t.eventId, t.status, t.createdAt),
  ],
);

export const communicationSendRecipients = sqliteTable(
  "communication_send_recipients",
  {
    sendId: text("send_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    participantId: text("participant_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    audiencesJson: text("audiences_json").notNull(),
    dataJson: text("data_json").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sendId, t.recipientId] }),
    foreignKey({ columns: [t.sendId], foreignColumns: [communicationSends.id] }).onDelete(
      "restrict",
    ),
    check(
      "communication_send_recipients_audiences_json_check",
      sql`json_valid(${t.audiencesJson}) AND json_type(${t.audiencesJson}) = 'array'`,
    ),
    check(
      "communication_send_recipients_data_json_check",
      sql`json_valid(${t.dataJson}) AND json_type(${t.dataJson}) = 'object'`,
    ),
    index("communication_send_recipients_email_idx").on(t.sendId, t.email),
  ],
);

export const communicationDeliveries = sqliteTable(
  "communication_deliveries",
  {
    sendId: text("send_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    failureReason: text("failure_reason"),
    attempts: integer("attempts").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sendId, t.recipientId] }),
    foreignKey({
      columns: [t.sendId, t.recipientId],
      foreignColumns: [communicationSendRecipients.sendId, communicationSendRecipients.recipientId],
    }).onDelete("restrict"),
    check(
      "communication_deliveries_status_check",
      sql`${t.status} IN ('queued','delivered','failed','bounced','complained')`,
    ),
    check("communication_deliveries_attempts_check", sql`${t.attempts} >= 0`),
    uniqueIndex("communication_deliveries_provider_uidx")
      .on(t.providerMessageId)
      .where(sql`${t.providerMessageId} IS NOT NULL`),
  ],
);

export const communicationDeliveryHistory = sqliteTable(
  "communication_delivery_history",
  {
    sendId: text("send_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    id: text("id").notNull(),
    status: text("status").notNull(),
    occurredAt: text("occurred_at").notNull(),
    providerMessageId: text("provider_message_id"),
    reason: text("reason"),
    actorId: text("actor_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sendId, t.recipientId, t.ordinal] }),
    uniqueIndex("communication_delivery_history_id_uidx").on(t.id),
    foreignKey({
      columns: [t.sendId, t.recipientId],
      foreignColumns: [communicationDeliveries.sendId, communicationDeliveries.recipientId],
    }).onDelete("restrict"),
    check(
      "communication_delivery_history_status_check",
      sql`${t.status} IN ('queued','delivered','failed','bounced','complained')`,
    ),
    check("communication_delivery_history_ordinal_check", sql`${t.ordinal} >= 0`),
  ],
);

export const crmContacts = sqliteTable(
  "crm_contacts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    title: text("title"),
    website: text("website"),
    linkedinUrl: text("linkedin_url"),
    notes: text("notes"),
    customFieldsJson: text("custom_fields_json").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    mergedIntoId: text("merged_into_id"),
    mergeAuditId: text("merge_audit_id"),
    mergedAt: text("merged_at"),
    mergeSourceIdsJson: text("merge_source_ids_json").notNull(),
    pipelineStage: text("pipeline_stage").notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("crm_contacts_scope_uidx").on(t.organizationId, t.id),
    uniqueIndex("crm_contacts_active_email_uidx")
      .on(t.organizationId, t.email)
      .where(sql`${t.email} IS NOT NULL AND ${t.status} = 'active'`),
    foreignKey({
      columns: [t.organizationId, t.mergedIntoId],
      foreignColumns: [t.organizationId, t.id],
    }).onDelete("restrict"),
    check("crm_contacts_source_check", sql`${t.source} IN ('manual','csv','speaker','import')`),
    check("crm_contacts_status_check", sql`${t.status} IN ('active','merged')`),
    check("crm_contacts_pipeline_check", pipelineStages),
    check("crm_contacts_version_check", sql`${t.version} > 0`),
    check(
      "crm_contacts_custom_fields_json_check",
      sql`json_valid(${t.customFieldsJson}) AND json_type(${t.customFieldsJson}) = 'object'`,
    ),
    check(
      "crm_contacts_merge_sources_json_check",
      sql`json_valid(${t.mergeSourceIdsJson}) AND json_type(${t.mergeSourceIdsJson}) = 'array'`,
    ),
    check(
      "crm_contacts_merge_check",
      sql`(${t.status} = 'merged') = (${t.mergedIntoId} IS NOT NULL AND ${t.mergedAt} IS NOT NULL)`,
    ),
    index("crm_contacts_pipeline_idx").on(t.organizationId, t.status, t.pipelineStage, t.updatedAt),
    index("crm_contacts_company_idx").on(t.organizationId, t.company, t.status),
    index("crm_contacts_email_idx").on(t.organizationId, t.email),
    index("crm_contacts_merged_into_idx").on(t.organizationId, t.mergedIntoId),
  ],
);

export const crmContactTags = sqliteTable(
  "crm_contact_tags",
  {
    organizationId: text("organization_id").notNull(),
    contactId: text("contact_id").notNull(),
    tag: text("tag").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.contactId, t.tag] }),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [crmContacts.organizationId, crmContacts.id],
    }).onDelete("cascade"),
    index("crm_contact_tags_reverse_idx").on(t.organizationId, t.tag, t.contactId),
  ],
);

export const crmSegments = sqliteTable(
  "crm_segments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    rulesJson: text("rules_json").notNull(),
    mergeAuditIdsJson: text("merge_audit_ids_json").notNull(),
    createdBy: text("created_by").notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("crm_segments_name_uidx").on(t.organizationId, t.name),
    check("crm_segments_version_check", sql`${t.version} > 0`),
    check(
      "crm_segments_rules_json_check",
      sql`json_valid(${t.rulesJson}) AND json_type(${t.rulesJson}) = 'array'`,
    ),
    check(
      "crm_segments_merge_audits_json_check",
      sql`json_valid(${t.mergeAuditIdsJson}) AND json_type(${t.mergeAuditIdsJson}) = 'array'`,
    ),
    index("crm_segments_name_idx").on(t.organizationId, t.name),
  ],
);

export const crmHistory = sqliteTable(
  "crm_history",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    contactId: text("contact_id").notNull(),
    kind: text("kind").notNull(),
    eventId: text("event_id"),
    sessionId: text("session_id"),
    title: text("title").notNull(),
    detail: text("detail"),
    occurredAt: text("occurred_at").notNull(),
    metadataJson: text("metadata_json").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [crmContacts.organizationId, crmContacts.id],
    }).onDelete("restrict"),
    check(
      "crm_history_kind_check",
      sql`${t.kind} IN ('event','session','submission','attendance','note','pipeline','communication')`,
    ),
    check(
      "crm_history_metadata_json_check",
      sql`json_valid(${t.metadataJson}) AND json_type(${t.metadataJson}) = 'object'`,
    ),
    index("crm_history_contact_idx").on(t.organizationId, t.contactId, t.occurredAt),
    index("crm_history_event_idx").on(t.organizationId, t.eventId, t.occurredAt),
    index("crm_history_session_idx").on(t.organizationId, t.sessionId, t.occurredAt),
  ],
);

export const crmPipelineHistory = sqliteTable(
  "crm_pipeline_history",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    contactId: text("contact_id").notNull(),
    sourceCrmContactId: text("source_crm_contact_id").notNull(),
    mergeAuditId: text("merge_audit_id"),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    note: text("note"),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [crmContacts.organizationId, crmContacts.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.sourceCrmContactId],
      foreignColumns: [crmContacts.organizationId, crmContacts.id],
    }).onDelete("restrict"),
    check(
      "crm_pipeline_history_from_check",
      sql`${t.fromStage} IS NULL OR ${t.fromStage} IN ('new','contacted','qualified','invited','registered','accepted','declined','won','lost')`,
    ),
    check(
      "crm_pipeline_history_to_check",
      sql`${t.toStage} IN ('new','contacted','qualified','invited','registered','accepted','declined','won','lost')`,
    ),
    index("crm_pipeline_history_contact_idx").on(t.organizationId, t.contactId, t.createdAt),
    index("crm_pipeline_history_source_idx").on(
      t.organizationId,
      t.sourceCrmContactId,
      t.createdAt,
    ),
  ],
);

export const crmNotes = sqliteTable(
  "crm_notes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    contactId: text("contact_id").notNull(),
    sourceCrmContactId: text("source_crm_contact_id").notNull(),
    mergeAuditId: text("merge_audit_id"),
    body: text("body").notNull(),
    authorId: text("author_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [crmContacts.organizationId, crmContacts.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.sourceCrmContactId],
      foreignColumns: [crmContacts.organizationId, crmContacts.id],
    }).onDelete("restrict"),
    index("crm_notes_contact_idx").on(t.organizationId, t.contactId, t.createdAt),
    index("crm_notes_source_idx").on(t.organizationId, t.sourceCrmContactId, t.createdAt),
  ],
);

export const crmParticipantLinks = sqliteTable(
  "crm_participant_links",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    participantId: text("participant_id").notNull(),
    crmContactId: text("crm_contact_id").notNull(),
    sourceCrmContactId: text("source_crm_contact_id"),
    mergeAuditId: text("merge_audit_id"),
    sessionId: text("session_id"),
    role: text("role").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("crm_participant_links_participant_uidx").on(
      t.organizationId,
      t.eventId,
      t.participantId,
    ),
    foreignKey({
      columns: [t.organizationId, t.crmContactId],
      foreignColumns: [crmContacts.organizationId, crmContacts.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.sourceCrmContactId],
      foreignColumns: [crmContacts.organizationId, crmContacts.id],
    }).onDelete("restrict"),
    check(
      "crm_participant_links_role_check",
      sql`${t.role} IN ('speaker','prospect','attendee','sponsor')`,
    ),
    index("crm_participant_links_contact_idx").on(t.organizationId, t.crmContactId, t.eventId),
    index("crm_participant_links_session_idx").on(t.organizationId, t.eventId, t.sessionId),
  ],
);

export const crmOutreach = sqliteTable(
  "crm_outreach",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    contactId: text("contact_id").notNull(),
    eventId: text("event_id"),
    recipientEmail: text("recipient_email").notNull(),
    templateSubject: text("template_subject").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    renderedBody: text("rendered_body").notNull(),
    status: text("status").notNull(),
    queuedCount: integer("queued_count").notNull(),
    sentCount: integer("sent_count").notNull(),
    failedCount: integer("failed_count").notNull(),
    terminal: integer("terminal").notNull(),
    failureReason: text("failure_reason"),
    providerMessageId: text("provider_message_id"),
    completedAt: text("completed_at"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("crm_outreach_idempotency_uidx").on(t.organizationId, t.idempotencyKey),
    foreignKey({
      columns: [t.organizationId, t.contactId],
      foreignColumns: [crmContacts.organizationId, crmContacts.id],
    }).onDelete("restrict"),
    check(
      "crm_outreach_status_check",
      sql`${t.status} IN ('queued','sent','delivered','failed','bounced','complained')`,
    ),
    check(
      "crm_outreach_counts_check",
      sql`${t.queuedCount} >= 0 AND ${t.sentCount} >= 0 AND ${t.failedCount} >= 0`,
    ),
    check("crm_outreach_terminal_check", sql`${t.terminal} IN (0,1)`),
    check("crm_outreach_completion_check", sql`${t.terminal} = 0 OR ${t.completedAt} IS NOT NULL`),
    index("crm_outreach_status_idx").on(t.organizationId, t.status, t.createdAt),
    index("crm_outreach_contact_idx").on(t.organizationId, t.contactId, t.createdAt),
    index("crm_outreach_provider_idx").on(t.providerMessageId),
  ],
);

export const crmImports = sqliteTable(
  "crm_imports",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    createdCount: integer("created_count").notNull(),
    updatedCount: integer("updated_count").notNull(),
    skippedCount: integer("skipped_count").notNull(),
    errorCount: integer("error_count").notNull(),
    mappingJson: text("mapping_json").notNull(),
    rowsJson: text("rows_json").notNull(),
    contactIdsJson: text("contact_ids_json").notNull(),
    idempotent: integer("idempotent").notNull(),
    idempotencyKey: text("idempotency_key"),
    planFingerprint: text("plan_fingerprint"),
    preview: integer("preview").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("crm_imports_committed_idempotency_uidx")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL AND ${t.preview} = 0`),
    check(
      "crm_imports_counts_check",
      sql`${t.createdCount} >= 0 AND ${t.updatedCount} >= 0 AND ${t.skippedCount} >= 0 AND ${t.errorCount} >= 0`,
    ),
    check("crm_imports_booleans_check", sql`${t.idempotent} IN (0,1) AND ${t.preview} IN (0,1)`),
    check(
      "crm_imports_mapping_json_check",
      sql`json_valid(${t.mappingJson}) AND json_type(${t.mappingJson}) = 'array'`,
    ),
    check(
      "crm_imports_rows_json_check",
      sql`json_valid(${t.rowsJson}) AND json_type(${t.rowsJson}) = 'array'`,
    ),
    check(
      "crm_imports_contacts_json_check",
      sql`json_valid(${t.contactIdsJson}) AND json_type(${t.contactIdsJson}) = 'array'`,
    ),
    index("crm_imports_created_idx").on(t.organizationId, t.createdAt),
  ],
);

export const crmCommandResults = sqliteTable(
  "crm_command_results",
  {
    organizationId: text("organization_id").notNull(),
    command: text("command").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at"),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.command, t.idempotencyKey] }),
    check("crm_command_results_json_check", sql`json_valid(${t.resultJson})`),
    index("crm_command_results_expiry_idx").on(t.expiresAt),
  ],
);
