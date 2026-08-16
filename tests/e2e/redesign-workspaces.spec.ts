import { expect, type Page, test } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const EVENT_ID = "demo-event";
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_TOKEN = "local-session";

const submissionsUrl = `/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/submissions`;
const submissionDetailUrl = `${submissionsUrl}/submission_local_1`;
const speakersUrl = `/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/speakers`;
const organizerReviewsUrl = `/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/reviews`;
const reviewerUrl = "/review";

const organizerSessionFixture = {
  session: {
    id: "organizer-session-e2e",
    userId: "organizer-e2e",
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
  user: {
    id: "organizer-e2e",
    email: "organizer@example.test",
    name: "Olivia Organizer",
    emailVerified: true,
  },
  memberships: [{ organizationId: ORGANIZATION_ID, role: "owner" }],
  speakerGrants: [],
};

const organizerEventFixture = {
  id: EVENT_ID,
  organizationId: ORGANIZATION_ID,
  slug: EVENT_ID,
  name: "Open Sessionboard Conference",
  status: "active",
  timeZone: "America/Los_Angeles",
  startsAt: "2026-09-18T16:00:00.000Z",
  endsAt: "2026-09-18T23:00:00.000Z",
  venue: "Eventloom Hall",
  cfpSettings: {
    enabled: true,
    opensAt: "2026-08-01T07:00:00.000Z",
    closesAt: "2026-09-15T07:00:00.000Z",
  },
  defaultCalendarSettings: {
    durationMinutes: 30,
    timeZone: "America/Los_Angeles",
    location: "Eventloom Hall",
  },
  version: 1,
  createdAt: "2026-08-08T12:00:00.000Z",
  updatedAt: "2026-08-08T12:00:00.000Z",
  createdBy: "organizer-e2e",
  updatedBy: "organizer-e2e",
};

const speakerRosterFixture = {
  organizationId: ORGANIZATION_ID,
  eventId: EVENT_ID,
  speakers: [
    {
      participantId: "speaker-e2e",
      eventId: EVENT_ID,
      displayName: "Avery Morgan",
      email: "avery@example.test",
      jobTitle: "Program lead",
      company: "Community Systems Lab",
      biography: "Avery coordinates community programs and speaker onboarding.",
      socialLinks: {},
      travelLogistics: {
        travelRequired: false,
        arrivalAt: null,
        departureAt: null,
        accommodation: "",
        dietaryRequirements: "",
        accessibilityNeeds: "",
        travelNotes: "",
      },
      headshotAssetId: null,
      status: "accepted",
      sessions: [
        {
          submissionId: "speaker-e2e-submission",
          title: "Reliable community systems",
          status: "accepted",
        },
      ],
      taskSummary: { total: 1, completed: 0, overdue: 0 },
      assets: [],
      version: 1,
      updatedAt: "2026-08-08T12:00:00.000Z",
    },
  ],
};

async function installSpeakerWorkspaceFixture(
  page: Page,
  roster: typeof speakerRosterFixture = speakerRosterFixture,
): Promise<void> {
  await Promise.all([
    page.route("**/api/auth/get-session", async (route) => {
      await route.fulfill({ json: organizerSessionFixture });
    }),
    page.route(`**/api/admin/organizations/${ORGANIZATION_ID}/events`, async (route) => {
      await route.fulfill({ json: { data: [organizerEventFixture] } });
    }),
    page.route(
      `**/api/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/speakers`,
      async (route) => {
        await route.fulfill({ json: { data: roster } });
      },
    ),
  ]);
}

function buttonHeight(element: HTMLElement): number {
  return element.getBoundingClientRect().height;
}

function textContrastRatio(element: HTMLElement): number {
  const toSrgb = (value: string): readonly [number, number, number] => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (context === null) return [0, 0, 0];
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return [red ?? 0, green ?? 0, blue ?? 0];
  };
  const relativeLuminance = (color: readonly [number, number, number]): number => {
    const [red, green, blue] = color.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  };

  let backgroundElement: HTMLElement | null = element;
  let backgroundColor = "rgb(255, 255, 255)";
  while (backgroundElement) {
    const candidate = getComputedStyle(backgroundElement).backgroundColor;
    if (candidate !== "rgba(0, 0, 0, 0)" && candidate !== "transparent") {
      backgroundColor = candidate;
      break;
    }
    backgroundElement = backgroundElement.parentElement;
  }

  const foregroundLuminance = relativeLuminance(toSrgb(getComputedStyle(element).color));
  const backgroundLuminance = relativeLuminance(toSrgb(backgroundColor));
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: SESSION_TOKEN,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: SESSION_TOKEN, userId: "user-organizer-e2e" },
        user: {
          id: "user-organizer-e2e",
          email: "jaeyunha0317@gmail.com",
          name: "Olivia Organizer",
        },
        memberships: [{ organizationId: ORGANIZATION_ID, role: "owner" }],
        speakerGrants: [],
      }),
    });
  });
  await context.route(`**/api/admin/organizations/${ORGANIZATION_ID}/events`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: EVENT_ID, name: "Eventloom Demo", slug: EVENT_ID }],
      }),
    });
  });
});

