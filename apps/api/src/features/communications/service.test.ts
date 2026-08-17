import { describe, expect, it } from "vitest";
import type { CommunicationError } from "./service";
import {
  CommunicationService,
  InMemoryCommunicationRepository,
  InMemoryReminderRepository,
} from "./service";
import type {
  CommunicationActor,
  CommunicationAudience,
  CommunicationDeliveryAdapter,
  CommunicationDeliveryRequest,
  CommunicationPreview,
  CommunicationRecipient,
  CommunicationSenderIdentity,
  CommunicationTemplate,
  CommunicationTemplatePurpose,
  ReminderCandidate,
  ReminderDispatch,
  ReminderOutboxDelivery,
  ReminderRun,
  ReminderRuntime,
} from "./types";

const tenantId = "tenant-1";
const eventId = "event-1";
const now = "2026-08-09T12:00:00.000Z";

const organizer: CommunicationActor = {
  tenantId,
  userId: "organizer-1",
  kind: "human",
  grants: [{ eventId, role: "organizer" }],
};

const otherTenantOrganizer: CommunicationActor = {
  tenantId: "tenant-2",
  userId: "organizer-2",
  kind: "human",
  grants: [{ eventId, role: "organizer" }],
};

const recipients: readonly CommunicationRecipient[] = [
  {
    id: "participant-1",
    tenantId,
    eventId,
    email: "one@example.test",
    displayName: "One",
    audiences: ["all_participants", "accepted_participants"],
    data: { firstName: "One" },
  },
  {
    id: "participant-2",
    tenantId,
    eventId,
    email: "two@example.test",
    displayName: "Two",
    audiences: ["all_participants"],
    data: { firstName: "Two" },
  },
];

class FakeDeliveryAdapter implements CommunicationDeliveryAdapter {
  readonly requests: CommunicationDeliveryRequest[] = [];

  async send(request: CommunicationDeliveryRequest) {
    this.requests.push(request);
    if (request.recipientId === "participant-2") {
      throw new Error("temporary provider failure");
    }
    return { status: "queued" as const, providerMessageId: `provider-${request.recipientId}` };
  }
}

async function fixture() {
  const repository = new InMemoryCommunicationRepository({
    recipients,
    authorizedAudiences: {
      [`${tenantId}:${eventId}`]: ["all_participants", "accepted_participants"],
    },
  });
  const adapter = new FakeDeliveryAdapter();
  const service = new CommunicationService(repository, adapter, {
    clock: () => new Date(now),
    senderIdentities: {
      auth: "login@conference.example",
      speakers: "program@conference.example",
      calendar: "schedule@conference.example",
    },
  });
  const template = await service.createTemplate(organizer, {
    id: "group-template",
    eventId,
    name: "Event update",
    purpose: "organizer_group_email",
    subject: "Hello {{displayName}}",
    html: "<p>{{displayName}}</p><div>{{message}}</div>",
    text: "Hello {{displayName}}: {{message}}",
    variables: ["displayName", "message"],
  });
  await service.approveTemplate(organizer, eventId, template.id, 1);
  const version = await service.createTemplateVersion(organizer, {
    templateId: template.id,
    subject: "Updated {{displayName}}",
    html: "<p>Updated {{displayName}}</p><div>{{message}}</div>",
    text: "Updated {{displayName}}: {{message}}",
    variables: ["displayName", "message"],
  });
  await service.approveTemplate(organizer, eventId, template.id, version.version);
  return { repository, adapter, service, version };
}

type PreviewFailure = "authorization" | "template" | "recipient" | undefined;

class DelayedCommunicationRepository extends InMemoryCommunicationRepository {
  readonly calls = {
    authorization: 0,
    templates: 0,
    recipients: 0,
    previewWrites: 0,
  };
  maxConcurrentReads = 0;
  #activeReads = 0;
  readonly #failure: PreviewFailure;

  constructor(failure?: PreviewFailure) {
    super({
      recipients,
      authorizedAudiences: {
        [`${tenantId}:${eventId}`]: ["all_participants"],
      },
      templates: [
        {
          id: "group-template",
          tenantId,
          eventId,
          name: "Event update",
          purpose: "organizer_group_email",
          version: 1,
          status: "approved",
          sender: "speakers@sessionboard.namuh.co",
          subject: "Hello {{displayName}}",
          html: "<p>{{displayName}}</p><div>{{message}}</div>",
          text: "Hello {{displayName}}: {{message}}",
          variables: ["displayName", "message"],
          createdBy: organizer.userId,
          createdAt: now,
          updatedAt: now,
          approvedBy: organizer.userId,
          approvedAt: now,
        } satisfies CommunicationTemplate,
      ],
    });
    this.#failure = failure;
  }

  resetCalls(): void {
    this.calls.authorization = 0;
    this.calls.templates = 0;
    this.calls.recipients = 0;
    this.calls.previewWrites = 0;
    this.maxConcurrentReads = 0;
  }

  private async delayed<T>(
    kind: "authorization" | "templates" | "recipients",
    run: () => Promise<T>,
  ): Promise<T> {
    this.calls[kind] += 1;
    this.#activeReads += 1;
    this.maxConcurrentReads = Math.max(this.maxConcurrentReads, this.#activeReads);
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return await run();
    } finally {
      this.#activeReads -= 1;
    }
  }

