import type {
  CommunicationActor,
  CommunicationDelivery,
  CommunicationPreview,
  CommunicationSend,
  CommunicationTemplate,
} from "../communications/types";
import type { SpeakerEmailPreview, SpeakerEmailSend, SpeakerEmailTemplate } from "./service";

export function speakerCommunicationActor(
  organizationId: string,
  eventId: string,
  accountId: string,
): CommunicationActor {
  return {
    tenantId: organizationId,
    userId: accountId,
    kind: "human",
    grants: [{ eventId, role: "organizer" }],
  };
}

export function speakerTemplateDto(template: CommunicationTemplate): SpeakerEmailTemplate {
  return {
    id: template.id,
    organizationId: template.tenantId,
    eventId: template.eventId,
    name: template.name,
    version: template.version,
    status: template.status,
    sender: template.sender,
    subject: template.subject,
    html: template.html,
    text: template.text,
    variables: [...template.variables],
    createdBy: template.createdBy,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export function speakerPreviewDto(preview: CommunicationPreview): SpeakerEmailPreview {
  const rendered = new Map(preview.recipientPreviews.map((item) => [item.recipientId, item]));
  const recipients = preview.recipients.map((recipient) => {
    const value = rendered.get(recipient.id);
    return {
      participantId: recipient.participantId,
      displayName: recipient.displayName,
      firstName:
        typeof recipient.data.first_name === "string"
          ? recipient.data.first_name
          : (recipient.displayName.split(/\s+/u)[0] ?? recipient.displayName),
      email: recipient.email,
      subject: value?.subject ?? preview.subject,
      html: value?.html ?? preview.html,
      text: value?.text ?? preview.text,
    };
  });
  return {
    id: preview.id,
    organizationId: preview.tenantId,
    eventId: preview.eventId,
    templateId: preview.templateId,
    templateVersion: preview.templateVersion,
    sender: preview.template.sender,
    recipientIds: preview.recipientIds,
    recipients,
    subject: preview.subject,
    html: preview.html,
    text: preview.text,
    createdAt: preview.createdAt,
    expiresAt: preview.expiresAt,
  };
}

function deliveryStatus(delivery: CommunicationDelivery): "queued" | "sent" | "failed" {
  return delivery.status === "delivered"
    ? "sent"
    : delivery.status === "queued"
      ? "queued"
      : "failed";
}

export function speakerSendDto(send: CommunicationSend): SpeakerEmailSend {
  const history: SpeakerEmailSend["history"][number][] = send.history.map((entry) => ({
    occurredAt: entry.occurredAt,
    action:
      entry.action === "send_created"
        ? "send_created"
        : entry.action === "delivery_delivered"
          ? "delivery_sent"
          : entry.action === "delivery_queued"
            ? "delivery_queued"
            : "delivery_failed",
    participantId: entry.recipientId,
    details: {
      status: entry.action,
      providerMessageId:
        typeof entry.details.providerMessageId === "string"
          ? entry.details.providerMessageId
          : null,
    },
  }));
  for (const delivery of send.deliveries) {
    for (const entry of delivery.history) {
      history.push({
        occurredAt: entry.occurredAt,
        action:
          entry.status === "delivered"
            ? "delivery_sent"
            : entry.status === "queued"
              ? "delivery_queued"
              : "delivery_failed",
        participantId: delivery.recipientId,
        details: {
          status: entry.status,
          providerMessageId: entry.providerMessageId,
          reason: entry.reason,
        },
      });
    }
  }
  return {
    id: send.id,
    organizationId: send.tenantId,
    eventId: send.eventId,
    templateId: send.templateId,
    templateVersion: send.templateVersion,
    sender: send.template.sender,
    idempotencyKey: send.idempotencyKey,
    status:
      send.status === "delivered" ? "sent" : send.status === "partial" ? "partial" : send.status,
    recipientIds: send.recipients.map((recipient) => recipient.participantId),
    deliveries: send.deliveries.map((delivery) => ({
      participantId: delivery.recipientId,
      email: delivery.email,
      status: deliveryStatus(delivery),
      providerMessageId: delivery.providerMessageId,
      reason: delivery.failureReason,
    })),
    history: history.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    createdAt: send.createdAt,
    updatedAt: send.updatedAt,
  };
}
