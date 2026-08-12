import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  type CommunicationApi,
  CommunicationApiError,
  type CommunicationPreview,
  type CommunicationSend,
  type CommunicationTemplate,
  escapeHtmlForPreview,
} from "./api";
import {
  CommunicationsWorkspaceView,
  communicationTemplateSelectionFromKey,
  communicationTemplateSelectionKey,
  createCommunicationTemplateReadCoordinator,
  findCommunicationTemplate,
  invalidateCommunicationPreviewState,
  loadCommunicationTemplates,
} from "./communications-workspace";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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
    expect(markup).toContain("Step 4 · Confirm send");
    expect(markup).toContain(
      "Sending is blocked until you explicitly confirm this exact snapshot.",
    );
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

  it("coalesces a StrictMode-style reacquire before the first template read settles", async () => {
    const response = deferred<readonly CommunicationTemplate[]>();
    const signals: AbortSignal[] = [];
    const api = {
      listTemplates: vi.fn(
        (
          _eventId: string,
          _purpose: CommunicationTemplate["purpose"] | undefined,
          signal: AbortSignal,
        ) => {
          signals.push(signal);
          return response.promise;
        },
      ),
    } as unknown as CommunicationApi;
    const coordinator = createCommunicationTemplateReadCoordinator();
    const key = { api, organizationId: "org-1", eventId: "event-1" };

    const first = coordinator.acquire(key);
    first.release();
    const second = coordinator.acquire(key);
    await Promise.resolve();

    expect(api.listTemplates).toHaveBeenCalledOnce();
    expect(signals[0]?.aborted).toBe(false);

    const loaded = [template("group-1", "organizer_group_email", senders.speakers, "approved")];
    response.resolve(loaded);
    await expect(second.promise).resolves.toEqual(loaded);
    second.release();
  });
  it("commits the current template read before ignoring a stale late response", async () => {
    const first = deferred<readonly CommunicationTemplate[]>();
    const second = deferred<readonly CommunicationTemplate[]>();
    const commits: string[] = [];
    let current = "first";

    const firstLoad = loadCommunicationTemplates({
      read: () => first.promise,
      signal: undefined,
      isCurrent: () => current === "first",
      onLoaded: (templates) => commits.push(`first:${templates[0]?.id}`),
      onError: (message) => commits.push(`first-error:${message}`),
      onSettled: () => commits.push("first:settled"),
    });
    current = "second";
    const secondLoad = loadCommunicationTemplates({
      read: () => second.promise,
      signal: undefined,
      isCurrent: () => current === "second",
      onLoaded: (templates) => commits.push(`second:${templates[0]?.id}`),
      onError: (message) => commits.push(`second-error:${message}`),
      onSettled: () => commits.push("second:settled"),
    });

    second.resolve([
      template("second-template", "organizer_group_email", senders.speakers, "approved"),
    ]);
    await secondLoad;
    first.resolve([template("first-template", "receipt", senders.speakers, "approved")]);
    await firstLoad;

    expect(commits).toEqual(["second:second-template", "second:settled"]);
  });

  it("suppresses aborted and stale errors while keeping the current resource error explicit", async () => {
    const stale = deferred<readonly CommunicationTemplate[]>();
    const aborted = deferred<readonly CommunicationTemplate[]>();
    const callbacks: string[] = [];
    let current = "stale";
    const staleLoad = loadCommunicationTemplates({
      read: () => stale.promise,
      signal: undefined,
      isCurrent: () => current === "stale",
      onLoaded: () => callbacks.push("stale:loaded"),
      onError: () => callbacks.push("stale:error"),
      onSettled: () => callbacks.push("stale:settled"),
    });

    current = "current";
    stale.reject(new Error("Old event failed"));
    await staleLoad;

    const controller = new AbortController();
    const abortedLoad = loadCommunicationTemplates({
      read: () => aborted.promise,
      signal: controller.signal,
      isCurrent: () => current === "current",
      onLoaded: () => callbacks.push("aborted:loaded"),
      onError: () => callbacks.push("aborted:error"),
      onSettled: () => callbacks.push("aborted:settled"),
    });
    controller.abort();
    aborted.reject(new DOMException("Aborted", "AbortError"));
    await abortedLoad;

    await loadCommunicationTemplates({
      read: () =>
        Promise.reject(new CommunicationApiError("COMMUNICATION_FORBIDDEN", "Not authorized", 403)),
      signal: undefined,
      isCurrent: () => current === "current",
      onLoaded: () => callbacks.push("current:loaded"),
      onError: (message) => callbacks.push(message),
      onSettled: () => callbacks.push("current:settled"),
    });

    expect(callbacks).toEqual(["Access denied: Not authorized", "current:settled"]);
  });
  it("keeps template selection exact when one id has multiple versions", () => {
    const versions = [
      template("group-1", "organizer_group_email", senders.speakers, "approved", 1),
      template("group-1", "organizer_group_email", senders.speakers, "draft", 2),
    ];
    const key = communicationTemplateSelectionKey("group-1", 2);
    expect(key).toBe("group-1:2");
    expect(communicationTemplateSelectionFromKey(key)).toEqual({
      templateId: "group-1",
      templateVersion: 2,
    });
    expect(findCommunicationTemplate(versions, communicationTemplateSelectionFromKey(key))).toEqual(
      versions[1],
    );
    expect(
      findCommunicationTemplate(versions, {
        templateId: "group-1",
        templateVersion: 3,
      }),
    ).toBeUndefined();

    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: versions,
        selectedTemplateId: "group-1",
        selectedTemplateVersion: 2,
      }),
    );
    expect(markup).toContain('data-template-selection="group-1:2"');
    expect(markup).toContain('data-template-selection="group-1:1"');
    expect(markup).toContain("Select organizer_group_email template version 2");
    expect(markup).toContain("Select exact approved version");
  });

  it("renders an approval review gate with cancel and confirm controls", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [template("group-1", "organizer_group_email", senders.speakers, "draft", 2)],
        selectedTemplateId: "group-1",
        selectedTemplateVersion: 2,
        approvalDialogOpen: true,
        onApproveTemplate: async () => undefined,
      }),
    );
    expect(markup).toContain('data-approval-dialog-state="open"');
    expect(markup).toContain("Step 2 · Review and approve exact version");
    expect(markup).toContain("Approve version 2");
  });

  it("uses an alert dialog for focus-safe send confirmation and retains history without a preview", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [],
        send,
        sendConfirmationOpen: false,
      }),
    );
    expect(markup).toContain("Step 5 · Delivery history");
    expect(markup).toContain("Per-recipient status and audit history");
    expect(markup).not.toContain("Confirm operational email send");

    const confirmationMarkup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [template("group-1", "organizer_group_email", senders.speakers, "approved", 2)],
        selectedTemplateId: "group-1",
        selectedTemplateVersion: 2,
        preview,
        send,
        sendConfirmationOpen: true,
        onConfirmSend: async () => undefined,
        onCloseSendConfirmation: () => undefined,
      }),
    );
    expect(confirmationMarkup).toContain('data-confirmation-open="true"');
    expect(
      invalidateCommunicationPreviewState({
        preview,
        sendConfirmationOpen: true,
        idempotencyKey: "web-send-1",
      }),
    ).toEqual({
      preview: null,
      sendConfirmationOpen: false,
      idempotencyKey: null,
    });
  });
});