  override listTemplates(
    tenantId: string,
    eventId: string,
    purpose?: CommunicationTemplatePurpose,
  ): Promise<readonly CommunicationTemplate[]> {
    return this.delayed("templates", async () => {
      if (this.#failure === "template") return [];
      return super.listTemplates(tenantId, eventId, purpose);
    });
  }

  override listRecipients(
    tenantId: string,
    eventId: string,
    audience: CommunicationAudience,
  ): Promise<readonly CommunicationRecipient[]> {
    return this.delayed("recipients", async () => {
      const listed = await super.listRecipients(tenantId, eventId, audience);
      if (this.#failure !== "recipient") return listed;
      const first = listed[0] ?? recipients[0];
      if (first === undefined) return listed;
      return [{ ...first, tenantId: "other-tenant" }];
    });
  }

  override isAudienceAuthorized(
    tenantId: string,
    eventId: string,
    audience: CommunicationAudience,
  ): Promise<boolean> {
    return this.delayed("authorization", async () => {
      if (this.#failure === "authorization") return false;
      return super.isAudienceAuthorized(tenantId, eventId, audience);
    });
  }

  override async savePreview(preview: CommunicationPreview): Promise<CommunicationPreview> {
    this.calls.previewWrites += 1;
    return super.savePreview(preview);
  }
}
async function expectCode(
  promise: Promise<unknown>,
  code: CommunicationError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("communications domain", () => {
  it("maps every template purpose to runtime-configured sender identities", async () => {
    const configuredSenders = {
      auth: "login@conference.example",
      speakers: "program@conference.example",
      calendar: "schedule@conference.example",
    } as const;
    const service = new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
      senderIdentities: configuredSenders,
    });
    const purposeSenders: readonly [CommunicationTemplatePurpose, CommunicationSenderIdentity][] = [
      ["verification", configuredSenders.auth],
      ["receipt", configuredSenders.speakers],
      ["reminder", configuredSenders.speakers],
      ["decision", configuredSenders.speakers],
      ["task", configuredSenders.speakers],
      ["schedule_publish", configuredSenders.calendar],
      ["schedule_update", configuredSenders.calendar],
      ["schedule_cancel", configuredSenders.calendar],
      ["organizer_group_email", configuredSenders.speakers],
    ];

    for (const [purpose, sender] of purposeSenders) {
      const template = await service.createTemplate(organizer, {
        id: `sender-${purpose}`,
        eventId,
        name: `${purpose} template`,
        purpose,
        subject: "Subject",
        html: "<p>Body</p>",
        text: "Body",
      });
      expect(template.sender).toBe(sender);
    }

    await expectCode(
      service.createTemplate(organizer, {
        id: "sender-wrong-purpose",
        eventId,
        name: "Wrong purpose sender",
        purpose: "verification",
        sender: configuredSenders.speakers,
        subject: "Subject",
        html: "<p>Body</p>",
        text: "Body",
      }),
      "COMMUNICATION_INVALID_INPUT",
    );
  });

  it("rebinds new lineage versions to the current runtime sender without mutating history", async () => {
    const repository = new InMemoryCommunicationRepository({
      recipients,
      authorizedAudiences: {
        [`${tenantId}:${eventId}`]: ["all_participants"],
      },
    });
    const originalService = new CommunicationService(repository, undefined, {
      senderIdentities: {
        auth: "login@legacy.example",
        speakers: "program@legacy.example",
        calendar: "schedule@legacy.example",
      },
    });
    const original = await originalService.createTemplate(organizer, {
      id: "rotated-group-template",
      eventId,
      name: "Rotated group template",
      purpose: "organizer_group_email",
      subject: "Original {{displayName}}",
      html: "<p>Original {{displayName}}</p>",
      text: "Original {{displayName}}",
    });
    await originalService.approveTemplate(organizer, eventId, original.id, original.version);

    const adapter = new FakeDeliveryAdapter();
    const rotatedService = new CommunicationService(repository, adapter, {
      senderIdentities: {
        auth: "login@conference.example",
        speakers: "program@conference.example",
        calendar: "schedule@conference.example",
      },
    });
    const rotated = await rotatedService.createTemplateVersion(organizer, {
      eventId,
      templateId: original.id,
      subject: "Rotated {{displayName}}",
      html: "<p>Rotated {{displayName}}</p>",
      text: "Rotated {{displayName}}",
    });

    expect(rotated.sender).toBe("program@conference.example");
    expect(
      (await rotatedService.getTemplate(organizer, eventId, original.id, original.version)).sender,
    ).toBe("program@legacy.example");
    await expectCode(
      rotatedService.previewGroupSend(organizer, {
        eventId,
        purpose: "organizer_group_email",
        templateId: original.id,
        templateVersion: original.version,
        audience: "all_participants",
      }),
      "COMMUNICATION_INVALID_INPUT",
    );

    await rotatedService.approveTemplate(organizer, eventId, rotated.id, rotated.version);
    const preview = await rotatedService.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: rotated.id,
      templateVersion: rotated.version,
      audience: "all_participants",
    });
    expect(preview.template.sender).toBe("program@conference.example");
    const send = await rotatedService.sendGroup(organizer, {
      eventId,
      previewId: preview.id,
      idempotencyKey: "rotated-group-send",
    });
    expect(send.template.sender).toBe("program@conference.example");
    expect(adapter.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "program@conference.example",
          senderPurpose: "speakers",
        }),
      ]),
    );
  });

  it("requires runtime sender configuration before creating a template", async () => {
    const service = new CommunicationService(new InMemoryCommunicationRepository());
    await expectCode(
      service.createTemplate(organizer, {
        eventId,
        name: "Unconfigured sender",
        purpose: "verification",
        subject: "Subject",
        html: "<p>Body</p>",
        text: "Body",
      }),
      "COMMUNICATION_UNAVAILABLE",
    );
  });

  it("rejects malformed runtime sender configuration", () => {
    expect(
      () =>
        new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
          senderIdentities: {
            auth: "not-an-email",
            speakers: "program@conference.example",
            calendar: "schedule@conference.example",
          },
        }),
    ).toThrow("Communication auth sender must be a valid email address.");
  });
  it("isolates tenant/event data and keeps template versions immutable", async () => {
    const { service, version } = await fixture();
    expect(version.version).toBe(2);
    expect((await service.getTemplate(organizer, eventId, "group-template", 1)).subject).toBe(
      "Hello {{displayName}}",
    );
    await expectCode(
      service.getTemplate(otherTenantOrganizer, eventId, "group-template", 1),
      "COMMUNICATION_NOT_FOUND",
    );
    await expectCode(
      service.getTemplate(
        { ...organizer, grants: [{ eventId: "event-2", role: "organizer" }] },
        eventId,
        "group-template",
      ),
      "COMMUNICATION_FORBIDDEN",
    );
  });

  it("previews escaped data, requires preview before send, snapshots recipients and template version", async () => {
    const { service, repository, adapter, version } = await fixture();
    const preview = await service.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: "group-template",
      templateVersion: version.version,
      audience: "all_participants",
      data: { message: "<script>alert('x')</script>" },
    });
    expect(preview.recipientCount).toBe(2);
    expect(preview.template.sender).toBe("program@conference.example");
    expect(
      preview.recipientPreviews.map((recipient) => ({
        recipientId: recipient.recipientId,
        subject: recipient.subject,
      })),
    ).toEqual([
      { recipientId: "participant-1", subject: "Updated One" },
      { recipientId: "participant-2", subject: "Updated Two" },
    ]);
    expect(preview.html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(preview.html).not.toContain("<script>");
    await expectCode(
      service.sendGroup(organizer, {
        eventId,
        previewId: "missing-preview",
        idempotencyKey: "send-before-preview",
      }),
      "COMMUNICATION_NOT_FOUND",
    );

    const send = await service.sendGroup(organizer, {
      eventId,
      previewId: preview.id,
      idempotencyKey: "group-send-1",
    });
    expect(send.templateVersion).toBe(version.version);
    expect(send.template.sender).toBe("program@conference.example");
    expect(send.previewId).toBe(preview.id);
    expect(send.recipients.map((recipient) => recipient.id)).toEqual([
      "participant-1",
      "participant-2",
    ]);
    expect(adapter.requests[0]).toMatchObject({
      from: "program@conference.example",
      senderPurpose: "speakers",
      html: expect.stringContaining("&lt;script&gt;"),
    });
    const firstRecipient = recipients[0];
    if (firstRecipient === undefined) {
      throw new Error("Expected recipient fixture.");
    }
    repository.seedRecipient({
      ...firstRecipient,
      email: "changed-after-snapshot@example.test",
    });
    const persisted = await service.getSend(organizer, eventId, send.id);
    expect(persisted.recipients[0]?.email).toBe("one@example.test");
  });

  it("previews an exact recipient set in request order and protects server identity data", async () => {
    const { service } = await fixture();
    const template = await service.createTemplate(organizer, {
      id: "identity-template",
      eventId,
      name: "Identity-safe update",
      purpose: "organizer_group_email",
      subject: "{{first_name}}|{{display_name}}|{{email}}",
      html: "<p>{{first_name}}|{{display_name}}|{{email}}</p>",
      text: "{{first_name}}|{{display_name}}|{{email}}",
      variables: ["first_name", "display_name", "email"],
    });
    await service.approveTemplate(organizer, eventId, template.id, template.version);

    const preview = await service.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: template.id,
      audience: "all_participants",
      recipientIds: ["participant-2", "participant-1"],
      data: {
        first_name: "Attacker",
        display_name: "Spoofed recipient",
        email: "spoofed@example.test",
      },
    });

    expect(preview.recipientIds).toEqual(["participant-2", "participant-1"]);
    expect(preview.recipientPreviews.map((recipient) => recipient.subject)).toEqual([
      "Two|Two|two@example.test",
      "One|One|one@example.test",
    ]);
    await expectCode(
      service.previewGroupSend(organizer, {
        eventId,
        purpose: "organizer_group_email",
        templateId: template.id,
        audience: "all_participants",
        recipientIds: ["participant-1", "participant-1"],
      }),
      "COMMUNICATION_INVALID_INPUT",
    );
    await expectCode(
      service.previewGroupSend(organizer, {
        eventId,
        purpose: "organizer_group_email",
        templateId: template.id,
        audience: "accepted_participants",
        recipientIds: ["participant-2"],
      }),
      "COMMUNICATION_NOT_FOUND",
    );
  });

  it("lists event sends newest first and excludes other tenant data", async () => {
    const { service } = await fixture();
    const preview = await service.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: "group-template",
      audience: "all_participants",
      data: { message: "Listing" },
    });
    const first = await service.sendGroup(organizer, {
      eventId,
      previewId: preview.id,
      idempotencyKey: "list-first",
    });
    const second = await service.sendGroup(organizer, {
      eventId,
      previewId: preview.id,
      idempotencyKey: "list-second",
    });

    const listed = await service.listSends(organizer, eventId);
    expect(listed.map((send) => send.id)).toEqual(
      [first, second]
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
        )
        .map((send) => send.id),
    );
    expect(await service.listSends(otherTenantOrganizer, eventId)).toEqual([]);
  });

  it("redacts credentials from provider errors before persisting delivery reasons", async () => {
    const repository = new InMemoryCommunicationRepository({
      recipients: recipients.slice(0, 1),
      authorizedAudiences: { [`${tenantId}:${eventId}`]: ["all_participants"] },
    });
    const service = new CommunicationService(
      repository,
      {
        async send() {
          throw new Error(
            "provider failed: Bearer super-secret api_key=another-secret https://user:password@mail.example.test",
          );
        },
      },
      {
        clock: () => new Date(now),
        senderIdentities: {
          auth: "login@conference.example",
          speakers: "program@conference.example",
          calendar: "schedule@conference.example",
        },
      },
    );
    const template = await service.createTemplate(organizer, {
      id: "redaction-template",
      eventId,
      name: "Redaction",
      purpose: "organizer_group_email",
      subject: "Update",
      html: "<p>Update</p>",
      text: "Update",
    });
    await service.approveTemplate(organizer, eventId, template.id, template.version);
    const preview = await service.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: template.id,
      audience: "all_participants",
    });
    const send = await service.sendGroup(organizer, {
      eventId,
      previewId: preview.id,
      idempotencyKey: "redacted-provider-error",
    });
    const serialized = JSON.stringify(send);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("another-secret");
    expect(serialized).not.toContain("user:password");
    expect(send.deliveries[0]?.failureReason).toContain("[REDACTED]");
  });

  it("is idempotent and records per-recipient provider states and delivery history", async () => {
    const { service, adapter } = await fixture();
    const preview = await service.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: "group-template",
      audience: "all_participants",
      data: { message: "Operational update" },
    });
    const first = await service.sendGroup(organizer, {
      eventId,
      previewId: preview.id,
      idempotencyKey: "same-key",
    });
    const replay = await service.sendGroup(organizer, {
      eventId,
      previewId: preview.id,
      idempotencyKey: "same-key",
    });
    expect(replay.id).toBe(first.id);

    const changedRecipients = await service.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: "group-template",
      audience: "all_participants",
      recipientIds: ["participant-1"],
      data: { message: "Operational update" },
    });
    await expectCode(
      service.sendGroup(organizer, {
        eventId,
        previewId: changedRecipients.id,
        idempotencyKey: "same-key",
      }),
      "COMMUNICATION_CONFLICT",
    );

    const changedRenderData = await service.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: "group-template",
      audience: "all_participants",
      data: { message: "Changed operational update" },
    });
    await expectCode(
      service.sendGroup(organizer, {
        eventId,
        previewId: changedRenderData.id,
        idempotencyKey: "same-key",
      }),
      "COMMUNICATION_CONFLICT",
    );

    const changedTemplate = await service.createTemplateVersion(organizer, {
      eventId,
      templateId: "group-template",
      subject: "Changed {{displayName}}",
      html: "<p>{{message}}</p>",
      text: "{{message}}",
    });
    await service.approveTemplate(organizer, eventId, changedTemplate.id, changedTemplate.version);
    const changedTemplatePreview = await service.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: changedTemplate.id,
      templateVersion: changedTemplate.version,
      audience: "all_participants",
      data: { message: "Operational update" },
    });
    await expectCode(
      service.sendGroup(organizer, {
        eventId,
        previewId: changedTemplatePreview.id,
        idempotencyKey: "same-key",
      }),
      "COMMUNICATION_CONFLICT",
    );

    expect(adapter.requests).toHaveLength(2);
    expect(first.deliveries.map((delivery) => delivery.status)).toEqual(["queued", "failed"]);
    expect(first).toMatchObject({
      status: "queued",
      recipientCount: 2,
      queuedCount: 1,
      deliveredCount: 0,
      failedCount: 1,
      terminal: false,
    });
    expect(first.deliveries[1]?.failureReason).toBe("temporary provider failure");

    const delivered = await service.recordDeliveryStatus(organizer, {
      eventId,
      sendId: first.id,
      recipientId: "participant-1",
      status: "delivered",
      providerMessageId: "provider-participant-1",
    });
    const bounced = await service.recordDeliveryStatus(organizer, {
      eventId,
      sendId: first.id,
      recipientId: "participant-2",
      status: "bounced",
      reason: "Mailbox unavailable",
    });
    expect(delivered.deliveries[0]?.status).toBe("delivered");
    expect(delivered).toMatchObject({
      status: "partial",
      queuedCount: 0,
      deliveredCount: 1,
      failedCount: 1,
      terminal: true,
    });
    expect(bounced.deliveries[1]?.status).toBe("bounced");
    expect(bounced.history.some((entry) => entry.action === "delivery_bounced")).toBe(true);
    expect(bounced.deliveries[1]?.history.at(-1)?.reason).toBe("Mailbox unavailable");
    expect(bounced).toMatchObject({
      status: "partial",
      recipientCount: 2,
      queuedCount: 0,
      deliveredCount: 1,
      failedCount: 1,
      terminal: true,
    });
    const history = await service.listDeliveryHistory(organizer, eventId, first.id);
    expect(history).toMatchObject({
      recipientCount: 2,
      queuedCount: 0,
      deliveredCount: 1,
      failedCount: 1,
      terminal: true,
    });
    expect(history.deliveries[1]?.history.map((entry) => entry.status)).toEqual([
      "queued",
      "failed",
      "bounced",
    ]);
  });

  it("starts authorization, template, and recipient reads together and bounds preview calls", async () => {
    const repository = new DelayedCommunicationRepository();
    const service = new CommunicationService(repository, undefined, {
      clock: () => new Date(now),
    });
    const preview = await service.previewGroupSend(organizer, {
      eventId,
      purpose: "organizer_group_email",
      templateId: "group-template",
      audience: "all_participants",
      data: { message: "Concurrent update" },
    });

    expect(repository.calls).toEqual({
      authorization: 1,
      templates: 1,
      recipients: 1,
      previewWrites: 1,
    });
    expect(repository.maxConcurrentReads).toBeGreaterThanOrEqual(3);
    expect(preview.recipients.map((recipient) => recipient.id)).toEqual(
      recipients.map((recipient) => recipient.id),
    );
    expect(preview.recipients.map((recipient) => recipient.email)).toEqual(
      recipients.map((recipient) => recipient.email),
    );
  });

  it("never writes a preview when authorization, template, or recipient validation fails", async () => {
    for (const failure of ["authorization", "template", "recipient"] as const) {
      const repository = new DelayedCommunicationRepository(failure);
      const service = new CommunicationService(repository, undefined, {
        clock: () => new Date(now),
      });
      await expectCode(
        service.previewGroupSend(organizer, {
          eventId,
          purpose: "organizer_group_email",
          templateId: "group-template",
          audience: "all_participants",
        }),
        failure === "authorization" ? "COMMUNICATION_FORBIDDEN" : "COMMUNICATION_NOT_FOUND",
      );
      expect(repository.calls.previewWrites).toBe(0);
    }
  });
  it("denies an audience not authorized for the event", async () => {
    const { service } = await fixture();
    await expectCode(
      service.previewGroupSend(organizer, {
        eventId,
        purpose: "organizer_group_email",
        templateId: "group-template",
        audience: "task_assignees",
      }),
      "COMMUNICATION_FORBIDDEN",
    );
  });
});
const automation: CommunicationActor = {
  tenantId,
  userId: "reminder-cron",
  kind: "automation",
  grants: [{ eventId, role: "delivery" }],
};

function reminderCandidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    id: "candidate-1",
    organizationId: tenantId,
    eventId,
    recipientApplicationId: "application-1",
    normalizedEmail: "recipient@example.test",
    displayName: "Recipient",
    subject: { type: "task", taskId: "task-1" },
    eligibilityReason: "due",
    cadenceWindow: "2026-08-09T12:00:00.000Z",
    nextEligibleAt: null,
    eligible: true,
    renderedMessage: {
      from: "speakers@sessionboard.namuh.co",
      subject: "Reminder",
      html: "<p>Reminder</p>",
      text: "Reminder",
    },
    ...overrides,
  } as ReminderCandidate;
}

const recoveryIdempotencyKey =
  "reminder:tenant-1:event-1:automatic:task:task-1:application-1:2026-08-09T12:00:00.000Z";
const recoveryRunId = "reminder-run:tenant-1:event-1:automatic:2026-08-09T12:00:00.000Z";

function recoveryRun(state: "pending" | "running" = "running"): ReminderRun {
  return {
    id: recoveryRunId,
    organizationId: tenantId,
    eventId,
    triggerType: "automatic",
    audienceType: "task",
    audienceRevision: "revision-1",
    candidateCount: 1,
    eligibleCount: 0,
    queuedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    state,
    configurationFailure: null,
    actorId: automation.userId,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function recoveryDispatch(status: "candidate" | "eligible" | "failed"): ReminderDispatch {
  const eligible = status !== "candidate";
  const failed = status === "failed";
  return {
    id: `reminder-dispatch:${recoveryIdempotencyKey}`,
    runId: recoveryRunId,
    organizationId: tenantId,
    eventId,
    recipient: "application-1",
    subject: { type: "task", taskId: "task-1" },
    eligibilityReason: "due",
    cadenceWindow: "2026-08-09T12:00:00.000Z",
    idempotencyKey: recoveryIdempotencyKey,
    providerMessageId: null,
    status,
    skipMetadata: null,
    failureMetadata: failed ? { stage: "enqueue", reason: "queue unavailable" } : null,
    createdAt: now,
    updatedAt: now,
    eligibleAt: eligible ? now : null,
    skippedAt: null,
    queuedAt: null,
    providerAcceptedAt: null,
    deliveredAt: null,
    failedAt: failed ? now : null,
    bouncedAt: null,
    completedAt: failed ? now : null,
    outboxJobId: null,
  };
}

class FakeReminderOutbox implements ReminderOutboxDelivery {
  readonly requests: Parameters<ReminderOutboxDelivery["enqueue"]>[0][] = [];
  readonly queuedRequests: Parameters<ReminderOutboxDelivery["enqueue"]>[0][] = [];
  readonly requeueRequests: Parameters<ReminderOutboxDelivery["requeuePending"]>[0][] = [];
  readonly pending = new Map<string, Parameters<ReminderOutboxDelivery["enqueue"]>[0]>();
  fail = false;

  async requeuePending(input: Parameters<ReminderOutboxDelivery["requeuePending"]>[0]) {
    this.requeueRequests.push(input);
    let requeued = 0;
    for (const [dispatchId, request] of this.pending) {
      if (
        request.organizationId === input.organizationId &&
        (input.eventId === undefined || request.eventId === input.eventId)
      ) {
        this.queuedRequests.push(request);
        this.pending.delete(dispatchId);
        requeued += 1;
      }
    }
    return { requeued };
  }

  async enqueue(request: Parameters<ReminderOutboxDelivery["enqueue"]>[0]) {
    this.requests.push(request);
    if (this.fail) {
      this.pending.set(request.dispatchId, request);
      throw new Error("outbox unavailable");
    }
    this.pending.delete(request.dispatchId);
    this.queuedRequests.push(request);
    return { outboxJobId: `job-${this.requests.length}` };
  }
}

function reminderFixture(
  candidates: readonly ReminderCandidate[],
  audienceRevision = "revision-1",
  clock: () => Date = () => new Date(now),
): {
  service: CommunicationService;
  repository: InMemoryReminderRepository;
  outbox: FakeReminderOutbox;
  runtime: ReminderRuntime;
} {
  const repository = new InMemoryReminderRepository();
  const outbox = new FakeReminderOutbox();
  const runtime: ReminderRuntime = {
    repository,
    source: {
      async listCandidates() {
        return {
          audienceType: "combined",
          audienceRevision,
          candidates,
        };
      },
    },
    outbox,
  };
  return {
    service: new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
      clock,
      reminders: runtime,
    }),
    repository,
    outbox,
    runtime,
  };
}

