"use client";
import { Badge } from "../../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import styles from "../review-workspace.module.css";
import { ReviewNavigation } from "./evaluator-queue-review-navigation";
import { planStatusVariant } from "./model-plan-status-variant";
import { formatPlanStatus } from "./organizer-format-plan-status";
import { OrganizerAssignmentsPanel } from "./organizer-view-assignments-panel";
import type { OrganizerWorkspaceViewController } from "./organizer-view-controller";
import { OrganizerDecisionsPanel } from "./organizer-view-decisions-panel";
import { OrganizerOverviewPanel } from "./organizer-view-overview-panel";
import { OrganizerSetupPanel } from "./organizer-view-setup-panel";
export function OrganizerWorkspaceSurface({
  controller,
}: Readonly<{ controller: OrganizerWorkspaceViewController }>) {
  const { seed, organizationId, view, setView } = controller;
  const tabs = [
    ["overview", "Overview"],
    ["setup", "Setup"],
    ["assignments", "Assignments"],
    ["decisions", "Results"],
  ] as const;
  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>{seed.eventName} · organizer review</p>
          <h1>{seed.planName}</h1>
          <p className={styles.headerDescription}>
            Set up the plan, assign reviewers, track progress, and record final decisions.
          </p>
        </div>
        <div className={styles.headerSide}>
          <ReviewNavigation
            eventId={seed.eventId}
            mode="organizer"
            organizationId={organizationId}
            showPlanLink={false}
          />
          <Badge variant={planStatusVariant(seed.status)}>{formatPlanStatus(seed.status)}</Badge>
        </div>
      </header>
      <div id="review-content" tabIndex={-1}>
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as typeof view)}
          className={styles.workspaceTabs}
        >
          <TabsList
            className={styles.workspaceTabList}
            variant="line"
            aria-label="Review plan sections"
          >
            {tabs.map(([tabView, label]) => (
              <TabsTrigger
                id={`review-tab-${tabView}`}
                value={tabView}
                key={tabView}
                aria-controls={`review-panel-${tabView}`}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent
            id="review-panel-overview"
            aria-labelledby="review-tab-overview"
            value="overview"
            className={styles.tabPanel}
          >
            <OrganizerOverviewPanel controller={controller} />
          </TabsContent>
          <TabsContent
            id="review-panel-setup"
            aria-labelledby="review-tab-setup"
            value="setup"
            className={styles.tabPanel}
          >
            <OrganizerSetupPanel controller={controller} />
          </TabsContent>
          <TabsContent
            id="review-panel-assignments"
            aria-labelledby="review-tab-assignments"
            value="assignments"
            className={styles.tabPanel}
          >
            <OrganizerAssignmentsPanel controller={controller} />
          </TabsContent>
          <TabsContent
            id="review-panel-decisions"
            aria-labelledby="review-tab-decisions"
            value="decisions"
            className={styles.tabPanel}
          >
            <OrganizerDecisionsPanel controller={controller} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
