import { expect, test } from "@playwright/test";

interface OrganizerProfile {
  readonly participantId: string;
  readonly displayName: string;
}

interface CreatedTask {
  readonly id: string;
  readonly participantId: string;
  readonly version: number;
}

interface ReminderPreview {
  readonly snapshotFingerprint: string;
  readonly recipientIds: readonly string[];
  readonly taskIds: readonly string[];
  readonly recipients: readonly {
    readonly participantId: string;
    readonly displayName: string;
    readonly taskIds: readonly string[];
    readonly tasks: readonly { readonly title: string; readonly dueAt?: string }[];
  }[];
}

interface ReminderQueueResult {
  readonly idempotencyKey: string;
  readonly sentCount: number;
  readonly failedCount: number;
  readonly duplicateCount: number;
  readonly recipientIds: readonly string[];
  readonly receipts: readonly {
    readonly participantId: string;
    readonly status: "queued" | "failed" | "duplicate";
  }[];
}

const eventPath = "/admin/organizations/local-organization/events/demo-event/deliverables";
const speakerApi = "/api/speaker/events/demo-event/organizer";

test.describe("content collection reminder recipient consistency", () => {
  test.use({ colorScheme: "light", viewport: { width: 1440, height: 1000 } });

  test("keeps preview, queue confirmation, retry, and durable history aligned", async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const webOrigin = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3015"}`;
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "local-session",
        url: webOrigin,
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
      },
    ]);

    const profilesResponse = await page.request.get(`${speakerApi}/profiles`);
    expect(profilesResponse.ok()).toBe(true);
    const profilesBody = (await profilesResponse.json()) as {
      data: { profiles: OrganizerProfile[] };
    };
    const participants = profilesBody.data.profiles
      .map((profile) => ({ id: profile.participantId, name: profile.displayName }))
      .slice(0, 2);
    expect(participants).toHaveLength(2);

    const taskTitles = ["QA reminder artifact A", "QA reminder artifact B"];
    const createdTasks: CreatedTask[] = [];
    for (const title of taskTitles) {
      const response = await page.request.post(`${speakerApi}/tasks`, {
        data: {
          type: "upload",
          title,
          description: "Fixture-only reminder aggregation verification.",
          instructions: "Fixture-only reminder aggregation verification.",
          dueAt: "2026-09-01",
          allowedMimeTypes: ["application/pdf"],
          maxBytes: 1024,
          acceptedAssetKinds: ["slides"],
          reminderOffsetsMinutes: [0],
          assignments: participants.map((participant) => ({
            participantId: participant.id,
            submissionId: null,
          })),
        },
      });
      expect(response.status()).toBe(201);
      const body = (await response.json()) as { items: CreatedTask[] };
      expect(body.items).toHaveLength(2);
      createdTasks.push(...body.items);
    }
    const taskIds = createdTasks.map((task) => task.id);
    const recipientIds = participants.map((participant) => participant.id);

    const previewResponse = await page.request.post(`${speakerApi}/reminders/preview`, {
      data: {
        taskIds,
        recipientIds,
        idempotencyKey: `qa-direct-preview-${crypto.randomUUID()}`,
      },
    });
    expect(previewResponse.ok()).toBe(true);
    const previewBody = (await previewResponse.json()) as { data: ReminderPreview };
    const preview = previewBody.data;
    expect(preview.snapshotFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(new Set(preview.recipientIds)).toEqual(new Set(recipientIds));
    expect(new Set(preview.taskIds)).toEqual(new Set(taskIds));
    expect(preview.recipients).toHaveLength(2);
    for (const recipient of preview.recipients) {
      expect(recipient.taskIds).toHaveLength(2);
      expect(recipient.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: taskTitles[0], dueAt: "2026-09-01" }),
          expect.objectContaining({ title: taskTitles[1], dueAt: "2026-09-01" }),
        ]),
      );
    }

    await page.goto(eventPath, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Content collection" })).toBeVisible({
      timeout: 15_000,
    });
    for (const taskId of taskIds) {
      const selection = page.locator(`[id="content-request-reminder-${taskId}"]`);
      await expect(selection).toBeVisible();
      await selection.click();
      await expect(selection).toHaveAttribute("data-state", "checked");
    }
    await page.getByRole("button", { name: "Send reminders" }).click();

    const dialog = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Send outstanding reminders" }) });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("4 assignments", { exact: true })).toBeVisible();
    await expect(dialog.getByText("2 recipients", { exact: true })).toBeVisible();
    const snapshotTable = dialog.getByRole("table", {
      name: "Recipient and assignment snapshot",
    });
    await expect(snapshotTable.getByRole("row")).toHaveCount(5);
    const desktopDialogBox = await dialog.boundingBox();
    const desktopTableBox = await snapshotTable.boundingBox();
    expect(desktopDialogBox).not.toBeNull();
    expect(desktopTableBox).not.toBeNull();
    expect(desktopDialogBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(
      (desktopDialogBox?.x ?? 0) + (desktopDialogBox?.width ?? Number.POSITIVE_INFINITY),
    ).toBeLessThanOrEqual(1440);
    expect(desktopTableBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThan(
      desktopDialogBox?.width ?? 0,
    );
    for (const title of taskTitles) {
      await expect(dialog.getByText(title, { exact: true })).toHaveCount(2);
    }
    for (const recipient of preview.recipients) {
      await expect(
        dialog.getByRole("rowheader").filter({ hasText: recipient.displayName }),
      ).toHaveCount(2);
      await expect(dialog.getByText(recipient.participantId, { exact: true })).toHaveCount(1);
    }
    await page.screenshot({
      path: testInfo.outputPath("content-reminder-preview-desktop.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dialog).toBeVisible();
    const mobileDialogBox = await dialog.boundingBox();
    const mobileTableBox = await snapshotTable.boundingBox();
    expect(mobileDialogBox).not.toBeNull();
    expect(mobileTableBox).not.toBeNull();
    expect(mobileDialogBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(
      (mobileDialogBox?.x ?? 0) + (mobileDialogBox?.width ?? Number.POSITIVE_INFINITY),
    ).toBeLessThanOrEqual(390);
    expect(mobileTableBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThan(
      mobileDialogBox?.width ?? 0,
    );
    await page.screenshot({
      path: testInfo.outputPath("content-reminder-preview-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const reminderOperationBeforeClose = await page.evaluate(() =>
      Object.entries(window.sessionStorage).find(([key]) =>
        key.startsWith("eventloom:deliverable-reminder:"),
      ),
    );
    expect(reminderOperationBeforeClose).toBeDefined();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Send reminders" }).click();
    await expect(dialog).toBeVisible();
    const reminderOperationAfterReopen = await page.evaluate(() =>
      Object.entries(window.sessionStorage).find(([key]) =>
        key.startsWith("eventloom:deliverable-reminder:"),
      ),
    );
    expect(reminderOperationAfterReopen).toEqual(reminderOperationBeforeClose);

    const confirmation = dialog.getByRole("checkbox", {
      name: "I confirm this exact outstanding recipient and assignment snapshot.",
    });
    await confirmation.click();
    await expect(confirmation).toHaveAttribute("data-state", "checked");
    const queueRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname ===
          "/api/speaker/events/demo-event/organizer/reminders/queue",
    );
    const queueResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          "/api/speaker/events/demo-event/organizer/reminders/queue",
    );
    await dialog.getByRole("button", { name: "Confirm and send reminders" }).click();
    const [queueRequest, queueResponse] = await Promise.all([
      queueRequestPromise,
      queueResponsePromise,
    ]);
    expect(queueResponse.ok()).toBe(true);
    const queuePayload = queueRequest.postDataJSON() as {
      taskIds: string[];
      recipientIds: string[];
      idempotencyKey: string;
      snapshotFingerprint: string;
    };
    expect(new Set(queuePayload.taskIds)).toEqual(new Set(taskIds));
    expect(new Set(queuePayload.recipientIds)).toEqual(new Set(recipientIds));
    expect(queuePayload.idempotencyKey).not.toBe("");
    expect(queuePayload.snapshotFingerprint).toBe(preview.snapshotFingerprint);
    const successStatus = page.getByText("Reminder send recorded for 2 recipients.", {
      exact: true,
    });
    await expect(successStatus).toBeVisible();
    await expect(
      page.getByText(/Send outstanding reminders: Succeeded.*2 recipients/u),
    ).toBeVisible();
    await successStatus.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("content-reminder-confirmed.png"),
      fullPage: false,
    });

    const historyResponse = await page.request.get(
      `${speakerApi}/reminders/history/${encodeURIComponent(queuePayload.idempotencyKey)}`,
    );
    expect(historyResponse.ok()).toBe(true);
    const historyBody = (await historyResponse.json()) as {
      data: ReminderQueueResult & { taskIds: string[] };
    };
    expect(new Set(historyBody.data.taskIds)).toEqual(new Set(taskIds));
    expect(new Set(historyBody.data.recipientIds)).toEqual(new Set(recipientIds));
    expect(historyBody.data.receipts).toHaveLength(2);
    expect(historyBody.data.receipts.every((receipt) => receipt.status === "queued")).toBe(true);

    const replayResponse = await page.request.post(`${speakerApi}/reminders/queue`, {
      data: queuePayload,
    });
    expect(replayResponse.ok()).toBe(true);
    const replayBody = (await replayResponse.json()) as { data: ReminderQueueResult };
    expect(replayBody.data).toMatchObject({
      sentCount: 0,
      failedCount: 0,
      duplicateCount: 2,
    });
    expect(replayBody.data.receipts.every((receipt) => receipt.status === "duplicate")).toBe(true);

    const changedSnapshotFingerprint = `${preview.snapshotFingerprint === "0".repeat(64) ? "1" : "0"}${preview.snapshotFingerprint.slice(1)}`;
    const staleSnapshotResponse = await page.request.post(`${speakerApi}/reminders/queue`, {
      data: {
        ...queuePayload,
        snapshotFingerprint: changedSnapshotFingerprint,
      },
    });
    expect(staleSnapshotResponse.status()).toBe(409);
    const storedRetryPreviewResponse = await page.request.post(`${speakerApi}/reminders/preview`, {
      data: {
        taskIds,
        recipientIds,
        idempotencyKey: queuePayload.idempotencyKey,
      },
    });
    expect(storedRetryPreviewResponse.ok()).toBe(true);
    const storedRetryPreview = (
      (await storedRetryPreviewResponse.json()) as { data: ReminderPreview }
    ).data;
    expect(storedRetryPreview.snapshotFingerprint).toBe(preview.snapshotFingerprint);
    expect(
      storedRetryPreview.recipients.flatMap((recipient) =>
        recipient.tasks.map((task) => task.title),
      ),
    ).toEqual(expect.arrayContaining(["QA reminder artifact A", "QA reminder artifact B"]));

    const conflictResponse = await page.request.post(`${speakerApi}/reminders/queue`, {
      data: {
        ...queuePayload,
        taskIds: [taskIds[0]],
        recipientIds: [recipientIds[0]],
      },
    });
    expect(conflictResponse.status()).toBe(409);
    const missingKeyResponse = await page.request.post(`${speakerApi}/reminders/queue`, {
      data: { taskIds, recipientIds, snapshotFingerprint: preview.snapshotFingerprint },
    });
    expect(missingKeyResponse.status()).toBe(400);
  });
});
