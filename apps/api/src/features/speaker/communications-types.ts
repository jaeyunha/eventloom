import type { SpeakerEmailPreview, SpeakerEmailSend, SpeakerEmailTemplate } from "./service";
import type { SpeakerInvitationPreview, SpeakerInvitationResult } from "./types";

export interface SpeakerCommunications {
  listTemplates(
    organizationId: string,
    eventId: string,
    accountId: string,
  ): Promise<readonly SpeakerEmailTemplate[]>;
  createTemplate(input: {
    organizationId: string;
    eventId: string;
    accountId: string;
    templateId?: string;
    name: string;
    subject: string;
    /** Legacy compatibility only; speaker HTML is generated from text. */
    html?: string;
    text: string;
    status: "draft" | "approved";
  }): Promise<SpeakerEmailTemplate>;
  createTemplateVersion(input: {
    organizationId: string;
    eventId: string;
    accountId: string;
    templateId: string;
    subject: string;
    /** Legacy compatibility only; speaker HTML is generated from text. */
    html?: string;
    text: string;
    status: "draft" | "approved";
  }): Promise<SpeakerEmailTemplate>;
  preview(input: {
    organizationId: string;
    eventId: string;
    accountId: string;
    participantIds: readonly string[];
    templateId: string;
    templateVersion?: number;
    data?: Readonly<Record<string, unknown>>;
  }): Promise<SpeakerEmailPreview>;
  send(input: {
    organizationId: string;
    eventId: string;
    accountId: string;
    previewId: string;
    idempotencyKey: string;
  }): Promise<SpeakerEmailSend>;
  listHistory(
    organizationId: string,
    eventId: string,
    accountId: string,
  ): Promise<readonly SpeakerEmailSend[]>;
  previewInvitations(input: {
    organizationId: string;
    eventId: string;
    accountId: string;
    participantIds: readonly string[];
  }): Promise<readonly SpeakerInvitationPreview[]>;
  findInvitationReplay(input: {
    organizationId: string;
    eventId: string;
    accountId: string;
    participantIds: readonly string[];
    idempotencyKey: string;
  }): Promise<SpeakerInvitationResult | null>;
  sendInvitations(input: {
    organizationId: string;
    eventId: string;
    accountId: string;
    participantIds: readonly string[];
    idempotencyKey: string;
  }): Promise<SpeakerInvitationResult>;
}
