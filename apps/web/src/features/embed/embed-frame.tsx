import type { CSSProperties, ReactNode } from "react";
import styles from "./embed.module.css";
import { type EmbedDisplayField, type EmbedLayout, serializeEmbedQuery } from "./model";
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
  const viewQuery = serializeEmbedQuery({
    theme,
    layout,
    displayFields,
    tracks,
    accent,
    backgroundColor,
    textColor,
  });
  const customProperties = {
    ...(accent
      ? {
          "--pub-accent": accent,
          "--pub-accent-strong": accent,
          "--pub-accent-soft": `color-mix(in srgb, ${accent} 12%, transparent)`,
        }
      : {}),
    ...(backgroundColor
      ? {
          "--pub-canvas": backgroundColor,
          "--pub-surface": `color-mix(in srgb, ${backgroundColor} 92%, white)`,
          "--pub-surface-muted": `color-mix(in srgb, ${backgroundColor} 88%, black)`,
          "--pub-surface-sunken": `color-mix(in srgb, ${backgroundColor} 82%, black)`,
        }
      : {}),
    ...(textColor
      ? {
          "--pub-ink": textColor,
          "--pub-ink-secondary": `color-mix(in srgb, ${textColor} 82%, transparent)`,
          "--pub-muted": `color-mix(in srgb, ${textColor} 68%, transparent)`,
        }
      : {}),
  } as CSSProperties;
  const currentViewLabel = embedViews.find(([path]) => path === view)?.[1] ?? "program";
  return (
    <div className={styles.embedRoot} data-theme={theme} style={customProperties}>
      <a className={styles.skipLink} href="#embed-content">
        Skip to {currentViewLabel.toLowerCase()}
      </a>
      <header className={styles.embedHeader}>
        <div className={styles.embedBar}>
          <span className={styles.embedBrand}>
            <span aria-hidden="true" className={styles.embedMark}>
              OS
            </span>
            <span className={styles.embedBrandName}>Eventloom</span>
            <span className={styles.embedBrandSmall}>Published program</span>
          </span>
          <nav aria-label="Published event views" className={styles.embedNav}>
            {embedViews.map(([path, label]) => (
              <a
                key={path}
                aria-current={view === path ? "page" : undefined}
                className={styles.embedNavLink}
                href={`/embed/${encodeURIComponent(eventSlug)}/${path}${viewQuery}`}
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
        <span>Program powered by Eventloom</span>
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
