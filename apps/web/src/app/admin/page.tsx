import Link from "next/link";
import styles from "../../features/admin/admin-shell.module.css";

const metrics = [
  {
    label: "Submissions",
    value: "128",
    detail: "Across 3 active events",
    trend: "+12% this week",
    icon: "▤",
  },
  {
    label: "Reviews pending",
    value: "74",
    detail: "12 reviewers have work queued",
    trend: "18 due today",
    icon: "◌",
  },
  {
    label: "Speaker tasks",
    value: "18",
    detail: "Due before the next milestone",
    trend: "3 need attention",
    icon: "✓",
  },
  {
    label: "Published sessions",
    value: "42",
    detail: "Summit 2026 program draft",
    trend: "82% scheduled",
    icon: "▥",
  },
] as const;

const tasks = [
  {
    title: "Close the Summit 2026 CFP",
    description: "The call closes tomorrow at 5:00 PM Pacific.",
    meta: "CFP · Due Aug 9",
    label: "Due soon",
    href: "/admin/events/summit-2026/cfp",
    critical: true,
  },
  {
    title: "Finish first-round review assignments",
    description: "12 reviewers still have at least one unassigned proposal.",
    meta: "Reviews · 74 pending",
    label: "Needs attention",
    href: "/admin/events/summit-2026/reviews",
    critical: false,
  },
  {
    title: "Send accepted-speaker checklist",
    description: "A reminder is ready for 8 accepted speakers.",
    meta: "Communications · Draft ready",
    label: "Ready",
    href: "/admin/events/summit-2026/integrations#communications",
    critical: false,
  },
] as const;

const quickLinks = [
  {
    title: "Review submissions",
    description: "Open the triage queue and assign reviewers.",
    href: "/admin/events/summit-2026/submissions",
  },
  {
    title: "Configure your CFP",
    description: "Check dates, limits, and form questions.",
    href: "/admin/events/summit-2026/cfp",
  },
  {
    title: "Shape the agenda",
    description: "Open the draft schedule and resolve conflicts.",
    href: "/admin/events/summit-2026/agenda",
  },
  {
    title: "Prepare communications",
    description: "Review decision and reminder templates.",
    href: "/admin/events/summit-2026/integrations#communications",
  },
] as const;

const reviewRounds = [
  {
    name: "Summit 2026 · Round one",
    meta: "128 submissions",
    count: "54 / 128",
    status: "In progress",
    pending: true,
  },
  {
    name: "Summit 2026 · Accessibility pass",
    meta: "Accepted proposals",
    count: "42 / 42",
    status: "Complete",
    pending: false,
  },
  {
    name: "Community meetup · Final check",
    meta: "24 submissions",
    count: "24 / 24",
    status: "Complete",
    pending: false,
  },
] as const;

const activity = [
  {
    event: "Summit 2026",
    action: "Maya Chen submitted a proposal",
    detail: "Designing calm systems for busy teams",
    time: "18 min ago",
  },
  {
    event: "Community meetup",
    action: "Round one review closed",
    detail: "24 of 24 reviews confirmed",
    time: "2 hr ago",
  },
  {
    event: "Summit 2026",
    action: "CFP welcome copy updated",
    detail: "Saved by Alex Rivera",
    time: "Yesterday",
  },
] as const;

