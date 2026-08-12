import type { ReactNode } from "react";
import styles from "./embed.module.css";
import type { EmbedDisplayField, EmbedLayout } from "./model";
import type { EmbedTheme, PublishedEvent } from "./types";

type EmbedView = "sessions" | "itinerary" | "agenda" | "speakers-list" | "speakers";

const embedViews: readonly Readonly<[EmbedView, string]>[] = [
  ["sessions", "Sessions"],
  ["speakers-list", "Speakers List"],
  ["agenda", "Agenda"],
  ["itinerary", "Itinerary"],
  ["speakers", "Speaker Gallery"],
];

export function EmbedFrame({
  children,
  event,
  eventSlug,
  theme,
  view,
  layout = null,
  accent = null,
  backgroundColor = null,
  textColor = null,
  tracks = [],
  displayFields = null,
}: Readonly<{
  children?: ReactNode;
  event: PublishedEvent;
  eventSlug: string;
  theme: EmbedTheme;
  view: EmbedView;
  layout?: EmbedLayout | null;
  accent?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  tracks?: readonly string[];
  displayFields?: readonly EmbedDisplayField[] | null;
}>) {
  void layout;
  void accent;
  void backgroundColor;
  void textColor;
  void tracks;
  void displayFields;
  const themeQuery = theme === "auto" ? "" : `?theme=${theme}`;
  const currentViewLabel = embedViews.find(([path]) => path === view)?.[1] ?? "program";
  return (
    <div className={styles.embedRoot} data-theme={theme}>
      <a className={styles.skipLink} href="#embed-content">
        Skip to {currentViewLabel.toLowerCase()}
      </a>
      <header className={styles.embedHeader}>
        <div className={styles.embedBar}>
          <span className={styles.embedBrand}>
            <span aria-hidden="true" className={styles.embedMark}>
              OS
            </span>
            <span className={styles.embedBrandName}>Open Sessionboard</span>
            <span className={styles.embedBrandSmall}>Published program</span>
          </span>
          <nav aria-label="Published event views">
            {embedViews.map(([path, label]) => (
              <a
                key={path}
                aria-current={view === path ? "page" : undefined}
                className={styles.embedNavLink}
                href={`/embed/${encodeURIComponent(eventSlug)}/${path}${themeQuery}`}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className={styles.embedMasthead}>
          <p className={styles.eyebrow}>Published program</p>
          <h1 className={styles.embedTitle}>{event.name}</h1>
          <p className={styles.embedSubtitle}>
            {event.venueName ? `${event.venueName} · ` : null}
            Times default to {event.timeZone}.
          </p>
        </div>
      </header>
      <main id="embed-content" className={styles.embedMain} tabIndex={-1}>
        {children}
      </main>
      <footer className={styles.embedFooter}>
        <span>Program powered by Open Sessionboard</span>
        <span>Published information only</span>
      </footer>
    </div>
  );
}

export function EmbedUnavailable({ message }: Readonly<{ message: string }>) {
  return (
    <main className={styles.unavailable}>
      <div aria-hidden="true" className={styles.unavailableMark}>
        OS
      </div>
      <h1>Program not available</h1>
      <p>{message}</p>
    </main>
  );
}