test("keeps capability-derived account workspaces usable on desktop and mobile", async ({
  page,
}, testInfo) => {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: { id: "session-1" },
        user: { id: "user-1", email: "casey@example.com", name: "Casey Morgan" },
        memberships: [
          { organizationId: "org-a", role: "owner" },
          { organizationId: "org-b", role: "reviewer" },
        ],
      },
    });
  });
  await page.route("**/api/admin/organizations/org-a/members/organizations", async (route) => {
    await route.fulfill({
      json: {
        data: [
          { organizationId: "org-a", name: "Civic Design Guild" },
          { organizationId: "org-b", name: "Open Research Network" },
        ],
      },
    });
  });
  await page.route("**/api/admin/evaluations/reviewer/workspace", async (route) => {
    await route.fulfill({
      json: {
        data: {
          assignments: [
            {
              assignment: { status: "assigned" },
              plan: { eventName: "Research Exchange 2027" },
            },
          ],
        },
      },
    });
  });
  await page.route("**/api/speaker/portal/contexts", async (route) => {
    await route.fulfill({
      json: {
        data: [
          {
            id: "context-1",
            eventId: "event-1",
            name: "Human-Centered Summit",
            capabilities: ["submission-edit"],
            submissionIds: ["submission-1"],
            participantIds: [],
          },
        ],
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/work");

  await expect(page.getByRole("heading", { name: "Where do you want to work?" })).toBeVisible();
  const organizerCard = page.locator('[data-workspace="organizer"]');
  const reviewerCard = page.locator('[data-workspace="reviewer"]');
  const participantCard = page.locator('[data-workspace="participant"]');
  const workspaceLink = organizerCard.getByRole("link", { name: "Manage events" });
  await expect(organizerCard).toBeVisible();
  await expect(reviewerCard.getByRole("link", { name: "Review assignments" })).toBeVisible();
  await expect(participantCard.getByRole("link", { name: "View my proposals" })).toBeVisible();
  await expect(workspaceLink).toHaveAttribute("href", "/admin");
  expect(await workspaceLink.evaluate(buttonHeight)).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: testInfo.outputPath("account-hub-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Where do you want to work?" })).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await workspaceLink.evaluate(buttonHeight)).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: testInfo.outputPath("account-hub-mobile.png"),
    fullPage: true,
  });
});

test("keeps submission content legible in dark mode", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(submissionDetailUrl);

  const readableSubmissionText = [
    page.getByText("Submission content", { exact: true }),
    page.locator('section[aria-labelledby="abstract-heading"] > p'),
    page.locator('section[aria-labelledby="timeline-heading"] ol p').first(),
  ];
  await expect(page.locator("html")).toHaveClass(/dark/);
  for (const text of readableSubmissionText) {
    await expect(text).toBeVisible();
    expect(await text.evaluate(textContrastRatio)).toBeGreaterThanOrEqual(4.5);
  }
  await page.screenshot({
    path: testInfo.outputPath("submission-dark-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileAbstract = page.locator('section[aria-labelledby="abstract-heading"] > p');
  await expect(mobileAbstract).toBeVisible();
  await mobileAbstract.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("submission-dark-mobile.png"),
  });
});

