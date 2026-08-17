import type { APIResponse } from "@playwright/test";
import { expect, test } from "./fixtures/auth";

const ORGANIZATION_ID = "local-organization";
const CRM_API = `/api/admin/organizations/${ORGANIZATION_ID}/crm`;

interface ContactEnvelope {
  readonly data: {
    readonly id: string;
    readonly displayName: string;
    readonly version: number;
    readonly tags: readonly string[];
    readonly customFields: Readonly<Record<string, unknown>>;
    readonly pipelineStage: string;
  };
}

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly details?: {
      readonly current?: ContactEnvelope["data"];
    };
  };
}

interface EventEnvelope {
  readonly data: readonly {
    readonly id: string;
    readonly name: string;
  }[];
}

async function contactData(response: APIResponse): Promise<ContactEnvelope["data"]> {
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as ContactEnvelope).data;
}

test.use({ authRole: "organizer" });

test("CRM retries real conflicts and preserves pipeline and event reach state", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const created = await contactData(
    await page.request.post(`${CRM_API}/contacts`, {
      data: {
        displayName: "Concurrency Contact",
        email: "crm-concurrency@example.test",
        company: "Eventloom QA",
        tags: ["speaker"],
      },
    }),
  );

  const competingWrites = await Promise.all([
    page.request.patch(`${CRM_API}/contacts/${created.id}`, {
      data: {
        expectedVersion: created.version,
        tags: ["speaker", "concurrency"],
      },
    }),
    page.request.patch(`${CRM_API}/contacts/${created.id}`, {
      data: {
        expectedVersion: created.version,
        customFields: { region: "west" },
      },
    }),
  ]);
  expect(competingWrites.map((response) => response.status()).sort()).toEqual([200, 409]);

  const winningResponse = competingWrites.find((response) => response.status() === 200);
  const conflictResponse = competingWrites.find((response) => response.status() === 409);
  expect(winningResponse).toBeDefined();
  expect(conflictResponse).toBeDefined();
  const winner = await contactData(winningResponse as APIResponse);
  const conflict = (await (conflictResponse as APIResponse).json()) as ErrorEnvelope;
  expect(conflict.error.details, JSON.stringify(conflict)).toBeDefined();
  expect(conflict).toMatchObject({
    error: {
      code: "CONFLICT",
      details: {
        current: {
          id: created.id,
        },
      },
    },
  });
  const refreshedAfterConflict = await contactData(
    await page.request.get(`${CRM_API}/contacts/${created.id}`),
  );
  expect(refreshedAfterConflict.version).toBe(winner.version);

  const retried = await contactData(
    await page.request.patch(`${CRM_API}/contacts/${created.id}`, {
      data: {
        expectedVersion: refreshedAfterConflict.version,
        tags: ["speaker", "concurrency"],
        customFields: { region: "west" },
      },
    }),
  );
  expect(retried).toMatchObject({
    version: 3,
    tags: ["concurrency", "speaker"],
    customFields: { region: "west" },
  });

  const eventsResponse = await page.request.get(
    `/api/admin/organizations/${ORGANIZATION_ID}/events`,
  );
  expect(eventsResponse.ok(), await eventsResponse.text()).toBe(true);
  const event = ((await eventsResponse.json()) as EventEnvelope).data[0];
  expect(event).toBeDefined();
  const eventKey = "crm-concurrency-event-reach";
  const projectionResponse = await page.request.post(`${CRM_API}/contacts/${created.id}/events`, {
    headers: { "idempotency-key": eventKey },
    data: {
      eventId: event?.id,
      role: "prospect",
      note: "Concurrency QA event reach",
      idempotencyKey: eventKey,
    },
  });
  expect(projectionResponse.ok(), await projectionResponse.text()).toBe(true);

  await page.goto(`/admin/organizations/${ORGANIZATION_ID}/crm`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Organization CRM" })).toBeVisible();
  const directoryRow = page.getByRole("row", { name: /Concurrency Contact/ });
  await expect(directoryRow).toBeVisible();
  await directoryRow.getByRole("button", { name: "Open" }).click();

  await page.getByLabel("Tags (comma-separated)").fill("speaker, concurrency, persisted");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText("Contact changes saved.")).toBeVisible();
  await page.reload();
  await page
    .getByRole("row", { name: /Concurrency Contact/ })
    .getByRole("button", {
      name: "Open",
    })
    .click();
  await expect(page.getByLabel("Tags (comma-separated)")).toHaveValue(
    "concurrency, persisted, speaker",
  );

  const beforeExternalWrite = await contactData(
    await page.request.get(`${CRM_API}/contacts/${created.id}`),
  );
  await contactData(
    await page.request.patch(`${CRM_API}/contacts/${created.id}`, {
      data: {
        expectedVersion: beforeExternalWrite.version,
        title: "Externally Updated",
      },
    }),
  );
  await page.getByLabel("Tags (comma-separated)").fill("speaker, concurrency, persisted, retry");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(
    page.getByText("The contact changed. Reload it before saving.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Externally Updated");
  await page
    .getByLabel("Tags (comma-separated)")
    .fill("speaker, concurrency, persisted, refreshed");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText("Contact changes saved.")).toBeVisible();

  await page.getByRole("button", { name: "+ Enroll contact" }).click();
  await page.getByLabel("Pipeline contact").selectOption({ label: "Concurrency Contact" });
  await page.getByLabel("Pipeline starting stage").selectOption("qualified");
  await page.getByLabel("Score (0–100, optional)").fill("85");
  await page.getByLabel("Rationale (optional)").fill("Strong platform-engineering track record.");
  await page.getByRole("button", { name: "Enroll in pipeline" }).click();
  await expect(
    page.getByText("Concurrency Contact enrolled in the qualified pipeline stage."),
  ).toBeVisible();

  await page.reload();
  await page
    .getByRole("row", { name: /Concurrency Contact/ })
    .getByRole("button", {
      name: "Open",
    })
    .click();
  await expect(page.getByText("pipelineScore", { exact: true })).toBeVisible();
  await expect(page.getByText("85", { exact: true })).toBeVisible();
  await expect(page.getByText("pipelineRationale", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Strong platform-engineering track record.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Previous stage: new/)).toBeVisible();
  await expect(page.getByText(/New stage: qualified/)).toBeVisible();
  await expect(page.getByText(/organizer@local\.eventloom\.test/)).toBeVisible();

  const pipelineHistoryBlock = page
    .getByRole("heading", { name: "Pipeline history" })
    .locator("..");
  await pipelineHistoryBlock.scrollIntoViewIfNeeded();
  const pipelineScreenshot = testInfo.outputPath("crm-pipeline-history.png");
  await pipelineHistoryBlock.screenshot({ path: pipelineScreenshot });
  await testInfo.attach("crm-pipeline-history", {
    path: pipelineScreenshot,
    contentType: "image/png",
  });

  const eventResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.ok() &&
      url.pathname.endsWith("/crm/contacts") &&
      url.searchParams.get("eventId") === event?.id
    );
  });
  const eventReach = page.getByRole("heading", { name: "Event reach" }).locator("..");
  const eventMetric = eventReach.getByRole("listitem").filter({ hasText: event?.name ?? "" });
  await eventMetric.getByRole("button", { name: /View contacts/ }).click();
  await eventResponse;
  const filteredDirectoryRow = page.getByRole("row", { name: /Concurrency Contact/ });
  await expect(filteredDirectoryRow).toBeVisible();
  const eventFilterStatus = page.getByText(`Directory filter set to event ${event?.id}.`);
  await expect(eventFilterStatus).toBeVisible();

  const eventMetricScreenshot = testInfo.outputPath("crm-event-reach-analytics.png");
  const eventReachHeading = page.getByRole("heading", { name: "Event reach" });
  const [eventHeadingBox, eventMetricBox] = await Promise.all([
    eventReachHeading.boundingBox(),
    eventMetric.boundingBox(),
  ]);
  if (eventHeadingBox === null || eventMetricBox === null)
    throw new Error("Event reach evidence is not visible.");
  const eventClipX = Math.min(eventHeadingBox.x, eventMetricBox.x);
  const eventClipY = Math.min(eventHeadingBox.y, eventMetricBox.y);
  const eventClipRight = Math.max(
    eventHeadingBox.x + eventHeadingBox.width,
    eventMetricBox.x + eventMetricBox.width,
  );
  const eventClipBottom = Math.max(
    eventHeadingBox.y + eventHeadingBox.height,
    eventMetricBox.y + eventMetricBox.height,
  );
  await page.screenshot({
    path: eventMetricScreenshot,
    clip: {
      x: eventClipX,
      y: eventClipY,
      width: eventClipRight - eventClipX,
      height: eventClipBottom - eventClipY,
    },
  });
  await testInfo.attach("crm-event-reach-analytics", {
    path: eventMetricScreenshot,
    contentType: "image/png",
  });

  await page.setViewportSize({ width: 1_280, height: 1_000 });
  await eventFilterStatus.scrollIntoViewIfNeeded();
  const eventFilterScreenshot = testInfo.outputPath("crm-event-reach-filter.png");
  await page.screenshot({ path: eventFilterScreenshot });
  await testInfo.attach("crm-event-reach-filter", {
    path: eventFilterScreenshot,
    contentType: "image/png",
  });
});
