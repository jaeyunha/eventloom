import type { ReactNode } from "react";
import styles from "./embed.module.css";
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
}: Readonly<{
  children?: ReactNode;
  event: PublishedEvent;
  eventSlug: string;
  theme: EmbedTheme;
  view: EmbedView;
}>) {
  const themeQuery = theme === "auto" ? "" : `?theme=${theme}`;
  const currentViewLabel = embedViews.find(([path]) => path === view)?.[1] ?? "program";
  return (
    <div className={styles.embedRoot} data-theme={theme}>
      <a className={styles.skipLink} href="#embed-content">
        Skip to {currentViewLabel.toLowerCase()}
      </a>
      <header className={styles.embedHeader}>
        <div>
          <p className={styles.eyebrow}>Published program</p>
          <h1>{event.name}</h1>
          <p>
            {event.venueName ? `${event.venueName} · ` : null}
            Times default to {event.timeZone}.
          </p>
        </div>
        <nav aria-label="Published event views">
          {embedViews.map(([path, label]) => (
            <a
              key={path}
              aria-current={view === path ? "page" : undefined}
              href={`/embed/${encodeURIComponent(eventSlug)}/${path}${themeQuery}`}
            >
              {label}
            </a>
          ))}
        </nav>
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
