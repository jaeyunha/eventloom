import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CalendarDays, ClipboardList, House, Settings, Users } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CollectionLayout,
  DesktopNavigation,
  EventContext,
  FormSection,
  MetadataList,
  MetadataRow,
  MobileBottomNavigation,
  ProgressSummary,
  StatusBadge,
  StickyActionBar,
  type WorkspaceNavigationItem,
  WorkspaceShell,
  WorkspaceState,
} from "./index";

const navigation: readonly WorkspaceNavigationItem[] = [
  { href: "/work", label: "Home", icon: House, current: true },
  { href: "/work/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/work/people", label: "People", icon: Users },
];

describe("shared workspace shell", () => {
  it("keeps scope, landmarks, skip navigation, and current navigation explicit", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceShell
        navigation={<DesktopNavigation ariaLabel="Reviewer navigation" items={navigation} />}
        mobileNavigation={<MobileBottomNavigation items={navigation} />}
        contextBar={
          <EventContext
            event="Open Source Summit 2026"
            organization="Open Events Foundation"
            metadata="Aug 18-21 · Berlin"
          />
        }
      >
        <h1>Review assignments</h1>
      </WorkspaceShell>,
    );

    expect(markup).toContain('href="#workspace-main"');
    expect(markup).toContain('aria-label="Reviewer navigation"');
    expect(markup).toContain('aria-label="Mobile navigation"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('id="workspace-main"');
    expect(markup).toContain("Open Events Foundation");
    expect(markup).toContain("Open Source Summit 2026");
  });

  it("moves overflow destinations into an accessible More sheet trigger", () => {
    const markup = renderToStaticMarkup(
      <MobileBottomNavigation
        items={navigation.slice(0, 2)}
        moreItems={[
          { href: "/work/calendar", label: "Calendar", icon: CalendarDays },
          { href: "/work/settings", label: "Settings", icon: Settings },
        ]}
      />,
    );

    expect(markup).toContain("More");
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('data-slot="sheet-trigger"');
  });
});

describe("shared workspace content", () => {
  it("renders semantic status and bounded progress with text equivalents", () => {
    const markup = renderToStaticMarkup(
      <ProgressSummary
        label="Reviews complete"
        value={7}
        max={10}
        detail="7 of 10 assigned reviews"
        status={<StatusBadge tone="warning">Due soon</StatusBadge>}
      />,
    );

    expect(markup).toContain("Reviews complete");
    expect(markup).toContain("7 of 10 assigned reviews");
    expect(markup).toContain('aria-valuemax="10"');
    expect(markup).toContain('aria-valuenow="7"');
    expect(markup).toContain('data-tone="warning"');
  });

  it("composes list-detail, compact metadata, form, state, and sticky actions", () => {
    const markup = renderToStaticMarkup(
      <>
        <CollectionLayout
          list={<button type="button">Proposal A</button>}
          listLabel="Proposals"
          detail={<article>Proposal detail</article>}
          detailLabel="Selected proposal"
          inspector={<aside>Review context</aside>}
        />
        <MetadataList aria-label="Proposal metadata">
          <MetadataRow label="Format" value="Talk" />
          <MetadataRow label="Track" value="Systems" />
        </MetadataList>
        <FormSection title="Scorecard" description="Score every required criterion.">
          <input aria-label="Audience impact" />
        </FormSection>
        <WorkspaceState
          variant="error"
          title="Assignments unavailable"
          description="Reload the queue to continue."
          action={<button type="button">Retry</button>}
        />
        <StickyActionBar summary="Draft saved" actions={<button type="submit">Submit</button>} />
      </>,
    );

    expect(markup).toContain('aria-label="Proposals"');
    expect(markup).toContain('aria-label="Selected proposal"');
    expect(markup).toContain("Proposal metadata");
    expect(markup).toContain("Scorecard");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Draft saved");
  });

  it("uses semantic tokens and explicit reduced-motion treatment", () => {
    const files = [
      "workspace-shell.module.css",
      "workspace-navigation.module.css",
      "workspace-content.module.css",
    ];
    const css = files
      .map((file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"))
      .join("\n");

    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toMatch(/\brgba?\(/u);
    expect(css).toContain("var(--background)");
    expect(css).toContain("var(--border)");
    expect(css).toContain("var(--ring)");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
