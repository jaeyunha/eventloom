import {
  COMMUNICATION_OPERATION_MARKER,
  CommunicationError,
  type CommunicationService,
  type CreateCommunicationTemplateInput,
} from "../communications/service";
import {
  speakerCommunicationActor,
  speakerPreviewDto,
  speakerSendDto,
  speakerTemplateDto,
} from "./communications-mapping";
import type { SpeakerCommunications } from "./communications-types";
import { speakerEmailHtmlFromText } from "./email-body";
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
    return this.createTemplateWithHtml(input, speakerEmailHtmlFromText(input.text));
  }

  async createTemplateVersion(
    input: Parameters<SpeakerCommunications["createTemplateVersion"]>[0],
  ) {
    return this.createTemplateVersionWithHtml(input, speakerEmailHtmlFromText(input.text));
  }

  private async createTemplateWithHtml(
    input: Parameters<SpeakerCommunications["createTemplate"]>[0],
    html: string,
  ): Promise<SpeakerEmailTemplate> {
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
      html,
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

  private async createTemplateVersionWithHtml(
    input: Parameters<SpeakerCommunications["createTemplateVersion"]>[0],
    html: string,
  ): Promise<SpeakerEmailTemplate> {
    const communicationActor = speakerCommunicationActor(
      input.organizationId,
      input.eventId,
      input.accountId,
    );
    let template = await this.communications.createTemplateVersion(communicationActor, {
      eventId: input.eventId,
      templateId: input.templateId,
      subject: input.subject,
      html,
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

  private async canonicalPreviewTemplate(
    input: Parameters<SpeakerCommunications["preview"]>[0],
  ): Promise<SpeakerEmailTemplate> {
    const actor = speakerCommunicationActor(input.organizationId, input.eventId, input.accountId);
    const template = await this.communications.getTemplate(
      actor,
      input.eventId,
      input.templateId,
      input.templateVersion,
    );
    const scopedWelcomeId = await scopedWelcomeTemplateId(input.organizationId, input.eventId);
    const isTrustedWelcomeTemplate =
      (template.id === SPEAKER_WELCOME_TEMPLATE_ID || template.id === scopedWelcomeId) &&
      template.subject === welcome.subject &&
      template.html === welcome.html &&
      template.text === welcome.text;
    const canonicalHtml = speakerEmailHtmlFromText(template.text);
    if (
      isTrustedWelcomeTemplate ||
      template.status !== "approved" ||
      template.html === canonicalHtml
    ) {
      return speakerTemplateDto(template);
    }
    const existingCanonical = await this.findCanonicalTemplate(
      actor,
      input.eventId,
      template.id,
      template.subject,
      template.text,
      canonicalHtml,
    );
    if (existingCanonical !== undefined) return existingCanonical;
    try {
      return await this.createTemplateVersion({
        organizationId: input.organizationId,
        eventId: input.eventId,
        accountId: input.accountId,
        templateId: template.id,
        subject: template.subject,
        text: template.text,
        status: "approved",
      });
    } catch (error) {
      if (!(error instanceof CommunicationError) || error.status !== 409) throw error;
      const recovered = await this.findCanonicalTemplate(
        actor,
        input.eventId,
        template.id,
        template.subject,
        template.text,
        canonicalHtml,
        true,
      );
      if (recovered?.status === "draft") {
        try {
          return speakerTemplateDto(
            await this.communications.approveTemplate(
              actor,
              input.eventId,
              recovered.id,
              recovered.version,
            ),
          );
        } catch (approvalError) {
          if (!(approvalError instanceof CommunicationError) || approvalError.status !== 409) {
            throw approvalError;
          }
          const approved = await this.findCanonicalTemplate(
            actor,
            input.eventId,
            template.id,
            template.subject,
            template.text,
            canonicalHtml,
          );
          if (approved !== undefined) return approved;
          throw approvalError;
        }
      }
      if (recovered !== undefined) return recovered;
      throw error;
    }
  }

  private async findCanonicalTemplate(
    actor: ReturnType<typeof speakerCommunicationActor>,
    eventId: string,
    templateId: string,
    subject: string,
    text: string,
    html: string,
    includeDraft = false,
  ): Promise<SpeakerEmailTemplate | undefined> {
    return (await this.communications.listTemplates(actor, eventId, "organizer_group_email"))
      .filter(
        (candidate) =>
          candidate.id === templateId &&
          (candidate.status === "approved" || (includeDraft && candidate.status === "draft")) &&
          candidate.subject === subject &&
          candidate.text === text &&
          candidate.html === html,
      )
      .reduce<SpeakerEmailTemplate | undefined>(
        (latest, candidate) =>
          latest === undefined || candidate.version > latest.version
            ? speakerTemplateDto(candidate)
            : latest,
        undefined,
      );
  }

  async preview(input: Parameters<SpeakerCommunications["preview"]>[0]) {
    return this.previewWithWorkflowMarker(input, false);
  }

  private async previewWithWorkflowMarker(
    input: Parameters<SpeakerCommunications["preview"]>[0],
    invitationWorkflow: boolean,
  ) {
    const template = await this.canonicalPreviewTemplate(input);
    const { [COMMUNICATION_OPERATION_MARKER]: _ignored, ...callerData } = input.data ?? {};
    const data = { ...callerData, portal_url: this.workHubUrl() };
    return speakerPreviewDto(
      await this.communications.previewGroupSend(
        speakerCommunicationActor(input.organizationId, input.eventId, input.accountId),
        {
          eventId: input.eventId,
          purpose: "organizer_group_email",
          audience: "all_participants",
          templateId: template.id,
          templateVersion: template.version,
          recipientIds: input.participantIds,
          data,
          protectedRecipientDataKeys: ["portal_url"],
          operation: invitationWorkflow ? "speaker_invitation" : "generic",
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
    const preview = await this.previewWithWorkflowMarker(
      {
        ...input,
        templateId: template.id,
        templateVersion: template.version,
        data: { portal_url: this.workHubUrl() },
      },
      true,
    );
    return preview.recipients.map((recipient) => ({
      participantId: recipient.participantId,
      recipientEmail: recipient.email,
      state: "ready" as const,
    }));
  }

  async findInvitationReplay(input: Parameters<SpeakerCommunications["findInvitationReplay"]>[0]) {
    const actor = speakerCommunicationActor(input.organizationId, input.eventId, input.accountId);
    const prior = (await this.communications.listSends(actor, input.eventId)).find(
      (send) => send.idempotencyKey === input.idempotencyKey,
    );
    if (prior !== undefined) {
      const trustedTemplateId = await scopedWelcomeTemplateId(input.organizationId, input.eventId);
      const trustedTemplate =
        (prior.template.id === trustedTemplateId ||
          prior.template.id === SPEAKER_WELCOME_TEMPLATE_ID) &&
        prior.template.subject === welcome.subject &&
        prior.template.html === welcome.html &&
        prior.template.text === welcome.text;
      const priorRecipients = prior.recipients
        .map((recipient) => recipient.id)
        .sort((a, b) => a.localeCompare(b));
      const requestedRecipients = [...input.participantIds].sort((a, b) => a.localeCompare(b));
      const trustedRenderData =
        prior.data.portal_url === this.workHubUrl() &&
        (prior.data[COMMUNICATION_OPERATION_MARKER] === undefined ||
          prior.data[COMMUNICATION_OPERATION_MARKER] === "speaker_invitation") &&
        prior.recipients.every((recipient) => recipient.data.portal_url === undefined);
      if (
        prior.purpose !== "organizer_group_email" ||
        prior.audience !== "all_participants" ||
        !trustedTemplate ||
        !trustedRenderData ||
        priorRecipients.length !== requestedRecipients.length ||
        priorRecipients.some((participantId, index) => participantId !== requestedRecipients[index])
      ) {
        throw new CommunicationError(
          "COMMUNICATION_CONFLICT",
          409,
          "The idempotency key was already used with a different communication payload.",
        );
      }
      const send = speakerSendDto(prior);
      const recipients = send.deliveries.map((delivery) => ({
        participantId: delivery.participantId,
        recipientEmail: delivery.email,
        status: delivery.status === "failed" ? ("failed" as const) : ("duplicate" as const),
        receiptId: delivery.providerMessageId,
      }));
      return {
        organizationId: input.organizationId,
        eventId: input.eventId,
        idempotencyKey: input.idempotencyKey,
        status: recipients.some((recipient) => recipient.status === "failed")
          ? ("failed" as const)
          : ("duplicate" as const),
        duplicate: recipients.every((recipient) => recipient.status === "duplicate"),
        recipients,
      };
    }
    return null;
  }

  async sendInvitations(input: Parameters<SpeakerCommunications["sendInvitations"]>[0]) {
    const replay = await this.findInvitationReplay(input);
    if (replay !== null) return replay;
    const template = await this.ensureWelcomeTemplate(input);
    const preview = await this.previewWithWorkflowMarker(
      {
        ...input,
        templateId: template.id,
        templateVersion: template.version,
        data: { portal_url: this.workHubUrl() },
      },
      true,
    );
    const send = await this.send({ ...input, previewId: preview.id });
    const replayed = false;
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
      ? this.createTemplateVersionWithHtml(
          {
            ...input,
            templateId,
            subject: welcome.subject,
            text: welcome.text,
            status: "approved",
          },
          welcome.html,
        )
      : this.createTemplateWithHtml(
          {
            ...input,
            templateId,
            name: welcome.name,
            subject: welcome.subject,
            text: welcome.text,
            status: "approved",
          },
          welcome.html,
        );
  }
}
