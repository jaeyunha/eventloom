import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CommunicationApiError,
  type CommunicationPreview,
  type CommunicationSend,
  type CommunicationTemplate,
  createCommunicationApi,
  escapeHtmlForPreview,
} from "./api";
import { CommunicationsWorkspaceView } from "./communications-workspace";

type TestFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const senders = {
  auth: "auth@sessionboard.namuh.co",
  speakers: "speakers@sessionboard.namuh.co",
  calendar: "calendar@sessionboard.namuh.co",
} as const;

function template(
  id: string,
  purpose: CommunicationTemplate["purpose"],
  sender: CommunicationTemplate["sender"],
  status: CommunicationTemplate["status"],
  version = 1,
): CommunicationTemplate {
  return {
    id,
    tenantId: "org-1",
    eventId: "event-1",
    name: `${purpose} template`,
    purpose,
    version,
    status,
    sender,
    subject: "Hello {{recipient.displayName}}",
    html: "<p>Hello {{recipient.displayName}}</p>",
    text: "Hello {{recipient.displayName}}",
    variables: ["recipient.displayName"],
    createdBy: "organizer-1",
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
    approvedBy: status === "approved" ? "organizer-1" : null,
    approvedAt: status === "approved" ? "2026-08-09T10:00:00.000Z" : null,
  };
}

const recipients = [
  {
    id: "recipient-1",
    participantId: "participant-1",
    tenantId: "org-1",
    eventId: "event-1",
    email: "ada@example.test",
    displayName: "Ada Lovelace",
    audiences: ["all_participants" as const],
    data: {},
  },
  {
    id: "recipient-2",
    participantId: "participant-2",
    tenantId: "org-1",
    eventId: "event-1",
    email: "grace@example.test",
    displayName: "Grace Hopper",
    audiences: ["all_participants" as const],
    data: {},
  },
];

const preview: CommunicationPreview = {
  id: "preview-1",
  tenantId: "org-1",
  eventId: "event-1",
  purpose: "organizer_group_email",
  templateId: "group-1",
  templateVersion: 2,
  audience: "all_participants",
  data: {},
  recipientCount: recipients.length,
  recipientIds: recipients.map((recipient) => recipient.id),
  recipients,
  recipientPreviews: [
    {
      recipientId: "recipient-1",
      email: "ada@example.test",
      displayName: "Ada Lovelace",
      subject: "Hello Ada Lovelace",
      html: "<p>Hello Ada Lovelace</p>",
      text: "Hello Ada Lovelace",
    },
    {
      recipientId: "recipient-2",
      email: "grace@example.test",
      displayName: "Grace Hopper",
      subject: "Hello Grace Hopper",
      html: "<p>Hello Grace Hopper</p>",
      text: "Hello Grace Hopper",
    },
  ],
  template: {
    id: "group-1",
    name: "Group template",
    purpose: "organizer_group_email",
    version: 2,
    sender: senders.speakers,
    subject: "Hello Ada Lovelace",
    html: "<p>Hello &lt;Ada&gt;</p>",
    text: "Hello <Ada>",
  },
  subject: "Hello Ada Lovelace",
  html: "<p>Hello &lt;Ada&gt; &amp; team</p>",
  text: "Hello <Ada> & team",
  createdBy: "organizer-1",
  createdAt: "2026-08-09T10:00:00.000Z",
  expiresAt: "2026-08-09T10:15:00.000Z",
};

