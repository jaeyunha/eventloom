import { type APIResponse, expect, test } from "@playwright/test";

const organizationId = "local-organization";
const eventId = "demo-event";
const organizerCookie = "better-auth.session_token=local-session";
const eventPath = `/api/admin/organizations/${organizationId}/events/${eventId}`;
const publicAgendaPath = `/api/public/events/${eventId}/agenda.json`;

interface PublicAgenda {
  readonly revision: { readonly number: number };
  readonly entries: readonly {
    readonly sessionId: string;
    readonly title: string;
    readonly roomName: string;
    readonly trackIds: readonly string[];
  }[];
}

interface Session {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly contentStatus?: string;
  readonly roomId?: string;
}

interface Room {
  readonly id: string;
  readonly name: string;
  readonly version: number;
}

async function data<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

test("approved edits propagate to the existing embed and public feeds", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Expected the Playwright base URL.");
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: "local-session",
      url: baseURL,
    },
  ]);
  const request = page.context().request;
  const headers = { cookie: organizerCookie };
  const before = await data<PublicAgenda>(await request.get(publicAgendaPath));
  const publishedEntry = before.entries[0];
  if (publishedEntry === undefined) throw new Error("Expected a published session.");
  const sessionPath = `${eventPath}/sessions/${publishedEntry.sessionId}`;
  const session = await data<Session>(await request.get(sessionPath, { headers }));
  const approvedTitle = "Approved propagation title";
  const embedPath = `/embed/${eventId}/agenda`;

  await page.goto(embedPath);
  const existingEmbedUrl = page.url();
  await expect(page.getByText(publishedEntry.title, { exact: true }).first()).toBeVisible();

  const edited = await data<Session>(
    await request.patch(sessionPath, {
      headers,
      data: {
        expectedVersion: session.version,
        title: approvedTitle,
      },
    }),
  );
  expect(edited.contentStatus).toBe("Needs changes");
  expect((await data<PublicAgenda>(await request.get(publicAgendaPath))).revision.number).toBe(
    before.revision.number,
  );
  await page.reload();
  await expect(page.getByText(publishedEntry.title, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(approvedTitle, { exact: true })).toHaveCount(0);

  const approved = await data<Session>(
    await request.patch(sessionPath, {
      headers,
      data: {
        expectedVersion: edited.version,
        contentStatus: "Approved",
      },
    }),
  );
  const after = await data<PublicAgenda>(await request.get(publicAgendaPath));
  expect(after.revision.number).toBeGreaterThan(before.revision.number);
  expect(after.entries).toContainEqual(
    expect.objectContaining({ sessionId: session.id, title: approvedTitle }),
  );
  const iCal = await request.get(`/api/public/events/${eventId}/agenda.ics`);
  expect(iCal.ok()).toBe(true);
  expect(await iCal.text()).toContain(`SUMMARY:${approvedTitle}`);
  const speakers = await request.get(`/api/public/events/${eventId}/speakers`);
  expect(speakers.ok()).toBe(true);
  expect(await speakers.text()).toContain(approvedTitle);

  if (session.roomId === undefined) throw new Error("Expected a scheduled session room.");
  const roomPath = `${eventPath}/sessions/rooms/${session.roomId}`;
  const room = await data<Room>(await request.get(roomPath, { headers }));
  const approvedRoom = "Propagation Hall";
  await data<Room>(
    await request.patch(roomPath, {
      headers,
      data: {
        expectedVersion: room.version,
        name: approvedRoom,
      },
    }),
  );
  const afterRoom = await data<PublicAgenda>(await request.get(publicAgendaPath));
  expect(afterRoom.revision.number).toBeGreaterThan(after.revision.number);
  expect(afterRoom.entries).toContainEqual(
    expect.objectContaining({
      sessionId: session.id,
      title: approvedTitle,
      roomName: approvedRoom,
    }),
  );
  const roomIcal = await request.get(`/api/public/events/${eventId}/agenda.ics`);
  expect(await roomIcal.text()).toContain(`LOCATION:${approvedRoom}`);

  const approvedEntry = afterRoom.entries.find((entry) => entry.sessionId === session.id);
  const configuredTrackId = approvedEntry?.trackIds[0];
  if (configuredTrackId === undefined) throw new Error("Expected a stable published track ID.");
  await page.goto(`${embedPath}?trackIds=${encodeURIComponent(configuredTrackId)}`);
  await expect(page.getByText(approvedTitle, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(approvedRoom, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await page.goto(existingEmbedUrl);
  expect(page.url()).toBe(existingEmbedUrl);
  await expect(page.getByText(approvedTitle, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(approvedRoom, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();

  await page.goto(`/admin/organizations/${organizationId}/events/${eventId}/sessions`);
  await expect(page.getByText(approvedTitle, { exact: true }).first()).toBeVisible();
  await page.goto(`/admin/organizations/${organizationId}/events/${eventId}/agenda`);
  await expect(page.getByText(approvedTitle, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(approvedRoom, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await page.goto(`/admin/organizations/${organizationId}/events/${eventId}/embeds`);
  await page.getByLabel("Output format").click();
  await page.getByRole("option", { name: "XML" }).click();
  await expect(page.getByLabel("Embed code preview")).toHaveValue(/format="xml"/);
  await expect(page.getByLabel("Embed code preview")).toHaveValue(
    new RegExp(`/embed/${eventId}/agenda`),
  );

  const restored = await data<Session>(
    await request.post(`${sessionPath}/restore`, {
      headers,
      data: {
        expectedVersion: approved.version,
        version: session.version,
      },
    }),
  );
  expect((await data<PublicAgenda>(await request.get(publicAgendaPath))).revision.number).toBe(
    afterRoom.revision.number,
  );
  await data<Session>(
    await request.patch(sessionPath, {
      headers,
      data: {
        expectedVersion: restored.version,
        contentStatus: "Approved",
      },
    }),
  );
  const reverted = await data<PublicAgenda>(await request.get(publicAgendaPath));
  expect(reverted.revision.number).toBeGreaterThan(afterRoom.revision.number);
  expect(reverted.entries).toContainEqual(
    expect.objectContaining({ sessionId: session.id, title: publishedEntry.title }),
  );
  await page.goto(embedPath);
  expect(page.url()).toBe(existingEmbedUrl);
  await expect(page.getByText(publishedEntry.title, { exact: true }).first()).toBeVisible();
});