test("submission queue keeps the dense table visible beside the selected review", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const warmedDetailRoute = await page.request.get(submissionDetailUrl);
  expect(warmedDetailRoute.ok()).toBe(true);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "boundary", width: 1240, height: 1000 },
    { name: "tablet", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(submissionsUrl);
    await expect(page.getByRole("heading", { level: 1, name: "Submissions" })).toBeVisible({
      timeout: 15_000,
    });

    const queue = page.getByRole("table", {
      name: /Submissions for /,
    });
    await expect(
      page.getByRole("navigation", { name: "Filter submissions by status" }),
    ).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Filter by status" })).toBeVisible();
    await expect(queue).toBeVisible();

    const firstSubmission = queue.getByRole("link").first();
    await expect(firstSubmission).toBeVisible();
    await expect(firstSubmission).toHaveAttribute("href", submissionDetailUrl);
    await Promise.all([page.waitForURL(submissionDetailUrl), firstSubmission.click()]);

    await expect(page.locator('[data-layout="submission-review-desk"]')).toBeVisible();
    await expect(page.getByLabel("Submission review panel")).toBeVisible();
    await expect(queue.locator('tr[aria-current="page"]')).toHaveCount(1);

    if (viewport.name === "desktop") {
      const queueScrollRegion = page.locator('[data-scroll-region="submission-queue"]');
      const detailScrollRegion = page.locator('[data-scroll-region="submission-detail"]');
      await expect(queueScrollRegion).toBeVisible();
      await expect(detailScrollRegion).toBeVisible();

      const pageScrollBefore = await page.evaluate(() => window.scrollY);
      const scrollState = await Promise.all(
        [queueScrollRegion, detailScrollRegion].map((region) =>
          region.evaluate((element) => {
            const initial = element.scrollTop;
            element.scrollTop = element.scrollHeight;
            return {
              clientHeight: element.clientHeight,
              initial,
              overflowY: getComputedStyle(element).overflowY,
              scrollHeight: element.scrollHeight,
              scrolled: element.scrollTop,
            };
          }),
        ),
      );

      for (const region of scrollState) {
        expect(region.overflowY).toBe("auto");
        expect(region.scrollHeight).toBeGreaterThan(region.clientHeight);
        expect(region.scrolled).toBeGreaterThan(region.initial);
      }
      expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
      await Promise.all(
        [queueScrollRegion, detailScrollRegion].map((region) =>
          region.evaluate((element) => {
            element.scrollTop = 0;
          }),
        ),
      );
    }

    const filterOverflow = await page
      .getByRole("group", { name: "Submission filters" })
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
    expect(filterOverflow.scrollWidth).toBeLessThanOrEqual(filterOverflow.clientWidth);

    if (viewport.name === "desktop") {
      const filterBounds = await page
        .getByRole("group", { name: "Submission filters" })
        .boundingBox();
      const formatBounds = await page
        .getByRole("combobox", { name: "Filter by format" })
        .boundingBox();

      expect(filterBounds).not.toBeNull();
      expect(formatBounds).not.toBeNull();
      const filterRight = (filterBounds?.x ?? 0) + (filterBounds?.width ?? 0);
      expect((formatBounds?.x ?? 0) + (formatBounds?.width ?? 0)).toBeLessThanOrEqual(
        filterRight + 1,
      );
    }

    await expect(page.getByRole("button", { name: "Clear" })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Filter by status" }).click();
    await page.getByRole("option", { name: "Submitted" }).click();
    await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();

    if (viewport.name !== "desktop") {
      const queueBounds = await queue.boundingBox();
      const reviewBounds = await page.getByLabel("Submission review panel").boundingBox();

      expect(queueBounds).not.toBeNull();
      expect(reviewBounds).not.toBeNull();
      expect(reviewBounds?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(queueBounds?.y ?? 0);
    }

    if (viewport.name === "mobile") {
      const listCard = page.locator("#submission-list-card");
      const summaryBounds = await listCard
        .locator("p")
        .filter({ hasText: /\d+ of \d+/ })
        .first()
        .boundingBox();
      const searchBounds = await page.getByRole("searchbox", { name: "Search" }).boundingBox();

      expect(summaryBounds).not.toBeNull();
      expect(searchBounds).not.toBeNull();
      expect(
        (searchBounds?.y ?? Number.POSITIVE_INFINITY) -
          ((summaryBounds?.y ?? 0) + (summaryBounds?.height ?? 0)),
      ).toBeLessThanOrEqual(48);
    }

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.screenshot({
      path: testInfo.outputPath(`submissions-review-${viewport.name}.png`),
    });
  }
});

test("speaker workspace presents the roster as a compact master-detail table", async ({
  page,
}, testInfo) => {
  await installSpeakerWorkspaceFixture(page);
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(speakersUrl);

    const roster = page.getByRole("table", { name: "Event speaker roster" });
    await expect(roster).toBeVisible();
    await expect(roster.getByRole("columnheader", { name: "Speaker" })).toBeVisible();
    await expect(roster.getByRole("columnheader", { name: "Status" })).toBeVisible();
    if (viewport.name === "desktop") {
      await expect(roster.getByRole("columnheader", { name: "Sessions" })).toBeVisible();
      await expect(roster.getByRole("columnheader", { name: "Tasks" })).toBeVisible();
      await expect(roster.getByRole("columnheader", { name: "Action" })).toBeVisible();
    } else if (viewport.name === "tablet") {
      await expect(roster.getByRole("columnheader", { name: "Sessions" })).toBeVisible();
      await expect(roster.getByRole("columnheader", { name: "Tasks" })).toBeHidden();
      await expect(roster.getByRole("columnheader", { name: "Action" })).toBeHidden();
    } else {
      await expect(roster.getByRole("columnheader", { name: "Sessions" })).toBeHidden();
      await expect(roster.getByRole("columnheader", { name: "Tasks" })).toBeHidden();
      await expect(roster.getByRole("columnheader", { name: "Action" })).toBeHidden();
    }
    await expect(page.locator('[aria-labelledby="speaker-detail-heading"]')).toBeVisible();

    if (viewport.name === "tablet") {
      const titleBounds = await page
        .getByRole("heading", { level: 1, name: "Speaker operations" })
        .boundingBox();
      expect(titleBounds).not.toBeNull();
      expect(titleBounds?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(60);
    }

    if (viewport.name === "mobile") {
      const searchBounds = await page
        .getByRole("textbox", { name: "Search speakers" })
        .boundingBox();
      const filterBounds = await page.getByRole("button", { name: "Filters" }).boundingBox();

      expect(searchBounds).not.toBeNull();
      expect(filterBounds).not.toBeNull();
      expect(
        (filterBounds?.y ?? 0) - ((searchBounds?.y ?? 0) + (searchBounds?.height ?? 0)),
      ).toBeLessThanOrEqual(24);
    }

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);

    await page.screenshot({
      path: testInfo.outputPath(`speakers-master-detail-${viewport.name}.png`),
    });
  }
});

