import type {
  AuditEntry,
  CfpForm,
  EventCfp,
  Submission,
  SubmissionVersion,
} from "../features/cfp/model";
import type { CfpRepository } from "../features/cfp/service";
import type { PrivateAssetCapabilityBinding, PrivateUploadGrant } from "../features/speaker/types";
import { D1CfpFileAssetGateway } from "../infrastructure/cloudflare/repositories/cfp-file-assets";
import type { SqliteD1 } from "./sqlite-d1";

class StaticCfpRepository implements CfpRepository {
  constructor(
    private readonly event: EventCfp,
    private readonly form: CfpForm,
    private readonly submission: Submission,
  ) {}

  async getEvent(tenantId: string, eventId: string) {
    return tenantId === this.event.tenantId && eventId === this.event.id ? this.event : null;
  }
  async getEventBySlug(tenantId: string, eventSlug: string) {
    return tenantId === this.event.tenantId && eventSlug === this.event.slug ? this.event : null;
  }
  async saveEvent(_event: EventCfp, _expectedVersion: number | null): Promise<void> {}
  async getForm(tenantId: string, formId: string) {
    return tenantId === this.form.tenantId && formId === this.form.id ? this.form : null;
  }
  async listForms(tenantId: string, eventId: string) {
    return tenantId === this.form.tenantId && eventId === this.form.eventId ? [this.form] : [];
  }
  async saveForm(_form: CfpForm, _expectedVersion: number | null): Promise<void> {}
  async getSubmission(tenantId: string, submissionId: string) {
    return tenantId === this.submission.tenantId && submissionId === this.submission.id
      ? this.submission
      : null;
  }
  async countOwnedSubmissions(): Promise<number> {
    return 1;
  }
  async saveSubmissionVersion(
    _version: SubmissionVersion,
    _expectedVersion: number | null,
    _audit?: AuditEntry,
  ): Promise<void> {}
}

export class RecordingPrivateAssets {
  readonly registered: PrivateAssetCapabilityBinding[] = [];
  readonly verifiedBindings: PrivateAssetCapabilityBinding[] = [];
  readonly invalidated: PrivateAssetCapabilityBinding[] = [];
  verified = false;

  async registerUploadCapability(
    binding: PrivateAssetCapabilityBinding,
  ): Promise<PrivateUploadGrant> {
    this.registered.push(binding);
    return {
      method: "PUT",
      url: `/upload/${binding.capabilityId}`,
      headers: {},
      expiresAt: binding.expiresAt,
    };
  }

  async verifyUploadCapability(binding: PrivateAssetCapabilityBinding): Promise<boolean> {
    this.verifiedBindings.push(binding);
    return this.verified;
  }

  async invalidateUploadCapability(binding: PrivateAssetCapabilityBinding): Promise<void> {
    this.invalidated.push(binding);
  }
}

export function createCfpAssetFixture(database: SqliteD1) {
  const event: EventCfp = {
    id: "event-file",
    tenantId: "tenant-file",
    version: 1,
    slug: "event-file",
    name: "File CFP",
    timezone: "UTC",
    opensAt: "2026-08-01T00:00:00.000Z",
    closesAt: "2026-09-01T00:00:00.000Z",
  };
  const form: CfpForm = {
    id: "form-file",
    tenantId: event.tenantId,
    eventId: event.id,
    name: "File CFP",
    version: 1,
    status: "published",
    welcomeContent: "",
    settings: {
      speakerLimit: 2,
      maxSubmissionsPerAccount: 2,
      remindersEnabled: false,
      adminNotificationsEnabled: false,
      confirmationMessage: "",
      successContent: "",
    },
    sections: [{ id: "section", title: "Talk", description: "" }],
    submissionFields: [
      {
        id: "slides",
        sectionId: "section",
        key: "slides",
        label: "Slides",
        kind: "file_request",
        required: false,
        options: [],
        fileRequest: {
          allowedMimeTypes: ["application/pdf"],
          maxBytes: 1024,
          required: false,
          owner: "submission",
        },
      },
    ],
    participantFields: [],
    rules: [],
  };
  const submission: Submission = {
    id: "submission-file",
    tenantId: event.tenantId,
    eventId: event.id,
    formId: form.id,
    ownerAccountId: "owner-file",
    formVersion: 1,
    version: 1,
    status: "draft",
    completedSteps: ["welcome"],
    answers: {},
    participants: [],
    secondaryContacts: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  };
  const privateAssets = new RecordingPrivateAssets();
  const gateway = new D1CfpFileAssetGateway({
    database,
    cfp: new StaticCfpRepository(event, form, submission),
    privateAssets,
    now: () => new Date("2026-08-08T12:00:00.000Z"),
  });
  return { database, event, form, gateway, privateAssets, submission };
}
