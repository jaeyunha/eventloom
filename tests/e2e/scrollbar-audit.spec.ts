import type { Page } from "@playwright/test";
import { type E2eRole, expect, test } from "./fixtures/auth";
import { installPortalApi } from "./fixtures/portal-api";

interface WorkspaceSurface {
  readonly name: string;
  readonly role: E2eRole;
  readonly route: string;
  readonly heading: string;
  readonly usesPortalFixture?: boolean;
}

const workspaceSurfaces: readonly WorkspaceSurface[] = [
  {
    name: "organizer",
    role: "organizer",
    route: "/admin/organizations/local-organization",
    heading: "Organization overview",
  },
  {
    name: "participant",
    role: "speaker",
    route: "/portal?event=event-evaluator",
    heading: "My events",
    usesPortalFixture: true,
  },
  {
    name: "reviewer",
    role: "reviewer",
    route: "/review",
    heading: "Reviewer queue",
  },
  {
    name: "public",
    role: "submitter",
    route: "/events",
    heading: "Find an event, then choose where you want to go.",
  },
];

interface ScrollbarFinding {
  route: string;
  state: string;
  element: string;
  overflowX: string;
  overflowY: string;
  horizontalOverflow: number;
  verticalOverflow: number;
}

async function accidentalCrossAxisScrollbars(
  page: Page,
  route: string,
  state: string,
): Promise<ScrollbarFinding[]> {
  return page.locator("body *").evaluateAll(
    (elements, context) =>
      elements
        .flatMap((element) => {
          if (!(element instanceof HTMLElement)) return [];
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden") return [];

          const horizontalOverflow = element.scrollWidth - element.clientWidth;
          const verticalOverflow = element.scrollHeight - element.clientHeight;
          const scrollsHorizontally = style.overflowX === "auto" || style.overflowX === "scroll";
          const scrollsVertically = style.overflowY === "auto" || style.overflowY === "scroll";
          const tinyVerticalCrossAxis =
            scrollsHorizontally &&
            scrollsVertically &&
            verticalOverflow > 0 &&
            verticalOverflow <= 16;
          const tinyHorizontalCrossAxis =
            scrollsHorizontally &&
            scrollsVertically &&
            horizontalOverflow > 0 &&
            horizontalOverflow <= 16;
          if (!tinyVerticalCrossAxis && !tinyHorizontalCrossAxis) return [];

          const slot = element.dataset.slot;
          const role = element.getAttribute("role");
          const label = element.getAttribute("aria-label");
          const identity = slot
            ? `[data-slot="${slot}"]`
            : role
              ? `[role="${role}"]`
              : element.id || element.tagName;
          return [
            {
              route: context.route,
              state: context.state,
              element: label ? `${identity}[aria-label="${label}"]` : identity,
              overflowX: style.overflowX,
              overflowY: style.overflowY,
              horizontalOverflow,
              verticalOverflow,
            },
          ];
        })
        .concat(
          document.documentElement.scrollWidth > document.documentElement.clientWidth
            ? [
                {
                  route: context.route,
                  state: context.state,
                  element: "document",
                  overflowX: "document",
                  overflowY: "document",
                  horizontalOverflow:
                    document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  verticalOverflow: 0,
                },
              ]
            : [],
        ),
    { route, state },
  );
}

for (const surface of workspaceSurfaces) {
  test.describe(surface.name, () => {
    test.use({ authRole: surface.role });

    for (const viewport of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "mobile", width: 390, height: 844 },
    ] as const) {
      test(`${viewport.name} workspace has no accidental cross-axis scrollbars`, async ({
        authSession,
        page,
      }) => {
        test.setTimeout(180_000);
        await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
        await page.setViewportSize(viewport);
        if (surface.usesPortalFixture) await installPortalApi(page, authSession);

        const response = await page.goto(surface.route, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `${surface.route} should load successfully`).toBeLessThan(400);
        expect(
          new URL(page.url()).pathname,
          `${surface.route} should not redirect to login`,
        ).not.toBe("/login");
        await expect(page.getByRole("heading", { level: 1, name: surface.heading })).toBeVisible();

        const findings = await accidentalCrossAxisScrollbars(page, page.url(), "initial");
        const tabs = page.getByRole("tab");
        for (let index = 0; index < (await tabs.count()); index += 1) {
          const tab = tabs.nth(index);
          if (!(await tab.isVisible()) || (await tab.isDisabled())) continue;
          const usesRadixState = (await tab.getAttribute("data-state")) !== null;
          const usesAriaState = (await tab.getAttribute("aria-selected")) !== null;
          await tab.click();
          if (usesRadixState) {
            await expect(tab).toHaveAttribute("data-state", "active");
          } else if (usesAriaState) {
            await expect(tab).toHaveAttribute("aria-selected", "true");
          }
          findings.push(
            ...(await accidentalCrossAxisScrollbars(
              page,
              page.url(),
              (await tab.textContent())?.trim() || `tab-${index}`,
            )),
          );
        }

        const uniqueFindings = Array.from(
          new Map(
            findings.map((finding) => [
              [
                finding.route,
                finding.element,
                finding.overflowX,
                finding.overflowY,
                finding.horizontalOverflow,
                finding.verticalOverflow,
              ].join("|"),
              finding,
            ]),
          ).values(),
        );

        expect(uniqueFindings, JSON.stringify(uniqueFindings, null, 2)).toEqual([]);
      });
    }
  });
}
