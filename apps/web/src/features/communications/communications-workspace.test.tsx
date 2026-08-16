import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createNavigationDataCache } from "@/lib/navigation-data-cache";
import {
  type CommunicationApi,
  CommunicationApiError,
  type CommunicationPreview,
  type CommunicationSend,
  type CommunicationTemplate,
  escapeHtmlForPreview,
  type ReminderDispatch,
  type ReminderFacts,
  type ReminderRun,
} from "./api";
import {
  CommunicationsWorkspaceView,
  communicationNavigationCacheKey,
  communicationNavigationCacheTags,
  communicationTemplateSelectionFromKey,
  communicationTemplateSelectionKey,
  createCommunicationTemplateReadCoordinator,
  findCommunicationTemplate,
  invalidateCommunicationPreviewState,
  loadCommunicationTemplates,
  previewAudienceForTemplate,
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
  auth: "login@self-hosted.example",
  speakers: "program@self-hosted.example",
  calendar: "schedule@self-hosted.example",
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
const automaticRun: ReminderRun = {
  id: "automatic-run-1",
  organizationId: "org-1",
  eventId: "event-1",
  triggerType: "automatic",
  audienceType: "combined",
  audienceRevision: "revision-1",
  candidateCount: 2,
  eligibleCount: 2,
  queuedCount: 2,
  skippedCount: 0,
  failedCount: 0,
  state: "completed",
  configurationFailure: null,
  actorId: null,
  startedAt: "2026-08-09T10:00:00.000Z",
  completedAt: "2026-08-09T10:01:00.000Z",
  createdAt: "2026-08-09T10:00:00.000Z",
  updatedAt: "2026-08-09T10:01:00.000Z",
};

const manualRun: ReminderRun = {
  ...automaticRun,
  id: "manual-run-1",
  triggerType: "manual",
  actorId: "organizer-1",
};

function reminderDispatch(
  status: ReminderDispatch["status"],
  id = `${status}-dispatch-1`,
): ReminderDispatch {
  return {
    id,
    runId: automaticRun.id,
    organizationId: "org-1",
    eventId: "event-1",
    recipient: "application-1",
    subject: { type: "task", taskId: "task-1" },
    eligibilityReason: "due",
    cadenceWindow: "2026-08-09T10:00:00.000Z",
    idempotencyKey: `${id}-key`,
    providerMessageId:
      status === "provider_accepted" || status === "delivered" || status === "bounced"
        ? "provider-reminder-1"
        : null,
    status,
    skipMetadata: null,
    failureMetadata: status === "failed" ? { reason: "Provider timeout" } : null,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:01:00.000Z",
    eligibleAt: "2026-08-09T10:00:10.000Z",
    skippedAt: status === "skipped" ? "2026-08-09T10:00:15.000Z" : null,
    queuedAt: "2026-08-09T10:00:20.000Z",
    providerAcceptedAt:
      status === "provider_accepted" || status === "delivered" || status === "bounced"
        ? "2026-08-09T10:00:30.000Z"
        : null,
    deliveredAt: status === "delivered" ? "2026-08-09T10:01:00.000Z" : null,
    failedAt: status === "failed" ? "2026-08-09T10:01:00.000Z" : null,
    bouncedAt: status === "bounced" ? "2026-08-09T10:01:00.000Z" : null,
    completedAt:
      status === "failed" || status === "bounced" || status === "delivered" || status === "skipped"
        ? "2026-08-09T10:01:00.000Z"
        : null,
    outboxJobId: "outbox-1",
  };
}

const reminderFacts: ReminderFacts = {
  lastAutomatic: automaticRun,
  lastManual: manualRun,
  nextEligibleAt: "2026-08-12T00:00:00.000Z",
  lastOutcome: reminderDispatch("delivered"),
};

describe("communications organizer workspace", () => {
  it("uses canonical normalized organization/event cache identities and resource tags", () => {
    expect(communicationNavigationCacheKey("templates", " org-1 ", " event-1 ")).toBe(
      "organization:org-1:event:event-1:communications:templates",
    );
    expect(communicationNavigationCacheTags("reminder-truth", " org-1 ", " event-1 ")).toEqual([
      "organization:org-1",
      "event:event-1",
      "communications:event-1",
      "communications:reminder-truth:event-1",
    ]);
  });

  it("coalesces reminder truth reads and fences invalidated completions", async () => {
    const cache = createNavigationDataCache();
    const key = communicationNavigationCacheKey("reminder-truth", "org-1", "event-1");
    const tags = communicationNavigationCacheTags("reminder-truth", "org-1", "event-1");
    const first = deferred<string>();
    const load = vi.fn(() => first.promise);
    const firstRead = cache.read({ key, tags, load });
    const secondRead = cache.read({ key, tags, load });

    expect(load).toHaveBeenCalledOnce();
    first.resolve("initial");
    await expect(Promise.all([firstRead, secondRead])).resolves.toEqual(["initial", "initial"]);
    expect(cache.peek(key)).toBe("initial");
    const hitLoad = vi.fn(() => Promise.resolve("network"));
    await expect(cache.read({ key, tags, load: hitLoad })).resolves.toBe("initial");
    expect(hitLoad).not.toHaveBeenCalled();

    const stale = deferred<string>();
    const staleRead = cache.read({ key, tags, fresh: true, load: () => stale.promise });
    cache.invalidate(tags);
    stale.resolve("stale");
    await expect(staleRead).resolves.toBe("stale");
    expect(cache.peek(key)).toBeUndefined();

    const current = deferred<string>();
    const currentRead = cache.read({ key, tags, load: () => current.promise });
    current.resolve("current");
    await expect(currentRead).resolves.toBe("current");
    expect(cache.peek(key)).toBe("current");
  });
  it("keeps event-scoped cache values isolated and makes explicit reads fresh", async () => {
    const cache = createNavigationDataCache();
    const firstKey = communicationNavigationCacheKey("templates", "org-1", "event-1");
    const firstTags = communicationNavigationCacheTags("templates", "org-1", "event-1");
    const secondKey = communicationNavigationCacheKey("templates", "org-1", "event-2");
    const secondTags = communicationNavigationCacheTags("templates", "org-1", "event-2");
    cache.write(firstKey, ["event-1"], firstTags);

    expect(cache.peek(secondKey)).toBeUndefined();
    const secondLoad = vi.fn(() => Promise.resolve(["event-2"]));
    await expect(
      cache.read({ key: secondKey, tags: secondTags, load: secondLoad }),
    ).resolves.toEqual(["event-2"]);
    expect(secondLoad).toHaveBeenCalledOnce();

    const freshLoad = vi.fn(() => Promise.resolve(["fresh-event-1"]));
    await expect(
      cache.read({ key: firstKey, tags: firstTags, fresh: true, load: freshLoad }),
    ).resolves.toEqual(["fresh-event-1"]);
    expect(freshLoad).toHaveBeenCalledOnce();
  });
  it("waits for a server-returned sender on new drafts", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        view: "templates",
        organizationId: "org-1",
        templates: [],
        creatingTemplate: true,
      }),
    );

    expect(markup).toContain(
      "The sender address is assigned when you save this draft; you cannot change it here.",
    );
    expect(markup).not.toContain("sessionboard.namuh.co");
  });

  it("displays exact server-returned sender identities and event-scoped version controls", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        view: "templates",
        templates: [
          template("auth-1", "verification", senders.auth, "approved"),
          template("speaker-1", "receipt", senders.speakers, "approved"),
          template("calendar-1", "schedule_publish", senders.calendar, "approved"),
          template("group-1", "organizer_group_email", senders.speakers, "draft", 2),
        ],
        selectedTemplateId: "group-1",
      }),
    );

    expect(markup).toContain("Event communications");
    expect(markup).toContain(senders.auth);
    expect(markup).toContain(senders.speakers);
    expect(markup).toContain(senders.calendar);
    expect(markup).toContain("Create a new email version");
    expect(markup).toContain("Approve version 2");
    expect(markup).not.toContain("Send a broadcast");
    expect(markup).not.toContain("Create email template");
  });

  it("explains the event email workflow and that saving a draft does not send", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        view: "templates",
        templates: [],
        creatingTemplate: true,
        onCreateTemplate: async () => undefined,
      }),
    );

    expect(markup).toContain(
      "Send one-off event broadcasts, manage reusable approved templates, and monitor automated task/review reminders.",
    );
    expect(markup).toContain("Saving creates a draft only; after review and approval");
    expect(markup).toContain("For a one-off send from this page, use Organizer Group Email.");
    expect(markup).toContain("No saved emails yet. Compose your first email below.");
    expect(markup).toContain("Save email draft");
    expect(markup).not.toContain("Send a broadcast");
  });
  it("defaults to broadcasts with an actionable template path and separate tab descriptions", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [],
      }),
    );

    expect(markup).toContain("Broadcasts");
    expect(markup).toContain("Send one-off event email");
    expect(markup).toContain("Templates");
    expect(markup).toContain("Manage approved reusable content");
    expect(markup).toContain("Reminders");
    expect(markup).toContain("Monitor task and review notices");
    expect(markup).toContain("Send a broadcast");
    expect(markup).toContain("Create email template");
    expect(markup).not.toContain("Saved emails");
    expect(markup).not.toContain("Automatic and manual reminders");
  });

  it("requires an approved email and preview before send is available", () => {
    const draftMarkup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [template("group-1", "organizer_group_email", senders.speakers, "draft", 2)],
        selectedTemplateId: "group-1",
        onPreview: async () => undefined,
      }),
    );

    expect(draftMarkup).toMatch(
      /<button[^>]*disabled=""[^>]*>Preview recipients and email<\/button>/u,
    );
    expect(draftMarkup).not.toContain("Send to 2 recipients");
    expect(draftMarkup).toContain("No approved event email exists yet");
    expect(draftMarkup).toContain("Create email template");

    const approvedMarkup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [template("group-1", "organizer_group_email", senders.speakers, "approved", 2)],
        selectedTemplateId: "group-1",
        onPreview: async () => undefined,
      }),
    );

    expect(approvedMarkup).toContain("Preview recipients and email");
    expect(approvedMarkup).not.toContain("Send to 2 recipients");
    expect(approvedMarkup).toContain("1 approved version available");
    expect(approvedMarkup).toContain("Exact email selected");

    const readyMarkup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [template("group-1", "organizer_group_email", senders.speakers, "approved", 2)],
        selectedTemplateId: "group-1",
        preview,
        onOpenSendConfirmation: () => undefined,
      }),
    );

    expect(readyMarkup).toContain("Send to 2 recipients");
    expect(readyMarkup).not.toMatch(/<button[^>]*disabled=""[^>]*>Send to 2 recipients<\/button>/u);
    expect(readyMarkup).toContain("2 recipients captured by the server");
    expect(readyMarkup).toContain("Outstanding · explicit confirmation is required");
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
    expect(markup).toContain("Step 3 · Confirm send");
    expect(markup).toContain(
      "Sending is blocked until you explicitly confirm this exact recipient snapshot.",
    );
    expect(markup).toContain("Delivered");
    expect(markup).toContain("Failed");
    expect(markup).toContain("Recorded · Partial");
    expect(markup).toContain("Provider timeout");
    expect(markup).toContain("1 delivered");
    expect(markup).toContain("1 failed");
    expect(markup).toContain("0 queued");
    expect(markup).toContain("provider-1");
    expect(markup).toContain("Audit history");
    expect(markup).toContain("send_created");
    expect(markup).toContain(senders.speakers);
    expect(markup).toContain('href="#audit-audit-1"');
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
        view: "templates",
        templates: versions,
        selectedTemplateId: "group-1",
        selectedTemplateVersion: 2,
      }),
    );
    expect(markup).toContain('data-template-selection="group-1:2"');
    expect(markup).toContain('data-template-selection="group-1:1"');
    expect(markup).toContain("Select saved email organizer_group_email template, version 2");
  });

  it("targets approved decision templates to decision-status audiences", () => {
    expect(
      previewAudienceForTemplate(template("accepted", "decision", senders.speakers, "approved", 1)),
    ).toBe("accepted_participants");
    expect(
      previewAudienceForTemplate({
        ...template("rejected", "decision", senders.speakers, "approved", 1),
        name: "Rejected decision",
      }),
    ).toBe("rejected_participants");
    expect(
      previewAudienceForTemplate({
        ...template("waitlisted", "decision", senders.speakers, "approved", 1),
        name: "Waitlist decision",
      }),
    ).toBe("waitlisted_participants");
  });

  it("renders an approval review gate with cancel and confirm controls", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        view: "templates",
        templates: [template("group-1", "organizer_group_email", senders.speakers, "draft", 2)],
        selectedTemplateId: "group-1",
        selectedTemplateVersion: 2,
        approvalDialogOpen: true,
        onApproveTemplate: async () => undefined,
      }),
    );
    expect(markup).toContain('data-approval-dialog-state="open"');
    expect(markup).toContain("Step 2 · Review and approve");
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
    expect(markup).toContain("Step 4 · Track delivery");
    expect(markup).toContain("Delivery status and send history");
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
  it("renders automatic/manual facts and every provider reminder state without inventing success", () => {
    const statuses = [
      "candidate",
      "eligible",
      "queued",
      "provider_accepted",
      "delivered",
      "failed",
      "bounced",
    ] as const;
    const dispatches = statuses.map((status) => reminderDispatch(status));
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        view: "reminders",
        templates: [],
        reminderRuns: [automaticRun, manualRun],
        reminderDispatches: dispatches,
        reminderFacts,
        reminderState: "ready",
        onRunManualReminders: async () => undefined,
        onRefreshDeliveryTruth: async () => undefined,
      }),
    );

    expect(markup).toContain("Automatic and manual reminders");
    expect(markup).toContain("Automatic");
    expect(markup).toContain("Manual");
    expect(markup).toContain("Provider Accepted");
    expect(markup).toContain("Delivered");
    expect(markup).toContain("Failed");
    expect(markup).toContain("Bounced");
    expect(markup).toContain("Next eligible time");
    expect(markup).toContain("Last outcome");
    expect(markup).toContain(
      "Historical recipient and task/review subject snapshots are immutable",
    );
  });

  it("renders reminder pending, conflict, stale, and unavailable truth states explicitly", () => {
    const states = [
      ["pending", "Reminder status is loading", "No provider outcome is assumed"],
      ["conflict", "Reminder audience conflict", "Reconcile the current audience revision"],
      [
        "stale",
        "Reminder status is stale",
        "before treating a queued or provider-accepted state as terminal",
      ],
      ["unavailable", "Reminder delivery status unavailable", "No delivery success is shown"],
    ] as const;
    for (const [state, message, truthBoundary] of states) {
      const markup = renderToStaticMarkup(
        createElement(CommunicationsWorkspaceView, {
          eventId: "event-1",
          organizationId: "org-1",
          view: "reminders",
          templates: [],
          reminderState: state,
          reminderError: `${state} error`,
          reminderLoading: state === "pending",
        }),
      );
      expect(markup).toContain(message);
      expect(markup).toContain(truthBoundary);
    }
  });

  it("does not show retry for non-terminal queued sends but does for bounced terminal sends", () => {
    const bouncedSend: CommunicationSend = {
      ...send,
      status: "partial",
      failedCount: 0,
      deliveries: send.deliveries.map((delivery) => ({
        ...delivery,
        status: "bounced",
        providerMessageId: "provider-bounced",
        failureReason: "Mailbox rejected",
      })),
      terminal: true,
    };
    const markup = renderToStaticMarkup(
      createElement(CommunicationsWorkspaceView, {
        eventId: "event-1",
        organizationId: "org-1",
        templates: [],
        send: bouncedSend,
        onRetryFailed: async () => undefined,
      }),
    );
    expect(markup).toContain("Retry failed or bounced recipients");
  });
});