describe("reminder domain", () => {
  it.each(["pending", "running"] as const)(
    "resumes a stuck %s run with no dispatches",
    async (state) => {
      const repository = new InMemoryReminderRepository({ runs: [recoveryRun(state)] });
      const outbox = new FakeReminderOutbox();
      const service = new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
        clock: () => new Date("2026-08-09T12:30:00.000Z"),
        reminders: {
          repository,
          source: {
            async listCandidates() {
              return {
                audienceType: "task",
                audienceRevision: "revision-1",
                candidates: [reminderCandidate()],
              };
            },
          },
          outbox,
        },
      });

      const resumed = await service.runAutomaticReminders(automation, {
        eventId,
        scheduledAt: "2026-08-09T12:30:00.000Z",
      });

      expect(resumed).toMatchObject({
        id: recoveryRunId,
        state: "completed",
        candidateCount: 1,
        eligibleCount: 1,
        queuedCount: 1,
      });
      expect(outbox.requests).toHaveLength(1);
      expect(await repository.listDispatches(tenantId, eventId, recoveryRunId)).toEqual([
        expect.objectContaining({ runId: recoveryRunId, status: "queued" }),
      ]);
    },
  );

  it.each(["candidate", "eligible", "failed"] as const)(
    "recovers an existing %s dispatch in its original run during a later hourly run",
    async (status) => {
      const candidate = reminderCandidate();
      const repository = new InMemoryReminderRepository({
        runs: [recoveryRun()],
        dispatches: [recoveryDispatch(status)],
      });
      const outbox = new FakeReminderOutbox();
      const service = new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
        clock: () => new Date("2026-08-09T13:05:00.000Z"),
        reminders: {
          repository,
          source: {
            async listCandidates() {
              return {
                audienceType: "task",
                audienceRevision: "revision-2",
                candidates: [candidate],
              };
            },
          },
          outbox,
        },
      });

      const later = await service.runAutomaticReminders(automation, {
        eventId,
        scheduledAt: "2026-08-09T13:05:00.000Z",
      });

      expect(later).toMatchObject({
        candidateCount: 0,
        eligibleCount: 0,
        queuedCount: 0,
        failedCount: 0,
        state: "completed",
      });
      expect(await repository.listDispatches(tenantId, eventId, later.id)).toEqual([]);
      const [recovered] = await repository.listDispatches(tenantId, eventId, recoveryRunId);
      expect(recovered).toMatchObject({
        runId: recoveryRunId,
        status: "queued",
        failureMetadata: null,
        failedAt: null,
        completedAt: null,
        outboxJobId: "job-1",
      });
      expect(await repository.getRun(tenantId, eventId, recoveryRunId)).toMatchObject({
        candidateCount: 1,
        eligibleCount: 1,
        queuedCount: 1,
        failedCount: 0,
        state: "completed",
      });
      expect(outbox.requests).toHaveLength(1);
    },
  );

  it("does not reopen a terminal provider failure during a later hourly run", async () => {
    const terminal = {
      ...recoveryDispatch("failed"),
      failureMetadata: { reason: "REQUEST_REJECTED" },
      outboxJobId: "job-terminal",
    };
    const repository = new InMemoryReminderRepository({
      runs: [recoveryRun()],
      dispatches: [terminal],
    });
    const outbox = new FakeReminderOutbox();
    const service = new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
      clock: () => new Date("2026-08-09T13:05:00.000Z"),
      reminders: {
        repository,
        source: {
          async listCandidates() {
            return {
              audienceType: "task",
              audienceRevision: "revision-2",
              candidates: [reminderCandidate()],
            };
          },
        },
        outbox,
      },
    });

    await service.runAutomaticReminders(automation, {
      eventId,
      scheduledAt: "2026-08-09T13:05:00.000Z",
    });

    expect(await repository.getDispatch(tenantId, eventId, terminal.id)).toMatchObject({
      status: "failed",
      failureMetadata: { reason: "REQUEST_REJECTED" },
      outboxJobId: "job-terminal",
    });
    expect(outbox.requests).toHaveLength(0);
  });

  it("tags enqueue-origin failures for later recovery", async () => {
    const { service, repository, outbox } = reminderFixture([reminderCandidate()]);
    outbox.fail = true;

    await service.runAutomaticReminders(automation, { eventId, scheduledAt: now });

    const [dispatch] = await repository.listDispatches(tenantId, eventId);
    expect(dispatch).toMatchObject({
      status: "failed",
      failureMetadata: { stage: "enqueue", reason: "outbox unavailable" },
    });
  });

  it("sweeps a pending prior-day outbox row while allowing the new cadence dispatch", async () => {
    let candidates = [reminderCandidate()];
    const repository = new InMemoryReminderRepository();
    const outbox = new FakeReminderOutbox();
    const service = new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
      clock: () => new Date("2026-08-10T00:05:00.000Z"),
      reminders: {
        repository,
        source: {
          async listCandidates() {
            return {
              audienceType: "task",
              audienceRevision: "revision-midnight",
              candidates,
            };
          },
        },
        outbox,
      },
    });
    outbox.fail = true;
    const originalRun = await service.runAutomaticReminders(automation, {
      eventId,
      scheduledAt: "2026-08-09T23:05:00.000Z",
    });
    const [originalDispatch] = await repository.listDispatches(tenantId, eventId, originalRun.id);
    if (originalDispatch === undefined) throw new Error("Expected the original dispatch.");
    expect(originalDispatch).toMatchObject({
      runId: originalRun.id,
      status: "failed",
      failureMetadata: { stage: "enqueue" },
    });

    outbox.fail = false;
    candidates = [
      reminderCandidate({
        cadenceWindow: "2026-08-10T00:00:00.000Z",
        nextEligibleAt: "2026-08-11T00:00:00.000Z",
      }),
    ];
    const newDayRun = await service.runAutomaticReminders(automation, {
      eventId,
      scheduledAt: "2026-08-10T00:05:00.000Z",
    });
    const [newDayDispatch] = await repository.listDispatches(tenantId, eventId, newDayRun.id);
    if (newDayDispatch === undefined) throw new Error("Expected the new-day dispatch.");

    expect(originalDispatch.runId).toBe(originalRun.id);
    expect(newDayDispatch).toMatchObject({ runId: newDayRun.id, status: "queued" });
    expect(
      outbox.queuedRequests.filter((request) => request.dispatchId === originalDispatch.id),
    ).toHaveLength(1);
    expect(
      outbox.queuedRequests.filter((request) => request.dispatchId === newDayDispatch.id),
    ).toHaveLength(1);
    expect(outbox.requeueRequests).toEqual(
      expect.arrayContaining([{ organizationId: tenantId, eventId }]),
    );

    const recovered = await service.recordReminderDispatchStatus(automation, {
      eventId,
      runId: originalRun.id,
      dispatchId: originalDispatch.id,
      status: "provider_accepted",
      providerMessageId: "provider-original",
    });
    expect(recovered).toMatchObject({
      runId: originalRun.id,
      status: "provider_accepted",
      providerMessageId: "provider-original",
    });
  });

  it("uses one hourly automatic run and one cadence dispatch across later Cron runs", async () => {
    const candidate = reminderCandidate();
    const { service, repository, outbox } = reminderFixture([candidate]);
    const first = await service.runAutomaticReminders(automation, {
      eventId,
      scheduledAt: "2026-08-09T12:05:00.000Z",
    });
    const replay = await service.runAutomaticReminders(automation, {
      eventId,
      scheduledAt: "2026-08-09T12:55:00.000Z",
    });
    const later = await service.runAutomaticReminders(automation, {
      eventId,
      scheduledAt: "2026-08-09T13:05:00.000Z",
    });
    expect(replay).toEqual(first);
    expect(later.id).not.toBe(first.id);
    expect(first).toMatchObject({
      candidateCount: 1,
      eligibleCount: 1,
      queuedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    expect(later).toMatchObject({
      candidateCount: 0,
      eligibleCount: 0,
      queuedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    });
    expect(outbox.requests).toHaveLength(1);
    expect(await repository.listDispatches(tenantId, eventId)).toHaveLength(1);
    expect(await repository.listDispatches(tenantId, eventId, later.id)).toHaveLength(0);
  });

  it("persists missing-email skips and keeps queue success queued", async () => {
    const missing = reminderCandidate({ normalizedEmail: null });
    const queued = reminderCandidate({
      id: "candidate-2",
      recipientApplicationId: "application-2",
      subject: { type: "review", reviewAssignmentId: "assignment-1" },
    });
    const { service, repository } = reminderFixture([missing, queued]);
    const run = await service.runManualReminders(organizer, {
      eventId,
      idempotencyKey: "manual-1",
      expectedAudienceRevision: "revision-1",
    });
    const dispatches = await repository.listDispatches(tenantId, eventId, run.id);
    expect(dispatches.map((dispatch) => dispatch.status)).toEqual(["skipped", "queued"]);
    expect(dispatches[0]?.skipMetadata).toEqual({ reason: "missing_email" });
    expect(run.queuedCount).toBe(1);
  });

  it("durably fails automatic runs when a runtime component is missing", async () => {
    const repository = new InMemoryReminderRepository();
    const service = new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
      clock: () => new Date(now),
      reminders: { repository },
    });
    const failed = await service.runAutomaticReminders(automation, {
      eventId,
      scheduledAt: now,
    });
    expect(failed.state).toBe("failed");
    expect(failed.configurationFailure).toContain("candidate source");
    expect(await repository.listRuns(tenantId, eventId)).toHaveLength(1);
  });

  it("fails stale manual audience revisions durably before reporting a conflict", async () => {
    const { service, repository } = reminderFixture([], "revision-2");
    await expectCode(
      service.runManualReminders(organizer, {
        eventId,
        idempotencyKey: "stale-manual",
        expectedAudienceRevision: "revision-1",
      }),
      "COMMUNICATION_CONFLICT",
    );
    const [run] = await repository.listRuns(tenantId, eventId);
    expect(run).toMatchObject({ state: "failed", audienceRevision: "revision-2" });
  });

  it("uses one source and outbox boundary for task and review candidates", async () => {
    const task = reminderCandidate();
    const review = reminderCandidate({
      id: "candidate-review",
      recipientApplicationId: "application-2",
      subject: { type: "review", reviewAssignmentId: "assignment-1" },
    });
    const { service, outbox } = reminderFixture([task, review]);
    await service.runManualReminders(organizer, {
      eventId,
      idempotencyKey: "task-review",
      expectedAudienceRevision: "revision-1",
    });
    expect(outbox.requests).toEqual([
      expect.objectContaining({ subject: "Reminder", senderPurpose: "speakers" }),
      expect.objectContaining({ subject: "Reminder", senderPurpose: "speakers" }),
    ]);
  });

  it("enforces provider status transitions and correlates provider IDs", async () => {
    const second = reminderCandidate({
      id: "candidate-2",
      recipientApplicationId: "application-2",
      subject: { type: "review", reviewAssignmentId: "assignment-2" },
    });
    const { service, repository } = reminderFixture([reminderCandidate(), second]);
    await service.runAutomaticReminders(automation, { eventId, scheduledAt: now });
    const dispatches = await repository.listDispatches(tenantId, eventId);
    const first = dispatches[0];
    const other = dispatches[1];
    if (first === undefined || other === undefined)
      throw new Error("Expected reminder dispatches.");
    await expectCode(
      service.recordReminderDispatchStatus(automation, {
        eventId,
        dispatchId: first.id,
        status: "delivered",
        providerMessageId: "provider-1",
      }),
      "COMMUNICATION_CONFLICT",
    );
    await expectCode(
      service.recordReminderDispatchStatus(automation, {
        eventId,
        runId: "wrong-run",
        dispatchId: first.id,
        status: "provider_accepted",
        providerMessageId: "provider-1",
      }),
      "COMMUNICATION_CONFLICT",
    );
    await service.recordReminderDispatchStatus(automation, {
      eventId,
      runId: first.runId,
      dispatchId: first.id,
      status: "provider_accepted",
      providerMessageId: "provider-1",
    });
    const delivered = await service.recordReminderDispatchStatus(automation, {
      eventId,
      providerMessageId: "provider-1",
      status: "delivered",
    });
    await service.recordReminderDispatchStatus(automation, {
      eventId,
      dispatchId: other.id,
      status: "provider_accepted",
      providerMessageId: "provider-2",
    });
    const bounced = await service.recordReminderDispatchStatus(automation, {
      eventId,
      providerMessageId: "provider-2",
      status: "bounced",
    });
    expect(delivered.status).toBe("delivered");
    expect(bounced.status).toBe("bounced");
  });

  it("distinguishes automatic/manual facts and computes a future next eligibility", async () => {
    let current = new Date(now);
    const candidate = reminderCandidate({
      nextEligibleAt: "2026-08-10T12:00:00.000Z",
    });
    const { service } = reminderFixture([candidate], "revision-1", () => current);
    const manual = await service.runManualReminders(organizer, {
      eventId,
      idempotencyKey: "facts-manual",
      expectedAudienceRevision: "revision-1",
    });
    current = new Date("2026-08-09T13:00:00.000Z");
    const automatic = await service.runAutomaticReminders(automation, {
      eventId,
      scheduledAt: current.toISOString(),
    });
    const facts = await service.getReminderFacts(organizer, {
      eventId,
      recipientApplicationId: candidate.recipientApplicationId,
      subject: candidate.subject,
    });
    expect(facts.lastManual?.id).toBe(manual.id);
    expect(facts.lastAutomatic?.id).toBe(automatic.id);
    expect(facts.lastOutcome?.status).toBe("queued");
    expect(facts.nextEligibleAt).toBe(candidate.nextEligibleAt);
  });
});
