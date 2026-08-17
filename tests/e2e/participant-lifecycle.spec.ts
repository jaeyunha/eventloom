import { expect, test } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const EVENT_ID = "demo-event";
const SESSION_COOKIE = "better-auth.session_token";
const CFP_PATH = `/cfp/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}`;

async function useLocalSession(
  context: import("@playwright/test").BrowserContext,
  token: "local-session" | "local-speaker-session",
): Promise<void> {
  await context.clearCookies();
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test.describe.configure({ mode: "serial" });

test("accepted-session co-speakers persist through the live organizer surface", async ({
  context,
  page,
}, testInfo) => {
  await useLocalSession(context, "local-session");
  await page.goto(`/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/sessions`);
  await expect(page.getByRole("heading", { level: 1, name: "Sessions" })).toBeVisible();
  const manageSpeakers = page.getByRole("link", { name: "Add or edit speakers" });
  await expect(manageSpeakers).toBeVisible();
  await expect(manageSpeakers).toHaveAttribute(
    "href",
    `/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/speakers`,
  );
  await manageSpeakers.click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/speakers$`),
  );
  await expect(page.getByRole("heading", { level: 1, name: "Speaker operations" })).toBeVisible();
  await page.getByRole("button", { name: "Add speaker" }).first().click();
  const addSpeaker = page.getByRole("dialog", { name: "Add speaker" });
  await addSpeaker.getByLabel("Name").fill("Lifecycle QA Co-speaker");
  await addSpeaker.getByLabel("Email").fill("lifecycle-co-speaker@example.test");
  await addSpeaker.getByRole("button", { name: "Save speaker" }).click();
  await expect(addSpeaker).toBeHidden();
  await expect(page.getByText("Lifecycle QA Co-speaker", { exact: true }).first()).toBeVisible();

  await page.goto(`/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/sessions`);
  const speakerAssignment = page.getByLabel("Lifecycle QA Co-speaker", { exact: true });
  await speakerAssignment.check();
  await page.getByRole("button", { name: "Save speaker assignments" }).click();
  const currentAssignments = page
    .getByRole("heading", { name: "Current assignments" })
    .locator("..");
  await expect(currentAssignments).toContainText("Lifecycle QA Co-speaker");
  await currentAssignments.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("accepted-session-co-speaker-added.png"),
  });

  await speakerAssignment.uncheck();
  await page.getByRole("button", { name: "Save speaker assignments" }).click();
  await expect(currentAssignments).not.toContainText("Lifecycle QA Co-speaker");
  await currentAssignments.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("accepted-session-co-speaker-revoked.png"),
  });
});

test("submitted proposal edits keep account and participant state on the live CFP", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await useLocalSession(context, "local-session");
  await page.goto(CFP_PATH);
  await page.getByRole("button", { name: "Continue →" }).click();
  await expect(page).toHaveURL(new RegExp(`${CFP_PATH}/account$`));

  await page.getByRole("button", { name: "Continue as applicant" }).click();
  await expect(page.getByLabel("Email address")).toHaveValue("organizer@local.eventloom.test");
  await expect(page.getByLabel("First name")).toHaveValue("Local");
  await expect(page.getByLabel("Last name")).toHaveValue("Organizer");
  await page.getByRole("checkbox", { name: /I agree to the Terms of Service/ }).check();
  await page.getByRole("button", { name: "Continue to proposal" }).click();
  await expect(page).toHaveURL(new RegExp(`${CFP_PATH}/submission$`));

  await page.getByLabel("Session title").fill("Lifecycle state survives proposal edits");
  await page
    .getByLabel("Abstract")
    .fill(
      "This proposal demonstrates that accepted account and participant state survive step-by-step edits.",
    );
  await page.getByRole("combobox", { name: "Format" }).click();
  await page.getByRole("option").first().click();
  await page.getByRole("combobox", { name: "Audience level" }).click();
  await page.getByRole("option").first().click();
  await page.getByRole("combobox", { name: "Program track" }).click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(page).toHaveURL(new RegExp(`${CFP_PATH}/participants$`));

  await expect(page.getByLabel("Email").first()).toHaveValue("organizer@local.eventloom.test");
  await page.getByRole("button", { name: "Add participant" }).click();
  await page.getByLabel("First name").nth(1).fill("Lifecycle");
  await page.getByLabel("Last name").nth(1).fill("Co-speaker");
  await page.getByLabel("Email").nth(1).fill("lifecycle-second@example.test");
  await page.getByRole("button", { name: "Continue to review →" }).click();
  await expect(page).toHaveURL(new RegExp(`${CFP_PATH}/review$`));
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${CFP_PATH}/complete$`));
  await expect(page.getByRole("button", { name: "Edit submission" })).toBeVisible();

  const editDraftLoaded = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/cfp/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/`) &&
      response.url().endsWith("/draft") &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Edit submission" }).click();
  await editDraftLoaded;
  await expect(page).toHaveURL(new RegExp(`${CFP_PATH}/submission$`));
  await page
    .getByLabel("Abstract")
    .fill(
      "This proposal demonstrates that accepted account and participant state survive step-by-step edits. Updated after submit.",
    );
  const participantsDraftLoaded = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/cfp/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/`) &&
      response.url().endsWith("/draft") &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Next step →" }).click();
  const participantsDraftResponse = await participantsDraftLoaded;
  const participantsDraft = (await participantsDraftResponse.json()) as {
    data: { participants: readonly { email: string }[] };
  };
  expect(participantsDraft.data.participants.map((participant) => participant.email)).toEqual([
    "organizer@local.eventloom.test",
    "lifecycle-second@example.test",
  ]);
  await expect(page).toHaveURL(new RegExp(`${CFP_PATH}/participants$`));
  await expect(
    page.getByText("Step 'account' must be completed before 'participant'."),
  ).toHaveCount(0);
  await expect(page.getByLabel("Email").first()).toHaveValue("organizer@local.eventloom.test");
  await expect(page.getByLabel("Email").nth(1)).toHaveValue("lifecycle-second@example.test");
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.getByLabel("Email").nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("proposal-edit-preserves-participants.png"),
  });

  await page.getByRole("button", { name: "Continue to review →" }).click();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${CFP_PATH}/complete$`));
  await page.getByRole("button", { name: "Edit submission" }).click();
  await expect(page.getByLabel("Abstract")).toContainText("Updated after submit.");
});
