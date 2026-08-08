import type { ReactNode } from "react";
import styles from "./embed.module.css";
import type { EmbedTheme, PublishedEvent } from "./types";

export function EmbedFrame({
  children,
  event,
  eventSlug,
  theme,
  view,
}: Readonly<{
  children: ReactNode;
  event: PublishedEvent;
  eventSlug: string;
  theme: EmbedTheme;
  view: "agenda" | "speakers";
}>) {
  const themeQuery = theme === "auto" ? "" : `?theme=${theme}`;
  return (
    <div className={styles.embedRoot} data-theme={theme}>
      <a className={styles.skipLink} href="#embed-content">
        Skip to {view === "agenda" ? "agenda" : "speakers"}
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
          <a
            aria-current={view === "agenda" ? "page" : undefined}
            href={`/embed/${encodeURIComponent(eventSlug)}/agenda${themeQuery}`}
          >
            Agenda
          </a>
          <a
            aria-current={view === "speakers" ? "page" : undefined}
            href={`/embed/${encodeURIComponent(eventSlug)}/speakers${themeQuery}`}
          >
            Speakers
          </a>
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
