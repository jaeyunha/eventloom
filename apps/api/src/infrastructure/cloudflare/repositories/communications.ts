import {
  CommunicationError,
  redactCommunicationProviderReason,
} from "../../../features/communications/service";
import type {
  CommunicationAudience,
  CommunicationAuditEntry,
  CommunicationDelivery,
  CommunicationDeliveryHistoryEntry,
  CommunicationPreview,
  CommunicationRecipient,
  CommunicationRecipientPreview,
  CommunicationRecipientSnapshot,
  CommunicationRepository,
  CommunicationSend,
  CommunicationTemplate,
  CommunicationTemplateSnapshot,
} from "../../../features/communications/types";
import {
  batch,
  consequentialStatements,
  guard,
  insertGuard,
  json,
  parseJson,
  rows,
  statement,
} from "./shared";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value);
const nullable = (value: unknown) => (value === null || value === undefined ? null : String(value));
const number = (value: unknown) => Number(value);

function conflict(message: string): CommunicationError {
  return new CommunicationError("COMMUNICATION_CONFLICT", 409, message);
}

function templateFrom(row: Row): CommunicationTemplate {
  return {
    id: text(row.id),
    tenantId: text(row.organization_id),
    eventId: text(row.event_id),
    name: text(row.name),
    purpose: row.purpose as CommunicationTemplate["purpose"],
    version: number(row.version),
    status: row.status as CommunicationTemplate["status"],
    sender: row.sender as CommunicationTemplate["sender"],
    subject: text(row.subject),
    html: text(row.html),
    text: text(row.text),
    variables: parseJson(text(row.variables_json), []),
    createdBy: text(row.created_by),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    approvedBy: nullable(row.approved_by),
    approvedAt: nullable(row.approved_at),
  };
}

function snapshotFrom(row: Row): CommunicationRecipientSnapshot {
  return {
    id: text(row.recipient_id),
    participantId: text(row.participant_id),
    tenantId: text(row.organization_id),
    eventId: text(row.event_id),
    email: text(row.email),
    displayName: text(row.display_name),
    audiences: parseJson(text(row.audiences_json), []),
    data: parseJson(text(row.data_json), {}),
  };
}

function templateSnapshot(row: Row): CommunicationTemplateSnapshot {
  return {
    id: text(row.template_id),
    name: text(row.template_name),
    purpose: row.template_purpose as CommunicationTemplateSnapshot["purpose"],
    version: number(row.template_version),
    sender: row.template_sender as CommunicationTemplateSnapshot["sender"],
    subject: text(row.template_subject),
    html: text(row.template_html),
    text: text(row.template_text),
  };
}

export class D1CommunicationRepository implements CommunicationRepository {
  constructor(private readonly database: D1Database) {}

  async listTemplates(
    tenantId: string,
    eventId: string,
    purpose?: CommunicationTemplate["purpose"],
  ) {
    const result = await statement(
      this.database,
      `SELECT * FROM communication_templates WHERE organization_id = ? AND event_id = ?${purpose === undefined ? "" : " AND purpose = ?"} ORDER BY id, version`,
      purpose === undefined ? [tenantId, eventId] : [tenantId, eventId, purpose],
    ).all<Row>();
    return rows(result).map(templateFrom);
  }

  async getTemplate(tenantId: string, eventId: string, templateId: string, version?: number) {
    const row = await statement(
      this.database,
      `SELECT * FROM communication_templates WHERE organization_id = ? AND event_id = ? AND id = ?${version === undefined ? "" : " AND version = ?"} ORDER BY version DESC LIMIT 1`,
      version === undefined
        ? [tenantId, eventId, templateId]
        : [tenantId, eventId, templateId, version],
    ).first<Row>();
    return row === null ? undefined : templateFrom(row);
  }