test("speaker workspace replaces empty controls with guided next steps", async ({
  page,
}, testInfo) => {
  await installSpeakerWorkspaceFixture(page, { ...speakerRosterFixture, speakers: [] });
  await page.setViewportSize({ width: 1728, height: 1000 });
  await page.goto(speakersUrl);

  const heading = page.getByRole("heading", { level: 1, name: "Speaker operations" });
  await expect(heading).toBeVisible();
  const workspaceWidth = await heading.evaluate(
    (element) => element.closest("header")?.parentElement?.getBoundingClientRect().width ?? 0,
  );
  expect(workspaceWidth).toBeGreaterThan(0);
  expect(workspaceWidth).toBeLessThanOrEqual(1216);

  const rosterView = page.locator("#roster-view");
  await expect(rosterView.locator('[data-slot="empty"]')).toHaveCount(1);
  await expect(rosterView.getByRole("button", { name: "Add speaker" })).toBeVisible();
  await expect(rosterView.getByRole("button", { name: "Import CSV" })).toBeVisible();
  await expect(rosterView.getByRole("textbox", { name: "Search speakers" })).toHaveCount(0);
  await expect(rosterView.getByText("Select a speaker", { exact: true })).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath("speakers-first-run-desktop.png"),
  });

  await page.getByRole("tab", { name: "Onboarding" }).click();
  await expect(page.locator("#tasks-heading")).toHaveText("Speaker onboarding");
  await expect(page.locator("#tasks-view").locator('[data-slot="empty"]')).toHaveCount(1);
  await expect(page.locator("#task-title")).toHaveCount(0);

  await page.getByRole("tab", { name: "Email" }).click();
  await expect(page.locator("#email-view").locator('[data-slot="empty"]')).toHaveCount(1);
  await expect(page.locator("#email-template-name")).toHaveCount(0);
});

test("speaker email waits for an explicit roster selection", async ({ page }) => {
  await installSpeakerWorkspaceFixture(page);
  await page.goto(speakersUrl);

  await page.getByRole("tab", { name: "Email" }).click();
  await expect(page.locator("#email-view").locator('[data-slot="empty-title"]')).toHaveText(
    "Choose recipients",
  );
  await expect(page.locator("#email-template-name")).toHaveCount(0);

  await page.getByRole("tab", { name: "Roster" }).click();
  await page.getByRole("checkbox", { name: "Select Avery Morgan" }).click();
  await page.getByRole("tab", { name: "Email" }).click();
  await expect(page.locator("#email-template-name")).toBeVisible();
});