const send: CommunicationSend = {
  id: "send-1",
  tenantId: "org-1",
  eventId: "event-1",
  purpose: "organizer_group_email",
  audience: "all_participants",
  templateId: "group-1",
  templateVersion: 2,
  template: preview.template,
  idempotencyKey: "web-send-1",
  previewId: preview.id,
  data: {},
  status: "partial",
  recipientCount: 2,
  queuedCount: 0,
  deliveredCount: 1,
  failedCount: 1,
  terminal: true,
  recipients,
  deliveries: [
    {
      recipientId: "recipient-1",
      email: "ada@example.test",
      status: "delivered",
      providerMessageId: "provider-1",
      failureReason: null,
      attempts: 1,
      history: [
        {
          id: "delivery-1",
          status: "delivered",
          occurredAt: "2026-08-09T10:01:00.000Z",
          providerMessageId: "provider-1",
          reason: null,
          actorId: "delivery",
        },
      ],
    },
    {
      recipientId: "recipient-2",
      email: "grace@example.test",
      status: "failed",
      providerMessageId: null,
      failureReason: "Provider timeout",
      attempts: 1,
      history: [
        {
          id: "delivery-2",
          status: "failed",
          occurredAt: "2026-08-09T10:01:00.000Z",
          providerMessageId: null,
          reason: "Provider timeout",
          actorId: "delivery",
        },
      ],
    },
  ],
  history: [
    {
      id: "audit-1",
      tenantId: "org-1",
      eventId: "event-1",
      sendId: "send-1",
      recipientId: null,
      action: "send_created",
      actorId: "organizer-1",
      occurredAt: "2026-08-09T10:00:00.000Z",
      details: {},
    },
  ],
  createdBy: "organizer-1",
  createdAt: "2026-08-09T10:00:00.000Z",
  updatedAt: "2026-08-09T10:01:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("communications organizer workspace", () => {
  it("displays exact approved sender identities and event-scoped version controls", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [
          template("auth-1", "verification", senders.auth, "approved"),
          template("speaker-1", "receipt", senders.speakers, "approved"),
          template("calendar-1", "schedule_publish", senders.calendar, "approved"),
          template("group-1", "organizer_group_email", senders.speakers, "draft", 2),
        ],
        selectedTemplateId: "group-1",
      }),
    );

    expect(markup).toContain("Operational communications");
    expect(markup).toContain(senders.auth);
    expect(markup).toContain(senders.speakers);
    expect(markup).toContain(senders.calendar);
    expect(markup).toContain("Create a new template version");
    expect(markup).toContain("Approve version 2");
    expect(markup).toContain("No preview has been created for this event.");
    expect(markup).toContain("does not send SMS, CRM, marketing campaigns, or analytics");
  });

  it("shows recipient snapshot, escaped HTML source, explicit confirmation, statuses, and history", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [template("group-1", "organizer_group_email", senders.speakers, "approved", 2)],
        selectedTemplateId: "group-1",
        preview,
        send,
        sendConfirmationOpen: true,
        onConfirmSend: async () => undefined,
        onCloseSendConfirmation: () => undefined,
      }),
    );

    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("Grace Hopper");
    expect(markup).toContain("Escaped HTML source (not executed)");
    expect(markup).toContain("Per-recipient email previews");
    expect(markup).toContain("Hello Grace Hopper");
    expect(markup).toContain("Confirm operational email send");
    expect(markup).toContain("Confirm and send");
    expect(markup).toContain("Delivered");
    expect(markup).toContain("Failed");
    expect(markup).toContain("Provider timeout");
    expect(markup).toContain("1 delivered");
    expect(markup).toContain("1 failed");
    expect(markup).toContain("0 queued");
    expect(markup).toContain("provider-1");
    expect(markup).toContain("Audit history");
    expect(markup).toContain("send_created");
    expect(markup).toContain(senders.speakers);
  });
  it("labels queued sends as in progress instead of completed", () => {
    const queuedSend: CommunicationSend = {
      ...send,
      status: "queued",
      queuedCount: 2,
      deliveredCount: 0,
      failedCount: 0,
      terminal: false,
      deliveries: send.deliveries.map((delivery) => ({
        ...delivery,
        status: "queued",
        providerMessageId: null,
        failureReason: null,
      })),
    };
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [],
        send: queuedSend,
        onRetryFailed: async () => undefined,
      }),
    );

    expect(markup).toContain("In progress");
    expect(markup).toContain("2 queued");
    expect(markup).not.toContain("Retry failed recipients");
  });

  it("escapes template preview text without executing markup", () => {
    expect(escapeHtmlForPreview(`<script>alert('x')</script> & "quoted"`)).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;",
    );
  });

  it("sends previews with an idempotency key and keeps unauthorized/provider failures explicit", async () => {
    const fetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValueOnce(jsonResponse({ templates: [] }))
      .mockResolvedValueOnce(jsonResponse(preview))
      .mockResolvedValueOnce(jsonResponse(send));
    const api = createCommunicationApi("https://api.example.test/", "org/one", fetcher);

    await expect(api.listTemplates("event/one")).resolves.toEqual([]);
    await expect(
      api.preview({
        eventId: "event/one",
        purpose: "organizer_group_email",
        templateId: "group-1",
        audience: "all_participants",
      }),
    ).resolves.toEqual(preview);
    await expect(
      api.sendGroup({ eventId: "event/one", previewId: preview.id, idempotencyKey: "web-key-1" }),
    ).resolves.toEqual(send);

    const sendCall = fetcher.mock.calls[2];
    const sendInit = sendCall?.[1] as unknown as RequestInit;
    expect(String(sendCall?.[0])).toContain(
      "/api/admin/organizations/org%2Fone/events/event%2Fone/communications/sends",
    );
    expect(new Headers(sendInit.headers).get("idempotency-key")).toBe("web-key-1");
    expect(JSON.parse(String(sendInit.body))).toMatchObject({
      previewId: preview.id,
      idempotencyKey: "web-key-1",
    });

    const deniedFetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: "COMMUNICATION_FORBIDDEN", message: "Not authorized" } },
          403,
        ),
      );
    await expect(
      createCommunicationApi("https://api.example.test", "org-1", deniedFetcher).listTemplates(
        "event-1",
      ),
    ).rejects.toMatchObject({ code: "COMMUNICATION_FORBIDDEN", status: 403 });

    const providerFetcher = vi.fn<TestFetcher>().mockResolvedValue(
      jsonResponse(
        {
          error: { code: "COMMUNICATION_UNAVAILABLE", message: "Sender domain is not verified" },
        },
        503,
      ),
    );
    await expect(
      createCommunicationApi("https://api.example.test", "org-1", providerFetcher).sendGroup({
        eventId: "event-1",
        previewId: "preview-1",
        idempotencyKey: "web-key-2",
      }),
    ).rejects.toBeInstanceOf(CommunicationApiError);
  });
  it("routes an empty base URL through the same-origin communications gateway", async () => {
    const fetcher = vi.fn<TestFetcher>().mockResolvedValue(jsonResponse({ templates: [] }));
    const api = createCommunicationApi("", "org-1", fetcher);

    await expect(api.listTemplates("event-1")).resolves.toEqual([]);

    const [input, init] = fetcher.mock.calls[0] ?? [];
    const requestedUrl = String(input);
    expect(requestedUrl).toBe(
      "/api/admin/organizations/org-1/events/event-1/communications/templates",
    );
    expect(requestedUrl.startsWith("/api/")).toBe(true);
    expect(requestedUrl).not.toMatch(/^\/\//);
    expect(requestedUrl).not.toMatch(/^https?:\/\//);
    expect(init?.credentials).toBe("include");
  });
});