export default function AdminOverviewPage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Saturday, August 8, 2026</p>
          <h1 className={styles.pageTitle}>Good morning, Alex.</h1>
          <p className={styles.pageDescription}>
            Keep your program moving. Here is the operational pulse across events, submissions, and
            speaker work.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/admin/events">
            View events
          </Link>
          <Link className={styles.primaryButton} href="/admin/events/summit-2026/cfp">
            Open Summit CFP <span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>

      <section className={styles.metricsGrid} aria-label="Operational metrics">
        {metrics.map((metric) => (
          <article className={styles.metricCard} key={metric.label}>
            <div className={styles.metricTop}>
              <span className={styles.metricIcon} aria-hidden="true">
                {metric.icon}
              </span>
              <span className={styles.metricTrend}>{metric.trend}</span>
            </div>
            <div>
              <span className={styles.metricLabel}>{metric.label}</span>
              <strong className={styles.metricValue}>{metric.value}</strong>
              <p className={styles.metricDetail}>{metric.detail}</p>
            </div>
          </article>
        ))}
      </section>

      <div className={styles.dashboardGrid}>
        <section className={styles.panel} aria-labelledby="tasks-title">
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Action queue</p>
              <h2 className={styles.panelTitle} id="tasks-title">
                Tasks that need you
              </h2>
            </div>
            <Link
              className={styles.panelLink}
              href="/admin/events/summit-2026/integrations#communications"
            >
              View activity <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={styles.panelContent}>
            <ul className={styles.taskList}>
              {tasks.map((task) => (
                <li
                  className={`${styles.taskItem} ${task.critical ? styles.taskItemCritical : ""}`}
                  key={task.title}
                >
                  <span className={styles.taskIcon} aria-hidden="true">
                    {task.critical ? "!" : "·"}
                  </span>
                  <div className={styles.taskContent}>
                    <h3 className={styles.taskTitle}>{task.title}</h3>
                    <p className={styles.taskDescription}>{task.description}</p>
                    <p className={styles.taskMeta}>{task.meta}</p>
                  </div>
                  <Link
                    className={`${styles.alertTag} ${task.critical ? styles.alertTagCritical : ""}`}
                    href={task.href}
                  >
                    {task.label}
                    <span className={styles.srOnly}>: {task.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="quick-links-title">
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Shortcuts</p>
              <h2 className={styles.panelTitle} id="quick-links-title">
                Keep moving
              </h2>
            </div>
          </div>
          <div className={styles.panelContent}>
            <ul className={styles.quickLinkList}>
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link className={styles.quickLinkItem} href={link.href}>
                    <span className={styles.quickLinkCopy}>
                      <span className={styles.quickLinkTitle}>{link.title}</span>
                      <span className={styles.quickLinkDescription}>{link.description}</span>
                    </span>
                    <span className={styles.quickLinkArrow} aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.widePanel}`} aria-labelledby="reviews-title">
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Review health</p>
              <h2 className={styles.panelTitle} id="reviews-title">
                Program review progress
              </h2>
            </div>
            <Link className={styles.panelLink} href="/admin/events/summit-2026/reviews">
              Open review plan <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={styles.panelContent}>
            <div className={styles.callout} role="status">
              <span className={styles.calloutIcon} aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Review coverage is on track for the August 14 decision meeting.</strong>
                <p>All accepted proposals have an accessibility pass. Round one is 42% complete.</p>
              </div>
            </div>
            <div className={styles.reviewList}>
              {reviewRounds.map((round) => (
                <div className={styles.reviewRow} key={round.name}>
                  <div>
                    <p className={styles.reviewName}>{round.name}</p>
                    <p className={styles.reviewMeta}>{round.meta}</p>
                  </div>
                  <span className={styles.reviewCount}>{round.count}</span>
                  <span
                    className={`${styles.reviewBadge} ${round.pending ? styles.reviewBadgePending : ""}`}
                  >
                    {round.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.widePanel}`} aria-labelledby="activity-title">
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Recent changes</p>
              <h2 className={styles.panelTitle} id="activity-title">
                Activity across your workspace
              </h2>
            </div>
            <Link className={styles.panelLink} href="/admin/events">
              All events <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.eventsTable}>
              <caption>Recent organizer activity</caption>
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Activity</th>
                  <th scope="col">Details</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((item) => (
                  <tr key={`${item.event}-${item.time}`}>
                    <td className={styles.eventNameCell}>{item.event}</td>
                    <td>{item.action}</td>
                    <td>{item.detail}</td>
                    <td>{item.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