test("speaker workspace reflows at 320px with 200% text zoom", async ({ page }) => {
  await installSpeakerWorkspaceFixture(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(speakersUrl);
  await expect(page.locator('[aria-labelledby="speaker-detail-heading"]')).toBeVisible();

  await page.locator("html").evaluate(async (element) => {
    await new Promise<void>((resolve, reject) => {
      const root = document.documentElement;
      const body = document.body;
      let animationFrame = 0;
      let lastSignature = "";
      let stableFrames = 0;
      const observer = new ResizeObserver(() => {
        stableFrames = 0;
      });
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        cancelAnimationFrame(animationFrame);
        reject(new Error("Text-zoom layout did not settle."));
      }, 2_000);
      const checkLayout = () => {
        const signature = [
          root.clientWidth,
          root.scrollWidth,
          body.clientWidth,
          body.scrollWidth,
        ].join(":");
        if (signature === lastSignature) {
          stableFrames += 1;
        } else {
          lastSignature = signature;
          stableFrames = 0;
        }
        if (stableFrames >= 4) {
          window.clearTimeout(timeout);
          observer.disconnect();
          resolve();
          return;
        }
        animationFrame = requestAnimationFrame(checkLayout);
      };
      observer.observe(root);
      observer.observe(body);
      element.style.fontSize = "200%";
      animationFrame = requestAnimationFrame(checkLayout);
    });
  });

  const layout = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    mainCount: document.querySelectorAll("main").length,
    viewportWidth: document.documentElement.clientWidth,
    rootAncestors: (() => {
      const root = document.querySelector<HTMLElement>(
        '[class*="speaker-workspace-module"][class*="workspace"]',
      );
      const ancestors = [];
      let element: HTMLElement | null = root;
      while (element && element !== document.documentElement) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        ancestors.push({
          className: element.className,
          display: style.display,
          left: Math.round(rect.left),
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
        element = element.parentElement;
      }
      return ancestors;
    })(),
    internalOverflows: Array.from(
      document.querySelectorAll<HTMLElement>('[aria-labelledby="speaker-detail-heading"] *'),
    )
      .map((element) => ({
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        tagName: element.tagName,
        text: element.textContent?.trim().slice(0, 100),
      }))
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .sort(
        (left, right) =>
          right.scrollWidth - right.clientWidth - (left.scrollWidth - left.clientWidth),
      )
      .slice(0, 12),
    surfaces: Array.from(document.querySelectorAll<HTMLElement>('[class*="speaker-workspace"]'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const ancestors = [];
        let ancestor: HTMLElement | null = element;
        while (ancestor && ancestor !== document.documentElement && ancestors.length < 6) {
          const ancestorRect = ancestor.getBoundingClientRect();
          const ancestorStyle = getComputedStyle(ancestor);
          ancestors.push({
            className: ancestor.className,
            left: Math.round(ancestorRect.left),
            paddingLeft: ancestorStyle.paddingLeft,
            paddingRight: ancestorStyle.paddingRight,
            right: Math.round(ancestorRect.right),
            width: Math.round(ancestorRect.width),
          });
          ancestor = ancestor.parentElement;
        }
        return {
          ancestors,
          className: element.className,
          display: style.display,
          gridTemplateColumns: style.gridTemplateColumns,
          minWidth: style.minWidth,
          right: Math.round(rect.right),
          scrollWidth: element.scrollWidth,
          width: Math.round(rect.width),
        };
      })
      .filter((element) => element.right > document.documentElement.clientWidth + 1),
    overflowing: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          className: element.className,
          containedByTableViewport: element.closest('[class*="speakerTableViewport"]') !== null,
          display: style.display,
          gridTemplateColumns: style.gridTemplateColumns,
          minWidth: style.minWidth,
          right: Math.round(rect.right),
          tagName: element.tagName,
          text: element.textContent?.trim().slice(0, 80),
          width: Math.round(rect.width),
        };
      })
      .filter(
        (element) =>
          (element.right > document.documentElement.clientWidth + 1 || element.right < -1) &&
          !element.containedByTableViewport,
      )
      .sort((left, right) => right.right - left.right)
      .slice(0, 12),
  }));

  const overflowMessage = JSON.stringify({
    overflowing: layout.overflowing.slice(0, 20),
    rootAncestors: layout.rootAncestors,
    surfaces: layout.surfaces.slice(0, 20),
  });
  expect(layout.bodyWidth, overflowMessage).toBeLessThanOrEqual(320);
  expect(layout.documentWidth, overflowMessage).toBeLessThanOrEqual(320);
  expect(layout.viewportWidth).toBe(320);
  expect(layout.mainCount).toBe(1);
});