  async saveTemplate(value: CommunicationTemplate) {
    try {
      await batch(this.database, [
        insertGuard(
          this.database,
          "communication_templates",
          "organization_id = ? AND event_id = ? AND id = ? AND version = ?",
          [value.tenantId, value.eventId, value.id, value.version],
        ),
        statement(
          this.database,
          `INSERT INTO communication_templates
          (id,organization_id,event_id,version,name,purpose,status,sender,subject,html,text,variables_json,created_by,created_at,updated_at,approved_by,approved_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            value.id,
            value.tenantId,
            value.eventId,
            value.version,
            value.name,
            value.purpose,
            value.status,
            value.sender,
            value.subject,
            value.html,
            value.text,
            json(value.variables),
            value.createdBy,
            value.createdAt,
            value.updatedAt,
            value.approvedBy,
            value.approvedAt,
          ],
        ),
        ...consequentialStatements(this.database, {
          tenantId: value.tenantId,
          eventId: value.eventId,
          action: "template.version_created",
          resourceType: "communication_template",
          resourceId: value.id,
          resourceVersion: value.version,
          occurredAt: value.updatedAt,
          after: value,
          sync: { entityType: "communication_template", applicationId: value.id, payload: value },
        }),
      ]);
    } catch {
      throw conflict("The communication template version already exists.");
    }
    return value;
  }

  async updateTemplate(value: CommunicationTemplate) {
    const result = await this.database
      .prepare(
        `UPDATE communication_templates
            SET status = ?, approved_by = ?, approved_at = ?, updated_at = ?
          WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?`,
      )
      .bind(
        value.status,
        value.approvedBy,
        value.approvedAt,
        value.updatedAt,
        value.tenantId,
        value.eventId,
        value.id,
        value.version,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw conflict("The communication template version was not found.");
    }
    return value;
  }

  async listRecipients(tenantId: string, eventId: string, audience: CommunicationAudience) {
    const result = await statement(
      this.database,
      `SELECT r.*,
      COALESCE((SELECT json_group_array(audience) FROM communication_recipient_audiences a WHERE a.organization_id=r.organization_id AND a.event_id=r.event_id AND a.recipient_id=r.id),'[]') audiences_json
      FROM communication_recipients r WHERE r.organization_id=? AND r.event_id=? AND
      (NOT EXISTS (SELECT 1 FROM communication_recipient_audiences x WHERE x.organization_id=r.organization_id AND x.event_id=r.event_id AND x.recipient_id=r.id)
       OR EXISTS (SELECT 1 FROM communication_recipient_audiences x WHERE x.organization_id=r.organization_id AND x.event_id=r.event_id AND x.recipient_id=r.id AND x.audience=?)) ORDER BY r.id`,
      [tenantId, eventId, audience],
    ).all<Row>();
    return rows(result).map(
      (row): CommunicationRecipient => ({
        id: text(row.id),
        ...(row.participant_id == null ? {} : { participantId: text(row.participant_id) }),
        tenantId: text(row.organization_id),
        eventId: text(row.event_id),
        email: text(row.email),
        displayName: text(row.display_name),
        audiences: parseJson(text(row.audiences_json), []),
        data: parseJson(text(row.data_json), {}),
      }),
    );
  }

  async getRecipientsByIds(tenantId: string, eventId: string, recipientIds: readonly string[]) {
    if (recipientIds.length === 0) return [];
    const result = await statement(
      this.database,
      `SELECT r.*,
      COALESCE((SELECT json_group_array(audience) FROM communication_recipient_audiences a WHERE a.organization_id=r.organization_id AND a.event_id=r.event_id AND a.recipient_id=r.id),'[]') audiences_json
      FROM communication_recipients r WHERE r.organization_id=? AND r.event_id=? AND r.id IN (${recipientIds.map(() => "?").join(",")}) ORDER BY r.id`,
      [tenantId, eventId, ...recipientIds],
    ).all<Row>();
    const recipients = new Map<string, CommunicationRecipient>();
    for (const row of rows(result)) {
      recipients.set(text(row.id), {
        id: text(row.id),
        ...(row.participant_id == null ? {} : { participantId: text(row.participant_id) }),
        tenantId,
        eventId,
        email: text(row.email),
        displayName: text(row.display_name),
        audiences: parseJson(text(row.audiences_json), []),
        data: parseJson(text(row.data_json), {}),
      });
    }
    const ordered: CommunicationRecipient[] = [];
    for (const recipientId of recipientIds) {
      const recipient = recipients.get(recipientId);
      if (recipient !== undefined) ordered.push(recipient);
    }
    return ordered;
  }

  async getPreview(tenantId: string, eventId: string, previewId: string) {
    const root = await statement(
      this.database,
      "SELECT * FROM communication_previews WHERE organization_id=? AND event_id=? AND id=? LIMIT 1",
      [tenantId, eventId, previewId],
    ).first<Row>();
    if (root === null) return undefined;
    const [template, previewAudit] = await Promise.all([
      this.getTemplate(tenantId, eventId, text(root.template_id), number(root.template_version)),
      statement(
        this.database,
        "SELECT details_json FROM audit_events WHERE tenant_id=? AND resource_type='communication_preview' AND resource_id=? ORDER BY occurred_at DESC,id DESC LIMIT 1",
        [tenantId, previewId],
      ).first<Row>(),
    ]);
    if (template === undefined) return undefined;
    const auditedTemplate =
      previewAudit === null
        ? undefined
        : parseJson<{ after?: { template?: CommunicationTemplateSnapshot } }>(
            text(previewAudit.details_json),
            {},
          ).after?.template;
    const result = await statement(
      this.database,
      `SELECT r.*, p.organization_id, p.event_id FROM communication_preview_recipients r JOIN communication_previews p ON p.id=r.preview_id WHERE p.organization_id=? AND p.event_id=? AND r.preview_id=? ORDER BY r.ordinal`,
      [tenantId, eventId, previewId],
    ).all<Row>();
    const recipientRows = rows(result);
    const recipients = recipientRows.map(snapshotFrom);
    const recipientPreviews: CommunicationRecipientPreview[] = recipientRows.map((row) => ({
      recipientId: text(row.recipient_id),
      email: text(row.email),
      displayName: text(row.display_name),
      subject: text(row.subject),
      html: text(row.html),
      text: text(row.text),
    }));
    return {
      id: previewId,
      tenantId,
      eventId,
      purpose: root.purpose as CommunicationPreview["purpose"],
      templateId: text(root.template_id),
      templateVersion: number(root.template_version),
      audience: root.audience as CommunicationPreview["audience"],
      data: parseJson(text(root.render_data_json), {}),
      recipientCount: number(root.recipient_count),
      recipientIds: recipients.map((r) => r.id),
      recipients,
      recipientPreviews,
      template: auditedTemplate ?? {
        id: template.id,
        name: template.name,
        purpose: template.purpose,
        version: template.version,
        sender: template.sender,
        subject: template.subject,
        html: template.html,
        text: template.text,
      },
      subject: text(root.subject),
      html: text(root.html),
      text: text(root.text),
      createdBy: text(root.created_by),
      createdAt: text(root.created_at),
      expiresAt: text(root.expires_at),
    };
  }

  async savePreview(value: CommunicationPreview) {
    const inserts = value.recipients.map((recipient, index) =>
      statement(
        this.database,
        `INSERT INTO communication_preview_recipients (preview_id,recipient_id,ordinal,participant_id,email,display_name,audiences_json,data_json,subject,html,text) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          value.id,
          recipient.id,
          index,
          recipient.participantId,
          recipient.email,
          recipient.displayName,
          json(recipient.audiences),
          json(recipient.data),
          value.recipientPreviews[index]?.subject ?? value.subject,
          value.recipientPreviews[index]?.html ?? value.html,
          value.recipientPreviews[index]?.text ?? value.text,
        ],
      ),
    );
    try {
      await batch(this.database, [
        insertGuard(
          this.database,
          "communication_previews",
          "organization_id=? AND event_id=? AND id=?",
          [value.tenantId, value.eventId, value.id],
        ),
        statement(
          this.database,
          `INSERT INTO communication_previews (id,organization_id,event_id,purpose,template_id,template_version,audience,render_data_json,recipient_count,subject,html,text,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            value.id,
            value.tenantId,
            value.eventId,
            value.purpose,
            value.templateId,
            value.templateVersion,
            value.audience,
            json(value.data),
            value.recipientCount,
            value.subject,
            value.html,
            value.text,
            value.createdBy,
            value.createdAt,
            value.expiresAt,
          ],
        ),
        ...inserts,
        ...consequentialStatements(this.database, {
          tenantId: value.tenantId,
          eventId: value.eventId,
          action: "preview.created",
          resourceType: "communication_preview",
          resourceId: value.id,
          resourceVersion: 1,
          occurredAt: value.createdAt,
          after: value,
        }),
      ]);
    } catch {
      throw conflict("The communication preview already exists.");
    }
    return value;
  }

  async findSendByIdempotency(tenantId: string, eventId: string, idempotencyKey: string) {
    const row = await statement(
      this.database,
      "SELECT id FROM communication_sends WHERE organization_id=? AND event_id=? AND idempotency_key=? LIMIT 1",
      [tenantId, eventId, idempotencyKey],
    ).first<Row>();
    return row === null ? undefined : this.getSend(tenantId, eventId, text(row.id));
  }

  async listSends(tenantId: string, eventId: string) {
    const result = await statement(
      this.database,
      "SELECT id FROM communication_sends WHERE organization_id=? AND event_id=? ORDER BY created_at DESC,id DESC",
      [tenantId, eventId],
    ).all<Row>();
    const reconstructed = await Promise.all(
      rows(result).map((row) => this.getSend(tenantId, eventId, text(row.id))),
    );
    const sends: CommunicationSend[] = [];
    for (const send of reconstructed) {
      if (send !== undefined) sends.push(send);
    }
    return sends;
  }

  async getSend(tenantId: string, eventId: string, sendId: string) {
    const root = await statement(
      this.database,
      "SELECT * FROM communication_sends WHERE organization_id=? AND event_id=? AND id=? LIMIT 1",
      [tenantId, eventId, sendId],
    ).first<Row>();
    if (root === null) return undefined;
    const [recipientResult, deliveryResult, historyResult, auditResult] = await Promise.all([
      statement(
        this.database,
        `SELECT r.*, s.organization_id,s.event_id FROM communication_send_recipients r JOIN communication_sends s ON s.id=r.send_id WHERE s.organization_id=? AND s.event_id=? AND r.send_id=? ORDER BY r.rowid`,
        [tenantId, eventId, sendId],
      ).all<Row>(),
      statement(
        this.database,
        `SELECT d.* FROM communication_deliveries d JOIN communication_sends s ON s.id=d.send_id JOIN communication_send_recipients r ON r.send_id=d.send_id AND r.recipient_id=d.recipient_id WHERE s.organization_id=? AND s.event_id=? AND d.send_id=? ORDER BY r.rowid`,
        [tenantId, eventId, sendId],
      ).all<Row>(),
      statement(
        this.database,
        `SELECT h.* FROM communication_delivery_history h JOIN communication_sends s ON s.id=h.send_id WHERE s.organization_id=? AND s.event_id=? AND h.send_id=? ORDER BY h.recipient_id,h.ordinal`,
        [tenantId, eventId, sendId],
      ).all<Row>(),
      statement(
        this.database,
        `SELECT id,tenant_id,json_extract(details_json,'$.eventId') event_id,resource_id send_id,json_extract(details_json,'$.after.recipientId') recipient_id,action,json_extract(details_json,'$.after.actorId') actor_id,occurred_at,details_json FROM audit_events WHERE tenant_id=? AND resource_type='communication_send' AND resource_id=? ORDER BY occurred_at,id`,
        [tenantId, sendId],
      ).all<Row>(),
    ]);
    const historyBy = new Map<string, CommunicationDeliveryHistoryEntry[]>();
    for (const row of rows(historyResult)) {
      const list = historyBy.get(text(row.recipient_id)) ?? [];
      list.push({
        id: text(row.id),
        status: row.status as CommunicationDeliveryHistoryEntry["status"],
        occurredAt: text(row.occurred_at),
        providerMessageId: nullable(row.provider_message_id),
        reason:
          nullable(row.reason) === null
            ? null
            : redactCommunicationProviderReason(text(row.reason)),
        actorId: text(row.actor_id),
      });
      historyBy.set(text(row.recipient_id), list);
    }
    const deliveries: CommunicationDelivery[] = rows(deliveryResult).map((row) => ({
      recipientId: text(row.recipient_id),
      email: text(
        rows(recipientResult).find((r) => r.recipient_id === row.recipient_id)?.email ?? "",
      ),
      status: row.status as CommunicationDelivery["status"],
      providerMessageId: nullable(row.provider_message_id),
      failureReason:
        nullable(row.failure_reason) === null
          ? null
          : redactCommunicationProviderReason(text(row.failure_reason)),
      attempts: number(row.attempts),
      history: historyBy.get(text(row.recipient_id)) ?? [],
    }));
    const historyById = new Map<string, CommunicationAuditEntry>();
    for (const row of rows(auditResult)) {
      const details = parseJson<{ after?: { history?: readonly CommunicationAuditEntry[] } }>(
        text(row.details_json),
        {},
      );
      for (const entry of details.after?.history ?? []) {
        if (entry.tenantId === tenantId && entry.eventId === eventId && entry.sendId === sendId) {
          historyById.set(entry.id, {
            ...entry,
            details:
              typeof entry.details.reason === "string"
                ? {
                    ...entry.details,
                    reason: redactCommunicationProviderReason(entry.details.reason),
                  }
                : { ...entry.details },
          });
        }
      }
    }
    const history = [...historyById.values()];
    return {
      id: sendId,
      tenantId,
      eventId,
      purpose: root.purpose as CommunicationSend["purpose"],
      audience: root.audience as CommunicationSend["audience"],
      templateId: text(root.template_id),
      templateVersion: number(root.template_version),
      template: templateSnapshot(root),
      idempotencyKey: text(root.idempotency_key),
      previewId: nullable(root.preview_id),
      data: parseJson(text(root.data_json), {}),
      status: root.status as CommunicationSend["status"],
      recipientCount: number(root.recipient_count),
      queuedCount: number(root.queued_count),
      deliveredCount: number(root.delivered_count),
      failedCount: number(root.failed_count),
      terminal: number(root.terminal) === 1,
      recipients: rows(recipientResult).map(snapshotFrom),
      deliveries,
      history,
      createdBy: text(root.created_by),
      createdAt: text(root.created_at),
      updatedAt: text(root.updated_at),
    };
  }

  async saveSend(value: CommunicationSend) {
    const existing = await statement(
      this.database,
      "SELECT updated_at FROM communication_sends WHERE organization_id=? AND event_id=? AND id=? LIMIT 1",
      [value.tenantId, value.eventId, value.id],
    ).first<Row>();
    const root =
      existing === null
        ? statement(
            this.database,
            `INSERT INTO communication_sends (id,organization_id,event_id,purpose,audience,template_id,template_version,idempotency_key,preview_id,data_json,status,recipient_count,queued_count,delivered_count,failed_count,terminal,template_name,template_purpose,template_sender,template_subject,template_html,template_text,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              value.id,
              value.tenantId,
              value.eventId,
              value.purpose,
              value.audience,
              value.templateId,
              value.templateVersion,
              value.idempotencyKey,
              value.previewId,
              json(value.data),
              value.status,
              value.recipientCount,
              value.queuedCount,
              value.deliveredCount,
              value.failedCount,
              value.terminal ? 1 : 0,
              value.template.name,
              value.template.purpose,
              value.template.sender,
              value.template.subject,
              value.template.html,
              value.template.text,
              value.createdBy,
              value.createdAt,
              value.updatedAt,
            ],
          )
        : statement(
            this.database,
            `UPDATE communication_sends SET status=?,queued_count=?,delivered_count=?,failed_count=?,terminal=?,updated_at=? WHERE organization_id=? AND event_id=? AND id=? AND updated_at=?`,
            [
              value.status,
              value.queuedCount,
              value.deliveredCount,
              value.failedCount,
              value.terminal ? 1 : 0,
              value.updatedAt,
              value.tenantId,
              value.eventId,
              value.id,
              text(existing.updated_at),
            ],
          );
    const statements: D1PreparedStatement[] = [
      existing === null
        ? insertGuard(
            this.database,
            "communication_sends",
            "organization_id=? AND event_id=? AND (id=? OR idempotency_key=?)",
            [value.tenantId, value.eventId, value.id, value.idempotencyKey],
          )
        : guard(
            this.database,
            "EXISTS (SELECT 1 FROM communication_sends WHERE organization_id=? AND event_id=? AND id=? AND updated_at=?)",
            [value.tenantId, value.eventId, value.id, text(existing.updated_at)],
          ),
      root,
    ];
    if (existing === null) {
      for (const r of value.recipients)
        statements.push(
          statement(
            this.database,
            "INSERT INTO communication_send_recipients (send_id,recipient_id,participant_id,email,display_name,audiences_json,data_json) VALUES (?,?,?,?,?,?,?)",
            [
              value.id,
              r.id,
              r.participantId,
              r.email,
              r.displayName,
              json(r.audiences),
              json(r.data),
            ],
          ),
        );
    }
    for (const d of value.deliveries) {
      statements.push(
        statement(
          this.database,
          `INSERT INTO communication_deliveries (send_id,recipient_id,status,provider_message_id,failure_reason,attempts) VALUES (?,?,?,?,?,?) ON CONFLICT(send_id,recipient_id) DO UPDATE SET status=excluded.status,provider_message_id=excluded.provider_message_id,failure_reason=excluded.failure_reason,attempts=excluded.attempts`,
          [value.id, d.recipientId, d.status, d.providerMessageId, d.failureReason, d.attempts],
        ),
      );
      for (const [ordinal, h] of d.history.entries())
        statements.push(
          statement(
            this.database,
            "INSERT INTO communication_delivery_history (send_id,recipient_id,ordinal,id,status,occurred_at,provider_message_id,reason,actor_id) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
            [
              value.id,
              d.recipientId,
              ordinal,
              h.id,
              h.status,
              h.occurredAt,
              h.providerMessageId,
              h.reason,
              h.actorId,
            ],
          ),
        );
    }
    statements.push(
      ...consequentialStatements(this.database, {
        tenantId: value.tenantId,
        eventId: value.eventId,
        action: existing === null ? "send.created" : "send.updated",
        resourceType: "communication_send",
        resourceId: value.id,
        resourceVersion: value.deliveries.reduce((n, d) => n + d.history.length, 1),
        occurredAt: value.updatedAt,
        after: value,
        sync: { entityType: "communication_send", applicationId: value.id, payload: value },
      }),
    );
    try {
      await batch(this.database, statements);
    } catch {
      throw conflict("The communication send changed or its idempotency key was already used.");
    }
    return value;
  }
}
