import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  MessagesSquare,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
  WorkspaceSurface,
} from "@/components/workspace/workspace-ui";
import styles from "./event-overview-workspace.module.css";

interface EventOverviewWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
}

function eventName(eventId: string): string {
  if (eventId === "demo-event") return "Open Sessionboard Conference";
  return eventId
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function EventOverviewWorkspace({ organizationId, eventId }: EventOverviewWorkspaceProps) {
  const base = `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}`;
  const name = eventName(eventId);
  const phases = [
    { label: "Intake", meta: "CFP and submissions", href: `${base}/submissions`, state: "done" },
    {
      label: "Review",
      meta: "Assignments and decisions",
      href: `${base}/reviews`,
      state: "active",
    },
    { label: "Program", meta: "Agenda and sessions", href: `${base}/agenda`, state: "next" },
    { label: "Speakers", meta: "Tasks and deliverables", href: `${base}/speakers`, state: "next" },
    { label: "Publish", meta: "Embeds and reporting", href: `${base}/embeds`, state: "next" },
  ] as const;
  const activity: ReadonlyArray<{
    icon: LucideIcon;
    title: string;
    detail: string;
  }> = [
    {
      icon: CheckCircle2,
      title: "Review round completed",
      detail: "All assigned scorecards are in · 18m ago",
    },
    {
      icon: Sparkles,
      title: "Agenda validation rerun",
      detail: "Two conflicts remain · 46m ago",
    },
    {
      icon: MessagesSquare,
      title: "Speaker reminder delivered",
      detail: "12 recipients · 2h ago",
    },
  ];

  return (
    <div className={styles.workspace}>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <span>Events</span>
            <span>/</span>
            <strong>{name}</strong>
          </WorkspaceBreadcrumb>
        }
        title={name}
        status={<StatusBadge tone="info">In review</StatusBadge>}
        description="Move the program from intake to a published agenda without losing decisions, ownership, or context."
        metadata={
          <>
            <WorkspaceMetaItem icon={<CalendarDays aria-hidden="true" size={14} />}>
              Sep 18, 2026
            </WorkspaceMetaItem>
            <WorkspaceMetaItem icon={<Clock3 aria-hidden="true" size={14} />}>
              America/Los_Angeles
            </WorkspaceMetaItem>
            <WorkspaceMetaItem icon={<Users aria-hidden="true" size={14} />}>
              3 program collaborators
            </WorkspaceMetaItem>
          </>
        }
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/settings`}>Event settings</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`${base}/submissions`}>
                Review submissions
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </>
        }
      />

      <WorkspaceSurface aria-label="Program phases">
        <nav className={styles.phaseStrip}>
          {phases.map((phase) => (
            <Link
              className={`${styles.phase} ${
                phase.state === "active"
                  ? styles.phaseActive
                  : phase.state === "done"
                    ? styles.phaseDone
                    : ""
              }`}
              href={phase.href}
              key={phase.label}
            >
              <span className={styles.phaseLabel}>{phase.label}</span>
              <span className={styles.phaseMeta}>{phase.meta}</span>
              <span className={styles.phaseProgress} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </WorkspaceSurface>

      <div className={styles.metricGrid}>
        {[
          ["Submissions", "42"],
          ["Awaiting decision", "8"],
          ["Accepted sessions", "12"],
          ["Schedule conflicts", "2"],
        ].map(([label, value]) => (
          <WorkspaceSurface className={styles.metric} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </WorkspaceSurface>
        ))}
      </div>

      <div className={styles.body}>
        <main className={styles.main}>
          <WorkspaceSurface
            title="Needs attention"
            description="Work that blocks a decision or the next program phase."
            actions={<StatusBadge tone="warning">3 open</StatusBadge>}
          >
            <div className={styles.attentionList}>
              {[
                {
                  icon: ClipboardCheck,
                  title: "Eight submissions need a final decision",
                  detail: "Committee review is complete; organizer decisions are still open.",
                  href: `${base}/submissions`,
                },
                {
                  icon: CalendarDays,
                  title: "Two speaker conflicts affect the draft agenda",
                  detail: "Resolve overlaps before the next published revision.",
                  href: `${base}/agenda`,
                },
                {
                  icon: FileText,
                  title: "Three accepted speakers have missing deliverables",
                  detail: "Headshots and session assets are due in 6 days.",
                  href: `${base}/deliverables`,
                },
              ].map((item) => (
                <div className={styles.attentionItem} key={item.title}>
                  <span className={styles.attentionIcon}>
                    <item.icon aria-hidden="true" size={15} />
                  </span>
                  <span className={styles.attentionText}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <Link className={styles.attentionLink} href={item.href} aria-label={item.title}>
                    <ArrowRight aria-hidden="true" size={15} />
                  </Link>
                </div>
              ))}
            </div>
          </WorkspaceSurface>

          <WorkspaceSurface title="Recent activity" description="The latest consequential changes.">
            <div className={styles.activityList}>
              {activity.map((item) => (
                <div className={styles.activityItem} key={item.title}>
                  <span className={styles.activityIcon}>
                    <item.icon aria-hidden="true" size={15} />
                  </span>
                  <span className={styles.activityText}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </WorkspaceSurface>
        </main>

        <aside className={styles.rail}>
          <WorkspaceSurface title="Upcoming milestones">
            <div className={styles.milestoneList}>
              {[
                ["Final decisions", "Aug 24", "8 submissions remain"],
                ["Speaker assets", "Aug 30", "3 speakers incomplete"],
                ["Agenda publish", "Sep 4", "Draft revision 3"],
              ].map(([title, date, detail]) => (
                <div className={styles.milestoneItem} key={title}>
                  <span className={styles.milestoneText}>
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </span>
                  <time className={styles.milestoneDate}>{date}</time>
                </div>
              ))}
            </div>
          </WorkspaceSurface>
        </aside>
      </div>
    </div>
  );
}