test("reviewer queue opens one focused scorecard drawer without resizing assigned work", async ({
  context,
  page,
}, testInfo) => {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: "local-reviewer-session",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(reviewerUrl);
    await page.evaluate(() => window.scrollTo(0, 0));

    const queue = page.locator('nav[aria-label="Assigned reviews"]');
    const firstAction = queue.getByRole("button", { name: /Open scorecard/u }).first();
    const firstRow = queue.locator("li").first();
    const firstTitle = queue.getByRole("heading", { level: 3 }).first();
    const filterButton = queue.getByRole("button", { name: "Filter assigned reviews" });

    await expect(queue).toBeVisible();
    await expect(firstAction).toBeVisible();
    await expect(firstAction).toHaveText("Start review");
    await expect(filterButton).toBeVisible();
    await expect(queue.getByRole("group", { name: "Review status views" })).toHaveCount(0);
    await expect(queue).not.toContainText(/\bSUB(?:MISSION)?[-_]/iu);
    const columnHeadings = queue.locator('[data-reviewer-column-headings="true"]');
    await expect(columnHeadings).toHaveCount(1);
    if (viewport.name === "desktop") {
      await expect(columnHeadings).toBeVisible();
      await expect(columnHeadings.locator(":scope > span")).toHaveText([
        "Title",
        "Event / round",
        "Due",
        "Status",
        "",
      ]);
      const columnAlignment = await page.evaluate(() => {
        const headings = document.querySelector<HTMLElement>(
          '[data-reviewer-column-headings="true"]',
        );
        const row = document.querySelector<HTMLElement>('[data-reviewer-row-layout="summary"]');
        if (headings === null || row === null) return null;
        const names = ["title", "context", "due", "status"] as const;
        return {
          headingGrid: getComputedStyle(headings).gridTemplateColumns,
          rowGrid: getComputedStyle(row).gridTemplateColumns,
          offsets: names.map((name) => {
            const heading = headings.querySelector<HTMLElement>(`[data-reviewer-column="${name}"]`);
            const value = row.querySelector<HTMLElement>(`[data-reviewer-column="${name}"]`);
            if (heading === null || value === null) return Number.POSITIVE_INFINITY;
            return Math.abs(
              heading.getBoundingClientRect().left - value.getBoundingClientRect().left,
            );
          }),
        };
      });
      expect(columnAlignment).not.toBeNull();
      expect(columnAlignment?.headingGrid).toBe(columnAlignment?.rowGrid);
      expect(columnAlignment?.offsets.every((offset) => offset <= 1)).toBe(true);
    } else {
      await expect(columnHeadings).toBeHidden();
      const mobileAlignment = await firstRow.evaluate((row) => {
        const title = row.querySelector<HTMLElement>('[data-reviewer-column="title"]');
        const context = row.querySelector<HTMLElement>('[data-reviewer-column="context"]');
        if (title === null || context === null) return Number.POSITIVE_INFINITY;
        return Math.abs(title.getBoundingClientRect().left - context.getBoundingClientRect().left);
      });
      expect(mobileAlignment).toBeLessThanOrEqual(1);
    }
    const titleText = await firstTitle.textContent();
    const titleMetrics = await firstTitle.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        title: element.getAttribute("title"),
        whiteSpace: style.whiteSpace,
      };
    });
    expect(titleMetrics.title).toBe(titleText);
    expect(titleMetrics.overflow).toBe("hidden");
    expect(titleMetrics.textOverflow).toBe("ellipsis");
    expect(titleMetrics.whiteSpace).toBe("nowrap");
    const firstRowBox = await firstRow.boundingBox();
    expect(firstRowBox).not.toBeNull();
    expect(firstRowBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      viewport.name === "desktop" ? 48 : 116,
    );

    await page.screenshot({
      path: testInfo.outputPath(`reviewer-queue-${viewport.name}.png`),
      fullPage: false,
    });

    await filterButton.click();
    const filterMenu = page.getByLabel("Reviewer filters");
    await expect(filterMenu).toBeVisible();
    await expect(filterMenu.getByLabel("Status")).toBeVisible();
    await filterMenu.getByLabel("Status").selectOption("needs-review");
    await expect(filterMenu.getByLabel("Status")).toHaveValue("needs-review");
    await expect(filterButton).toHaveAccessibleName("Filter assigned reviews, 1 active");
    const filterMenuBox = await filterMenu.boundingBox();
    expect(filterMenuBox).not.toBeNull();
    expect(filterMenuBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: testInfo.outputPath(`reviewer-filters-${viewport.name}.png`),
      fullPage: false,
    });
    await filterMenu.getByLabel("Status").selectOption("all");
    await page.keyboard.press("Escape");
    await expect(filterMenu).toBeHidden();

    await firstAction.focus();
    await expect(firstAction).toBeFocused();
    const queueBeforeOpen = await queue.boundingBox();

    const actionMetrics = await firstAction.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        height: element.getBoundingClientRect().height,
        lineCount: range.getClientRects().length,
        whiteSpace: getComputedStyle(element).whiteSpace,
      };
    });
    expect(actionMetrics.height).toBeGreaterThanOrEqual(44);
    expect(actionMetrics.lineCount).toBe(1);
    expect(actionMetrics.whiteSpace).toBe("nowrap");

    const drawerSettled = page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            observer.disconnect();
            reject(new Error("Reviewer drawer transition did not finish."));
          }, 1_000);
          const finish = () => {
            window.clearTimeout(timeout);
            observer.disconnect();
            requestAnimationFrame(() => resolve());
          };
          const observer = new MutationObserver(() => {
            const drawer = document.querySelector<HTMLElement>('[data-slot="sheet-content"]');
            if (drawer === null) return;
            const style = getComputedStyle(drawer);
            if (style.transitionDuration === "0s" && style.animationDuration === "0s") {
              finish();
              return;
            }
            drawer.addEventListener("transitionend", finish, { once: true });
            drawer.addEventListener("animationend", finish, { once: true });
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }),
    );
    await firstAction.click();

    const scorecard = page.getByRole("dialog");
    const closeReview = scorecard.getByRole("button", { name: "Close review" });
    await expect(scorecard).toBeVisible();
    await drawerSettled;
    await expect(closeReview).toBeFocused();
    await expect(page.locator("#review-workspace")).toHaveCount(1);
    await expect(page.locator("#review-content")).toHaveCount(1);
    await expect(scorecard.getByRole("button", { name: "Submit review" })).toHaveCount(1);
    await expect(scorecard.getByText("Autosave ready", { exact: true })).toBeVisible();
    await expect(scorecard.getByRole("button", { name: "Save draft" })).toHaveCount(0);
    await expect(scorecard.getByRole("button", { name: "Declare conflict" })).toBeVisible();
    await expect(scorecard.getByRole("spinbutton", { name: /Human score/u })).toHaveCount(0);
    const scorecardScroll = scorecard.locator('[data-reviewer-scorecard-scroll="true"]');
    const scorecardFooter = scorecard.locator('[data-reviewer-scorecard-footer="true"]');
    await expect(scorecardScroll).toBeVisible();
    await expect(scorecardFooter).toBeVisible();
    const scorecardRegions = await Promise.all([
      scorecardScroll.boundingBox(),
      scorecardFooter.boundingBox(),
    ]);
    expect(scorecardRegions[0]).not.toBeNull();
    expect(scorecardRegions[1]).not.toBeNull();
    expect(scorecardRegions[0]?.y + (scorecardRegions[0]?.height ?? 0)).toBeLessThanOrEqual(
      (scorecardRegions[1]?.y ?? 0) + 1,
    );

    await expect(queue).toBeVisible();
    const queueAfterOpen = await queue.boundingBox();
    expect(queueAfterOpen?.width).toBe(queueBeforeOpen?.width);

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);

    const scorecardBox = await scorecard.boundingBox();
    expect(scorecardBox).not.toBeNull();
    expect(scorecardBox?.width ?? 0).toBeLessThanOrEqual(viewport.width);
    if (viewport.name === "desktop") {
      expect(scorecardBox?.width ?? 0).toBeGreaterThanOrEqual(608);
      expect(scorecardBox?.width ?? 0).toBeLessThanOrEqual(896);
    } else {
      expect(scorecardBox?.width ?? 0).toBeGreaterThanOrEqual(viewport.width - 1);
    }

    await page.screenshot({
      path: testInfo.outputPath(`reviewer-drawer-${viewport.name}.png`),
      fullPage: false,
    });

    await closeReview.click();
    await expect(scorecard).toBeHidden();
    await expect(firstAction).toBeFocused();

    await firstAction.click();
    await expect(scorecard).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(scorecard).toBeHidden();
    await expect(firstAction).toBeFocused();
  }
});

