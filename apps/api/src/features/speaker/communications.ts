import type {
  CommunicationService,
  CreateCommunicationTemplateInput,
} from "../communications/service";
import {
  speakerCommunicationActor,
  speakerPreviewDto,
  speakerSendDto,
  speakerTemplateDto,
} from "./communications-mapping";
import type { SpeakerCommunications } from "./communications-types";
import type { SpeakerEmailTemplate } from "./service";

export type { SpeakerCommunications } from "./communications-types";
export const SPEAKER_WELCOME_TEMPLATE_ID = "speaker-approved-welcome";
const encoder = new TextEncoder();
const welcome = {
  name: "Speaker invitation",
  subject: "Review your speaker invitation",
  html: '<p>Hello {{first_name}},</p><p><a href="{{portal_url}}">Sign in to the work hub</a> to review and accept your speaker invitation.</p>',
  text: "Hello {{first_name}},\n\nSign in to the work hub to review and accept your speaker invitation: {{portal_url}}",
} as const;

async function scopedWelcomeTemplateId(organizationId: string, eventId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(`${organizationId}\u0000${eventId}`)),
  );
  const suffix = [...digest.subarray(0, 12)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${SPEAKER_WELCOME_TEMPLATE_ID}:${suffix}`;
}

export class CommunicationSpeakerCommunications implements SpeakerCommunications {
  constructor(
    private readonly communications: CommunicationService,
    private readonly webOrigin: string,
  ) {}

  async listTemplates(organizationId: string, eventId: string, accountId: string) {
    return (
      await this.communications.listTemplates(
        speakerCommunicationActor(organizationId, eventId, accountId),
        eventId,
        "organizer_group_email",
      )
    ).map(speakerTemplateDto);
  }

  async createTemplate(input: Parameters<SpeakerCommunications["createTemplate"]>[0]) {
    const communicationActor = speakerCommunicationActor(
      input.organizationId,
      input.eventId,
      input.accountId,
    );
    const create: CreateCommunicationTemplateInput = {
      eventId: input.eventId,
      ...(input.templateId === undefined ? {} : { id: input.templateId }),
      name: input.name,
      purpose: "organizer_group_email",
      subject: input.subject,
      html: input.html,
      text: input.text,
    };
    let template = await this.communications.createTemplate(communicationActor, create);
    if (input.status === "approved") {
      template = await this.communications.approveTemplate(
        communicationActor,
        input.eventId,
        template.id,
        template.version,
      );
    }
    return speakerTemplateDto(template);
  }

  async createTemplateVersion(
    input: Parameters<SpeakerCommunications["createTemplateVersion"]>[0],
  ) {
    const communicationActor = speakerCommunicationActor(
      input.organizationId,
      input.eventId,
      input.accountId,
    );
    let template = await this.communications.createTemplateVersion(communicationActor, {
      eventId: input.eventId,
      templateId: input.templateId,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (input.status === "approved") {
      template = await this.communications.approveTemplate(
        communicationActor,
        input.eventId,
        template.id,
        template.version,
      );
    }
    return speakerTemplateDto(template);
  }

  async preview(input: Parameters<SpeakerCommunications["preview"]>[0]) {
    return speakerPreviewDto(
      await this.communications.previewGroupSend(
        speakerCommunicationActor(input.organizationId, input.eventId, input.accountId),
        {
          eventId: input.eventId,
          purpose: "organizer_group_email",
          audience: "all_participants",
          templateId: input.templateId,
          ...(input.templateVersion === undefined
            ? {}
            : { templateVersion: input.templateVersion }),
          recipientIds: input.participantIds,
          data: { ...(input.data ?? {}), portal_url: this.workHubUrl() },
        },
      ),
    );
  }

  async send(input: Parameters<SpeakerCommunications["send"]>[0]) {
    return speakerSendDto(
      await this.communications.sendGroup(
        speakerCommunicationActor(input.organizationId, input.eventId, input.accountId),
        {
          eventId: input.eventId,
          previewId: input.previewId,
          idempotencyKey: input.idempotencyKey,
        },
      ),
    );
  }

  async listHistory(organizationId: string, eventId: string, accountId: string) {
    return (
      await this.communications.listSends(
        speakerCommunicationActor(organizationId, eventId, accountId),
        eventId,
      )
    )
      .filter((send) => send.purpose === "organizer_group_email")
      .map(speakerSendDto);
  }

  async previewInvitations(input: Parameters<SpeakerCommunications["previewInvitations"]>[0]) {
    const template = await this.ensureWelcomeTemplate(input);
    const preview = await this.preview({
      ...input,
      templateId: template.id,
      templateVersion: template.version,
      data: { portal_url: this.workHubUrl() },
    });
    return preview.recipients.map((recipient) => ({
      participantId: recipient.participantId,
      recipientEmail: recipient.email,
      state: "ready" as const,
    }));
  }

  async sendInvitations(input: Parameters<SpeakerCommunications["sendInvitations"]>[0]) {
    const prior = (
      await this.listHistory(input.organizationId, input.eventId, input.accountId)
    ).find((send) => send.idempotencyKey === input.idempotencyKey);
    const template = await this.ensureWelcomeTemplate(input);
    const preview = await this.preview({
      ...input,
      templateId: template.id,
      templateVersion: template.version,
      data: { portal_url: this.workHubUrl() },
    });
    const send = await this.send({ ...input, previewId: preview.id });
    const replayed = prior !== undefined;
    const recipients = send.deliveries.map((delivery) => ({
      participantId: delivery.participantId,
      recipientEmail: delivery.email,
      status:
        replayed && delivery.status !== "failed"
          ? ("duplicate" as const)
          : delivery.status === "sent"
            ? ("sent" as const)
            : delivery.status,
      receiptId: delivery.providerMessageId,
    }));
    return {
      organizationId: input.organizationId,
      eventId: input.eventId,
      idempotencyKey: input.idempotencyKey,
      status: recipients.some((recipient) => recipient.status === "failed")
        ? ("failed" as const)
        : replayed
          ? ("duplicate" as const)
          : recipients.every((recipient) => recipient.status === "sent")
            ? ("sent" as const)
            : ("queued" as const),
      duplicate: replayed && recipients.every((recipient) => recipient.status === "duplicate"),
      recipients,
    };
  }

  private workHubUrl(): string {
    return `${new URL("/login", this.webOrigin).toString()}?next=/work`;
  }

  private async ensureWelcomeTemplate(input: {
    organizationId: string;
    eventId: string;
    accountId: string;
  }): Promise<SpeakerEmailTemplate> {
    const templateId = await scopedWelcomeTemplateId(input.organizationId, input.eventId);
    const templates = await this.listTemplates(
      input.organizationId,
      input.eventId,
      input.accountId,
    );
    const exact = templates
      .filter(
        (template) =>
          (template.id === templateId || template.id === SPEAKER_WELCOME_TEMPLATE_ID) &&
          template.status === "approved" &&
          template.subject === welcome.subject &&
          template.html === welcome.html &&
          template.text === welcome.text,
      )
      .sort((left, right) => right.version - left.version)[0];
    if (exact !== undefined) return exact;
    const exists = templates.some((template) => template.id === templateId);
    return exists
      ? this.createTemplateVersion({
          ...input,
          templateId,
          subject: welcome.subject,
          html: welcome.html,
          text: welcome.text,
          status: "approved",
        })
      : this.createTemplate({
          ...input,
          templateId,
          name: welcome.name,
          subject: welcome.subject,
          html: welcome.html,
          text: welcome.text,
          status: "approved",
        });
  }
}
