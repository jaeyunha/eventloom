import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  type LucideIcon,
  MessagesSquare,
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
import type { EventOverviewData } from "./event-overview-data";
import {
  eventOverviewAttention,
  eventOverviewMetrics,
  eventOverviewPhases,
  formatOverviewDateRange,
  formatOverviewInstant,
} from "./event-overview-view-model";
import styles from "./event-overview-workspace.module.css";

const attentionIcons: Record<
  ReturnType<typeof eventOverviewAttention>[number]["kind"],
  LucideIcon
> = {
  submissions: FileText,
  reviews: ClipboardCheck,
  agenda: CalendarDays,
  conflicts: MessagesSquare,
};

function EventAttention({ data, base }: Readonly<{ data: EventOverviewData; base: string }>) {
  const items = eventOverviewAttention(data, base);
  return (
    <WorkspaceSurface description="Only live API state is shown here." title="Needs attention">
      <div className={styles.attentionList}>
        {items.length === 0 ? (
          <div className={styles.emptyAttention}>
            <CheckCircle2 aria-hidden="true" size={18} />
            <div>
              <strong>No immediate blockers</strong>
              <span>Submission and agenda data do not report an outstanding issue.</span>
            </div>
          </div>
        ) : (
          items.map((item) => {
            const Icon = attentionIcons[item.kind];
            return (
              <div className={styles.attentionItem} key={item.title}>
                <span className={styles.attentionIcon}>
                  <Icon aria-hidden="true" size={15} />
                </span>
                <div className={styles.attentionText}>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href={item.href}>
                    {item.action}
                    <ArrowRight aria-hidden="true" size={13} />
                  </Link>
                </Button>
              </div>
            );
          })
        )}
      </div>
    </WorkspaceSurface>
  );
}

function EventDetails({ data }: Readonly<{ data: EventOverviewData }>) {
  const details = [
    ["CFP opens", formatOverviewInstant(data.event.cfpSettings.opensAt, data.event.timeZone)],
    ["CFP closes", formatOverviewInstant(data.event.cfpSettings.closesAt, data.event.timeZone)],
    ["Event starts", formatOverviewInstant(data.event.startsAt, data.event.timeZone)],
    ["Event ends", formatOverviewInstant(data.event.endsAt, data.event.timeZone)],
  ];
  return (
    <WorkspaceSurface description="Authoritative event metadata." title="Event details">
      <div className={styles.milestoneList}>
        {details.map(([label, value]) => (
          <div className={styles.milestoneItem} key={label}>
            <CalendarDays aria-hidden="true" size={15} />
            <div className={styles.milestoneText}>
              <strong>{label}</strong>
              <span>{value}</span>
            </div>
          </div>
        ))}
      </div>
    </WorkspaceSurface>
  );
}

export function EventOverviewContent({
  data,
  organizationId,
  eventId,
}: Readonly<{
  data: EventOverviewData;
  organizationId: string;
  eventId: string;
}>) {
  const base = `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}`;
  const eventStatus = data.event.status.charAt(0).toUpperCase() + data.event.status.slice(1);
  return (
    <>
      <WorkspaceHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${base}/submissions`}>Open submissions</Link>
            </Button>
            <Button asChild>
              <Link href={`${base}/agenda`}>Open agenda</Link>
            </Button>
          </>
        }
        breadcrumb={
          <WorkspaceBreadcrumb>
            <Link href="/admin/events">Events</Link>
            <span>/</span>
            <span>{data.event.name}</span>
          </WorkspaceBreadcrumb>
        }
        description="Monitor the selected event using live submission and agenda data."
        eyebrow="Event workspace"
        metadata={
          <>
            <WorkspaceMetaItem icon={<CheckCircle2 aria-hidden="true" size={14} />}>
              {eventStatus}
            </WorkspaceMetaItem>
            <WorkspaceMetaItem icon={<CalendarDays aria-hidden="true" size={14} />}>
              {formatOverviewDateRange(data)}
            </WorkspaceMetaItem>
            <WorkspaceMetaItem>{data.event.timeZone}</WorkspaceMetaItem>
            <WorkspaceMetaItem>{data.event.venue ?? "Venue not set"}</WorkspaceMetaItem>
          </>
        }
        status={
          <StatusBadge tone={data.event.status === "active" ? "success" : "neutral"}>
            {eventStatus}
          </StatusBadge>
        }
        title={data.event.name}
      />

      <WorkspaceSurface aria-label="Event program progress" className={styles.phaseStrip}>
        {eventOverviewPhases(data, base).map((phase) => (
          <Link
            className={`${styles.phase} ${phase.done ? styles.phaseDone : styles.phaseActive}`}
            href={phase.href}
            key={phase.label}
          >
            <span className={styles.phaseLabel}>{phase.label}</span>
            <span className={styles.phaseMeta}>{phase.meta}</span>
            <span aria-hidden="true" className={styles.phaseProgress} />
          </Link>
        ))}
      </WorkspaceSurface>

      <div className={styles.body}>
        <div className={styles.main}>
          <EventAttention base={base} data={data} />
          <div className={styles.metricGrid}>
            {eventOverviewMetrics(data).map(([label, value]) => (
              <WorkspaceSurface className={styles.metric} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </WorkspaceSurface>
            ))}
          </div>
        </div>
        <aside className={styles.rail}>
          <EventDetails data={data} />
        </aside>
      </div>
    </>
  );
}