test("plan and rubric renders an open plan as a focused read-only workbench", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(organizerReviewsUrl);
    await page.getByRole("tab", { name: "Setup" }).click();

    const workbench = page.locator('[data-layout="plan-authoring-workbench"]');
    const summary = page.getByRole("complementary", { name: "Plan authoring summary" });
    await expect(workbench).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plan overview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review rounds" })).toBeVisible();
    await expect(summary).toBeVisible();
    await expect(summary.getByText(/Version \d+/u)).toBeVisible();
    await expect(page.getByText("Grading locked", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Plan name")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /dropdown options/u })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save authoring draft" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Create editable draft revision" }),
    ).toBeVisible();
    await expect(page.getByLabel("Overall review deadline")).toBeEnabled();

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);

    if (viewport.name === "mobile") {
      const tabLayout = await page.getByRole("tab").evaluateAll((tabs) => ({
        rightEdges: tabs.map((tab) => tab.getBoundingClientRect().right),
        viewportWidth: document.documentElement.clientWidth,
        tabListClientWidth: tabs[0]?.parentElement?.clientWidth ?? 0,
        tabListScrollWidth: tabs[0]?.parentElement?.scrollWidth ?? 0,
      }));
      expect(Math.max(...tabLayout.rightEdges)).toBeLessThanOrEqual(tabLayout.viewportWidth);
      expect(tabLayout.tabListScrollWidth).toBeLessThanOrEqual(tabLayout.tabListClientWidth);
    }

    if (viewport.name === "desktop") {
      const workbenchBox = await workbench.boundingBox();
      const summaryBox = await summary.boundingBox();
      expect(workbenchBox).not.toBeNull();
      expect(summaryBox).not.toBeNull();
      expect(summaryBox?.x ?? 0).toBeGreaterThan((workbenchBox?.x ?? 0) + 500);
    }

    await page.screenshot({
      path: testInfo.outputPath(`review-plan-authoring-${viewport.name}.png`),
      fullPage: true,
    });
  }
});

