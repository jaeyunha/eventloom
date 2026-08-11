import { describe, expect, it } from "vitest";
import type { CommunicationError } from "./service";
import { CommunicationService, InMemoryCommunicationRepository } from "./service";
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
  it("maps every template purpose to its exact sender and rejects legacy or arbitrary identities", async () => {
    const { service } = await fixture();
    const purposeSenders: readonly [CommunicationTemplatePurpose, CommunicationSenderIdentity][] = [
      ["verification", "auth@sessionboard.namuh.co"],
      ["receipt", "speakers@sessionboard.namuh.co"],
      ["reminder", "speakers@sessionboard.namuh.co"],
      ["decision", "speakers@sessionboard.namuh.co"],
      ["task", "speakers@sessionboard.namuh.co"],
      ["schedule_publish", "calendar@sessionboard.namuh.co"],
      ["schedule_update", "calendar@sessionboard.namuh.co"],
      ["schedule_cancel", "calendar@sessionboard.namuh.co"],
      ["organizer_group_email", "speakers@sessionboard.namuh.co"],
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

    for (const [id, sender] of [
      ["legacy", "auth@foreverbrowsing.com"],
      ["arbitrary", "noreply@sessionboard.namuh.co"],
    ] as const) {
      await expectCode(
        service.createTemplate(organizer, {
          id: `sender-${id}`,
          eventId,
          name: `${id} sender`,
          purpose: "verification",
          sender: sender as unknown as CommunicationSenderIdentity,
          subject: "Subject",
          html: "<p>Body</p>",
          text: "Body",
        }),
        "COMMUNICATION_INVALID_INPUT",
      );
    }

    await expectCode(
      service.createTemplate(organizer, {
        id: "sender-wrong-purpose",
        eventId,
        name: "Wrong purpose sender",
        purpose: "verification",
        sender: "speakers@sessionboard.namuh.co",
        subject: "Subject",
        html: "<p>Body</p>",
        text: "Body",
      }),
      "COMMUNICATION_INVALID_INPUT",
    );
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
    expect(send.previewId).toBe(preview.id);
    expect(send.recipients.map((recipient) => recipient.id)).toEqual([
      "participant-1",
      "participant-2",
    ]);
    expect(adapter.requests[0]?.html).toContain("&lt;script&gt;");
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