test("reviewers renders a bounded assignment index with one replacement editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(organizerReviewsUrl);

  const overviewTab = page.getByRole("tab", { name: "Overview" });
  const reviewersTab = page.getByRole("tab", { name: "Assignments" });
  const overviewTable = page.getByRole("table", {
    name: "Submission review progress, score, decision, and attention status.",
  });
  const firstManageReviewers = overviewTable
    .getByRole("button", { name: /^Manage reviewers for /u })
    .and(page.locator("button:enabled"))
    .first();

  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Setup" })).toBeVisible();
  await expect(reviewersTab).toBeVisible();
  await expect(page.getByRole("tab", { name: "Results" })).toBeVisible();
  await expect(overviewTable).toBeVisible();
  await expect(firstManageReviewers).toBeVisible();

  const targetRow = firstManageReviewers.locator("xpath=ancestor::tr");
  const targetSubmissionId = await targetRow.getAttribute("data-submission-id");
  const targetRoundName = await targetRow
    .locator("td")
    .first()
    .locator("span")
    .first()
    .textContent();
  expect(targetSubmissionId).toBeTruthy();
  expect(targetRoundName).toBeTruthy();

  const reviewersSelected = expect(reviewersTab).toHaveAttribute("aria-selected", "true");
  await firstManageReviewers.click();
  await reviewersSelected;
  await expect(page.getByRole("combobox", { name: "Round" })).toHaveValue(/.+/u);
  await expect(page.getByRole("combobox", { name: "Round" }).locator("option:checked")).toHaveText(
    targetRoundName ?? "",
  );
  await expect(page.getByRole("combobox", { name: "Submission" })).toHaveValue(
    targetSubmissionId ?? "",
  );

  const tabMetrics = await page.getByRole("tab").evaluateAll((tabs) =>
    tabs.map((tab) => ({
      label: tab.textContent,
      selected: tab.getAttribute("aria-selected") === "true",
      underlineOpacity: getComputedStyle(tab, "::after").opacity,
      height: tab.getBoundingClientRect().height,
    })),
  );
  expect(tabMetrics.find((tab) => tab.selected)?.label).toBe("Assignments");
  expect(tabMetrics.find((tab) => tab.selected)?.underlineOpacity).toBe("1");
  expect(
    tabMetrics.filter((tab) => !tab.selected).every((tab) => tab.underlineOpacity === "0"),
  ).toBe(true);
  expect(tabMetrics.every((tab) => tab.height >= 44)).toBe(true);

  const assignmentTable = page.getByRole("table", {
    name: "Active reviewer assignments and protected history",
  });
  const assignmentRows = assignmentTable.locator("tbody tr");
  const reviewerRows = page
    .getByRole("table", { name: "Reviewer completion by round" })
    .locator("tbody tr");

  await expect(page.getByRole("heading", { name: "Reviewer assignment history" })).toBeVisible();
  expect(await reviewerRows.count()).toBeLessThanOrEqual(10);
  expect(await assignmentRows.count()).toBeLessThanOrEqual(10);
  await expect(page.getByRole("combobox", { name: /Replacement reviewer/u })).toHaveCount(0);

  await assignmentRows
    .first()
    .getByRole("button", { name: /Manage assignment/u })
    .click();

  await expect(page.getByRole("combobox", { name: /Replacement reviewer/u })).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: /Replacement reason/u })).toHaveCount(1);

  const layout = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(layout.height).toBeLessThan(10_000);
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(organizerReviewsUrl);
  await page.getByRole("tab", { name: "Assignments" }).click();

  const mobileManageAction = page
    .getByRole("table", { name: "Active reviewer assignments and protected history" })
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: /Manage assignment/u });
  const mobileActionBox = await mobileManageAction.boundingBox();
  expect(mobileActionBox).not.toBeNull();
  expect((mobileActionBox?.x ?? 0) + (mobileActionBox?.width ?? 0)).toBeLessThanOrEqual(390);

  const mobileCompletionBox = await page
    .getByRole("table", { name: "Reviewer completion by round" })
    .locator("tbody tr")
    .first()
    .locator("td")
    .last()
    .boundingBox();
  expect(mobileCompletionBox).not.toBeNull();
  expect((mobileCompletionBox?.x ?? 0) + (mobileCompletionBox?.width ?? 0)).toBeLessThanOrEqual(
    390,
  );

  await page.getByRole("tab", { name: "Results" }).click();
  const tabsRoot = page.locator('[data-slot="tabs"]').first();
  const resultsHeadingBox = await page
    .getByRole("heading", { name: "Scores and decisions" })
    .boundingBox();
  expect(await tabsRoot.evaluate((element) => element.scrollLeft)).toBe(0);
  expect(resultsHeadingBox?.x ?? -1).toBeGreaterThanOrEqual(0);

  await page.getByRole("tab", { name: "Overview" }).click();
  const tabListBox = await page.locator('[data-slot="tabs-list"]').boundingBox();
  const overviewKickerBox = await page
    .getByRole("region", { name: "Review plan summary" })
    .boundingBox();
  expect(tabListBox).not.toBeNull();
  expect(overviewKickerBox).not.toBeNull();
  expect(overviewKickerBox?.y ?? 0).toBeGreaterThanOrEqual(
    (tabListBox?.y ?? 0) + (tabListBox?.height ?? 0) + 4,
  );
});
